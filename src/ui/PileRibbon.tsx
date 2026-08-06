import { useEffect, useRef } from 'react'
import { RANK_LABEL, type Card, type GameState } from '@/engine'
import type { LogEntry } from '@/net/transport'
import { RankGlyph, isRedSuit } from './PlayingCard'

/**
 * A reading of the pile, because a tall pile hides everything but its top card.
 *
 * The live run comes from `game.pile` rather than the log: the log is capped at
 * eighty entries and carries draws and skips too, so a long hand can roll plays
 * out of it that are still sitting on the table. `game.pile` is the state the
 * server is authoritative about and cannot go stale.
 *
 * The dimmed run to its left is history, and history is allowed to be lossy —
 * it is only the breaks, and the pile empties on exactly two events.
 */
interface Break {
  kind: 'break'
  key: string
  reason: 'ten' | 'quad' | 'taken'
  count: number
  who: string
  /** Set when a 'taken' break was a blind flip that missed — the card everyone saw. */
  revealed?: number
}

interface Group {
  kind: 'group'
  key: string
  value: number
  count: number
  red: boolean
}

const HISTORY_LIMIT = 3

function breaksFrom(log: LogEntry[], nameOf: (id: string) => string): Break[] {
  const out: Break[] = []
  // A missed blind flip fires BlindFlipMissed immediately before the PileTaken
  // it causes — carry its value forward to label that one break with it.
  let revealed: number | undefined
  for (const entry of log) {
    const event = entry.event
    if (event.type === 'BlindFlipMissed') {
      revealed = event.card.value
      continue
    }
    if (event.type === 'PileSwept') {
      out.push({
        kind: 'break',
        key: `b${entry.id}`,
        reason: event.reason,
        count: event.cards.length,
        who: nameOf(event.playerId),
      })
    } else if (event.type === 'PileTaken') {
      out.push({
        kind: 'break',
        key: `b${entry.id}`,
        reason: 'taken',
        count: event.count,
        who: nameOf(event.playerId),
        revealed,
      })
    }
    revealed = undefined
  }
  return out.slice(-HISTORY_LIMIT)
}

/** Consecutive equal values were one throw, or read as one anyway. */
function groupsFrom(pile: Card[]): Group[] {
  const out: Group[] = []
  for (const card of pile) {
    const last = out.at(-1)
    if (last && last.value === card.value) last.count += 1
    else
      out.push({
        kind: 'group',
        key: card.id,
        value: card.value,
        count: 1,
        red: isRedSuit(card.suit),
      })
  }
  return out
}

export function PileRibbon({
  game,
  log,
  nameOf,
}: {
  game: GameState
  log: LogEntry[]
  nameOf: (id: string) => string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const history = breaksFrom(log, nameOf)
  const live = groupsFrom(game.pile)

  // Newest sits at the right edge, so that is where the view has to stay.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [game.pile.length, history.length])

  if (history.length === 0 && live.length === 0) {
    return (
      <div className="ribbonWrap">
        <span className="ribbon__tag">pile</span>
        <div className="ribbon ribbon--empty">
          <span className="ribbon__idle">nothing thrown yet</span>
        </div>
      </div>
    )
  }

  return (
    <div className="ribbonWrap">
      <span className="ribbon__tag">pile</span>
      <div className="ribbon" ref={scroller}>
        <ol className="ribbon__track" aria-label="Cards on the pile, oldest first">
        {history.map((item) => (
          <li key={item.key} className={`ribbon__break ribbon__break--${item.reason}`}>
            <span className="ribbon__breakLabel">
              {item.revealed !== undefined && (
                <RankGlyph
                  value={item.revealed}
                  className="ribbon__breakReveal"
                  label={`flipped ${RANK_LABEL[item.revealed]}`}
                />
              )}
              {item.reason === 'taken' ? 'took' : item.reason === 'quad' ? 'quad' : 'burnt'} {item.count}
            </span>
            <span className="ribbon__breakWho">{item.who}</span>
          </li>
        ))}
        {live.map((group) => (
          <li
            key={group.key}
            className={`ribbon__chip ${group.red ? 'ribbon__chip--red' : ''}`}
            aria-label={group.count > 1 ? `${group.count} × ${RANK_LABEL[group.value]}` : RANK_LABEL[group.value]}
          >
            <RankGlyph value={group.value} className="ribbon__rank" />
            {group.count > 1 && (
              <span className="ribbon__mult" aria-hidden="true">
                {group.count}
              </span>
            )}
          </li>
        ))}
        </ol>
      </div>
    </div>
  )
}
