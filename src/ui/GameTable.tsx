import { useEffect, useMemo, useRef, useState } from 'react'
import {
  RANK_LABEL,
  TURN_MS,
  getLegalMoves,
  playableZone,
  type Card,
  type GameState,
  type PlayerState,
} from '@/engine'
import type { RoomSnapshot, SweepTransport } from '@/net/transport'
import { LeaveGame } from './LeaveGame'
import { CardBack, EmptySlot, PlayingCard } from './PlayingCard'
import { PlayLog } from './PlayLog'
import { Result } from './Result'
import { burstLabel, demandOf, sweepLabel } from './format'

interface Announce {
  key: number
  kind: 'burst' | 'sweep' | 'timeout'
  text: string
}

const SPARKS = Array.from({ length: 8 }, (_, i) => i)

interface Props {
  transport: SweepTransport
  room: RoomSnapshot
  game: GameState
  viewerId: string
  onError: (message: string | null) => void
}

export function GameTable({ transport, room, game, viewerId, onError }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [flash, setFlash] = useState(false)
  const [announce, setAnnounce] = useState<Announce | null>(null)
  const lastLogId = useRef(-1)
  const seenLog = useRef(false)

  const viewer = game.players.find((p) => p.playerId === viewerId)!
  const opponents = game.players.filter((p) => p.playerId !== viewerId)
  const isMyTurn = game.activePlayerId === viewerId
  const moves = useMemo(() => getLegalMoves(game, viewerId), [game, viewerId])
  const zone = playableZone(viewer)

  const playableValues = new Set(moves.filter((m) => m.kind === 'play').map((m) => m.value))
  const canTakePile = moves.some((m) => m.kind === 'pickUp')
  const mustFlip = zone === 'faceDown' && isMyTurn
  const demand = demandOf(game)

  useEffect(() => setSelected([]), [game.turn, game.activePlayerId, viewerId])

  useEffect(() => {
    if (game.graveyard.length === 0) return
    setFlash(true)
    const timer = setTimeout(() => setFlash(false), 320)
    return () => clearTimeout(timer)
  }, [game.graveyard.length])

  useEffect(() => {
    if (!seenLog.current) {
      seenLog.current = true
      lastLogId.current = room.log.at(-1)?.id ?? -1
      return
    }
    const fresh = room.log.filter((entry) => entry.id > lastLogId.current)
    lastLogId.current = room.log.at(-1)?.id ?? lastLogId.current

    for (const entry of fresh) {
      const event = entry.event
      if (event.type === 'CardsPlayed') {
        const text = burstLabel(event.cards.length)
        if (text) setAnnounce({ key: entry.id, kind: 'burst', text })
      } else if (event.type === 'PileSwept') {
        setAnnounce({ key: entry.id, kind: 'sweep', text: sweepLabel(nameOf(game, event.playerId), event.reason) })
      } else if (event.type === 'PlayerTimedOut') {
        setAnnounce({ key: entry.id, kind: 'timeout', text: `${nameOf(game, event.playerId)} ran out of time!` })
      }
    }
  }, [room.log])

  useEffect(() => {
    if (!announce) return
    const timer = setTimeout(() => setAnnounce(null), announce.kind === 'sweep' ? 1700 : announce.kind === 'timeout' ? 1400 : 950)
    return () => clearTimeout(timer)
  }, [announce])

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (game.phase !== 'playing' || game.turnEndsAt === null) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [game.phase, game.turnEndsAt])

  const secondsLeft =
    game.turnEndsAt === null ? null : Math.ceil(Math.max(0, Math.min(TURN_MS, game.turnEndsAt - now)) / 1000)

  const tableSlots = tableSlotsFor(viewer)

  const owned = [...viewer.hand, ...viewer.faceUp]
  const chosen = selected.filter((id) => owned.some((c) => c.id === id))

  const toggle = (card: Card) => {
    if (!isMyTurn || !playableValues.has(card.value)) return
    setSelected(() => {
      if (chosen.includes(card.id)) return chosen.filter((id) => id !== card.id)
      const sameValue = chosen.every((id) => owned.find((c) => c.id === id)?.value === card.value)
      return sameValue ? [...chosen, card.id] : [card.id]
    })
  }

  const send = async (command: Promise<{ ok: true } | { ok: false; error: string }>) => {
    const result = await command
    onError(result.ok ? null : result.error)
  }

  const throwCards = () => {
    if (chosen.length === 0) return
    void send(transport.dispatch({ type: 'playCards', playerId: viewerId, cardIds: chosen }))
  }

  const chosenValue = chosen.length > 0 ? owned.find((c) => c.id === chosen[0])?.value : undefined

  return (
    <main className={`screen table ${flash ? 'table--flash' : ''}`}>
      <header className="table__rail">
        <span className="wordmark wordmark--tiny">Sweep</span>
        <span className="rail__meta">
          <span className="rail__code">{room.lobby?.code}</span>
          <span className="rail__mode">{game.difficulty}</span>
        </span>
        <LeaveGame transport={transport} rivals={game.players.filter((p) => !p.isFinished && !p.hasLeft && p.playerId !== viewerId).length} />
      </header>

      <section className="opponents" aria-label="Other players">
        {opponents.map((player) => (
          <OpponentSeat
            key={player.playerId}
            player={player}
            active={game.activePlayerId === player.playerId}
            secondsLeft={game.activePlayerId === player.playerId ? secondsLeft : null}
          />
        ))}
      </section>

      <section className="board">
        <div className="demand" aria-live="polite">
          <p
            key={announce?.key ?? 'default'}
            className={`demand__headline ${announce ? `demand__headline--${announce.kind}` : ''}`}
          >
            {announce ? announce.text : demand.headline}
          </p>
          <p className="demand__escapes">{demand.escapes}</p>
        </div>

        <div className="board__row">
          <Stack label="Deck" count={game.deck.length} />
          <div className="pile">
            {announce?.kind === 'burst' && (
              <span key={announce.key} className="pile__burst" aria-hidden="true">
                {SPARKS.map((i) => (
                  <i key={i} className="pile__spark" style={{ '--i': i } as React.CSSProperties} />
                ))}
              </span>
            )}
            {game.pile.length === 0 ? (
              <EmptySlot label="Empty" />
            ) : (
              game.pile.slice(-5).map((card, index, shown) => {
                const depth = shown.length - 1 - index
                const seed = hashCardId(card.id)
                return (
                  <div
                    key={card.id}
                    className="pile__card"
                    style={
                      {
                        '--depth': depth,
                        '--jx': ((seed % 7) - 3) * (depth + 1),
                        '--jy': (((seed >> 3) % 5) - 2) * (depth + 1),
                        '--jr': ((seed >> 6) % 17) - 8,
                      } as React.CSSProperties
                    }
                  >
                    <PlayingCard card={card} />
                  </div>
                )
              })
            )}
            {game.pile.length > 0 && <span className="pile__count">{game.pile.length}</span>}
          </div>
          <Stack label="Burned" count={game.graveyard.length} muted />
        </div>
      </section>

      <section className={`you ${isMyTurn ? 'you--active' : ''}`}>
        <div className="you__head">
          <span className="you__name">{viewer.name}</span>
          <span className="you__meta">
            {isMyTurn && secondsLeft !== null && <Clock seconds={secondsLeft} />}
            <span className="you__turn">{isMyTurn ? 'You’re up' : `${nameOf(game, game.activePlayerId)} is thinking`}</span>
          </span>
        </div>

        <div className="tableau">
          <span className="eyebrow">Table cards</span>
          <div className="tableau__cards">
            {tableSlots.length === 0 && <EmptySlot label="Clear" />}
            {tableSlots.map(({ down, up }, i) => (
              <div key={down?.id ?? up?.id ?? i} className="tableau__slot">
                {down && (
                  <div className="tableau__down">
                    {up ? (
                      <CardBack />
                    ) : mustFlip ? (
                      <button
                        type="button"
                        className="card card--back card--tappable"
                        onClick={() => void send(transport.dispatch({ type: 'playFaceDownCard', playerId: viewerId, cardId: down.id }))}
                      >
                        <span className="card__count">Flip</span>
                      </button>
                    ) : (
                      <CardBack />
                    )}
                  </div>
                )}
                {up && (
                  <div className="tableau__up">
                    <PlayingCard
                      card={up}
                      state={cardState(zone === 'faceUp' && isMyTurn, playableValues.has(up.value))}
                      selected={chosen.includes(up.id)}
                      onClick={zone === 'faceUp' ? () => toggle(up) : undefined}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="hand" aria-label="Your hand">
          {viewer.hand.map((card) => (
            <PlayingCard
              key={card.id}
              card={card}
              state={cardState(isMyTurn, playableValues.has(card.value))}
              selected={chosen.includes(card.id)}
              onClick={() => toggle(card)}
            />
          ))}
          {viewer.hand.length === 0 && <EmptySlot label="Empty" />}
        </div>

        <div className="actions">
          <button type="button" className="btn btn--primary" disabled={chosen.length === 0} onClick={throwCards}>
            {chosen.length === 0
              ? 'Choose a card'
              : `Throw ${chosen.length > 1 ? `${chosen.length} × ` : ''}${RANK_LABEL[chosenValue ?? 0]}`}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={!canTakePile}
            onClick={() => void send(transport.dispatch({ type: 'pickUpPile', playerId: viewerId }))}
          >
            Take the pile{game.pile.length > 0 ? ` (${game.pile.length})` : ''}
          </button>
        </div>
        {mustFlip && <p className="hint hint--center">Nothing left but the blind cards. Flip one and hope.</p>}
      </section>

      <PlayLog room={room} game={game} />
      {game.phase === 'finished' && <Result game={game} onDone={() => void send(transport.returnToLobby())} />}
    </main>
  )
}

/** Deterministic per-card scatter so the pile reads as tossed, not fanned. */
function hashCardId(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function cardState(interactive: boolean, playable: boolean) {
  if (!interactive) return 'plain' as const
  return playable ? ('playable' as const) : ('dead' as const)
}

function nameOf(game: GameState, playerId: string | null): string {
  return game.players.find((p) => p.playerId === playerId)?.name ?? 'Someone'
}

/** Face-up sits on top of face-down as a group — the two arrays aren't paired card-for-card. */
function tableSlotsFor(player: PlayerState): { down?: Card; up?: Card }[] {
  const count = Math.max(player.faceDown.length, player.faceUp.length)
  return Array.from({ length: count }, (_, i) => ({
    down: player.faceDown[i],
    up: player.faceUp[i],
  }))
}

function Stack({ label, count, muted = false }: { label: string; count: number; muted?: boolean }) {
  return (
    <div className={`stack ${muted ? 'stack--muted' : ''}`}>
      {count > 0 ? <CardBack count={count} /> : <EmptySlot label="—" />}
      <span className="stack__label">{label}</span>
    </div>
  )
}

function Clock({ seconds }: { seconds: number }) {
  return <span className={`clock ${seconds <= 5 ? 'clock--urgent' : ''}`}>{seconds}s</span>
}

function OpponentSeat({
  player,
  active,
  secondsLeft,
}: {
  player: PlayerState
  active: boolean
  secondsLeft: number | null
}) {
  const slots = tableSlotsFor(player)
  return (
    <article className={`seat ${active ? 'seat--active' : ''} ${player.isFinished ? 'seat--out' : ''}`}>
      <header className="seat__head">
        <span className="seat__name">{player.name}</span>
        <span className="seat__meta">
          {secondsLeft !== null && <Clock seconds={secondsLeft} />}
          {player.isFinished ? <span className="tag">Out</span> : <span className="seat__hand">{player.hand.length}</span>}
        </span>
      </header>
      <div className="seat__cards tableau__cards">
        {slots.length === 0 && !player.isFinished && <span className="seat__empty">table clear</span>}
        {slots.map(({ down, up }, i) => (
          <div key={down?.id ?? up?.id ?? i} className="tableau__slot">
            {down && (
              <div className="tableau__down">
                <CardBack />
              </div>
            )}
            {up && (
              <div className="tableau__up">
                <PlayingCard card={up} />
              </div>
            )}
          </div>
        ))}
      </div>
    </article>
  )
}
