import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RANK_LABEL,
  TURN_MS,
  getLegalMoves,
  playableZone,
  type Card,
  type GameEvent,
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

interface Flight {
  id: string
  card: Card | null
  x0: number
  y0: number
  x1: number
  y1: number
  delay: number
  r0: number
  r1: number
}

const SPARKS = Array.from({ length: 8 }, (_, i) => i)

/** Kept in step with the `flightMove` CSS animation's own duration. */
const FLIGHT_MS = 620
const PLAY_STAGGER_MS = 70
const PICKUP_STAGGER_MS = 45
const MAX_PICKUP_GHOSTS = 8

function centerOf(el: Element | null | undefined): { x: number; y: number } | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/** A pickup's individual cards aren't in the event — scatter the backs deterministically instead. */
function scatterSeed(n: number) {
  let hash = (n + 1) * 2654435761
  hash = (hash ^ (hash >>> 15)) >>> 0
  return hash
}

interface Props {
  transport: SweepTransport
  room: RoomSnapshot
  game: GameState
  viewerId: string
  onError: (message: string | null) => void
  /** Set once, on a fresh mount, to replay a past play/pickup for a player who just took the device. */
  replayLogId?: number | null
  onReplayConsumed?: () => void
}

export function GameTable({ transport, room, game, viewerId, onError, replayLogId = null, onReplayConsumed }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [flash, setFlash] = useState(false)
  const [announce, setAnnounce] = useState<Announce | null>(null)
  const [flights, setFlights] = useState<Flight[]>([])
  const lastLogId = useRef(-1)
  const seenLog = useRef(false)
  const flightSeq = useRef(0)
  const pileRef = useRef<HTMLDivElement>(null)
  const nameRefs = useRef<Map<string, Element>>(new Map())
  const nameRefCallbacks = useRef<Map<string, (el: Element | null) => void>>(new Map())

  /** Stable per-id ref callback — an inline closure here would detach/reattach every render (the 250ms clock tick included). */
  const registerName = useCallback((id: string) => {
    let cb = nameRefCallbacks.current.get(id)
    if (!cb) {
      cb = (el: Element | null) => {
        if (el) nameRefs.current.set(id, el)
        else nameRefs.current.delete(id)
      }
      nameRefCallbacks.current.set(id, cb)
    }
    return cb
  }, [])

  const spawnFlight = (playerId: string, direction: 'toPile' | 'fromPile', cards: Card[] | null, count: number) => {
    const pile = centerOf(pileRef.current)
    const seat = centerOf(nameRefs.current.get(playerId))
    if (!pile || !seat) return

    const shown: (Card | null)[] = cards ?? Array.from({ length: Math.min(count, MAX_PICKUP_GHOSTS) }, () => null)
    const stagger = direction === 'toPile' ? PLAY_STAGGER_MS : PICKUP_STAGGER_MS
    const from = direction === 'toPile' ? seat : pile
    const to = direction === 'toPile' ? pile : seat

    const spawned: Flight[] = shown.map((card, i) => {
      const seed = card ? hashCardId(card.id) : scatterSeed(flightSeq.current + i)
      return {
        id: `flight-${flightSeq.current++}`,
        card,
        x0: from.x,
        y0: from.y,
        x1: to.x + ((seed % 13) - 6),
        y1: to.y + (((seed >> 4) % 13) - 6),
        delay: i * stagger,
        r0: (seed % 17) - 8,
        r1: ((seed >> 5) % 17) - 8,
      }
    })

    setFlights((prev) => [...prev, ...spawned])
    const life = FLIGHT_MS + spawned.length * stagger
    window.setTimeout(() => {
      setFlights((prev) => prev.filter((f) => !spawned.some((s) => s.id === f.id)))
    }, life)
  }

  const spawnFlightForEvent = (event: GameEvent) => {
    if (event.type === 'CardsPlayed') spawnFlight(event.playerId, 'toPile', event.cards, event.cards.length)
    else if (event.type === 'PileTaken') spawnFlight(event.playerId, 'fromPile', null, event.count)
  }

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
      spawnFlightForEvent(event)
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

  useEffect(() => {
    if (replayLogId == null) return
    const entry = room.log.find((e) => e.id === replayLogId)
    if (entry) spawnFlightForEvent(entry.event)
    onReplayConsumed?.()
    // Fires once per replayLogId the parent hands us — not a dependency loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayLogId])

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
            nameRef={registerName(player.playerId)}
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
          <div className="pile" ref={pileRef}>
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
          <span className="you__name" ref={registerName(viewerId)}>{viewer.name}</span>
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

      <div className="flight-layer" aria-hidden="true">
        {flights.map((f) => (
          <div
            key={f.id}
            className="flight"
            style={
              {
                '--x0': f.x0,
                '--y0': f.y0,
                '--x1': f.x1,
                '--y1': f.y1,
                '--r0': `${f.r0}deg`,
                '--r1': `${f.r1}deg`,
                animationDelay: `${f.delay}ms`,
              } as React.CSSProperties
            }
          >
            {f.card ? <PlayingCard card={f.card} scale={0.6} /> : <CardBack scale={0.6} />}
          </div>
        ))}
      </div>
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
  nameRef,
}: {
  player: PlayerState
  active: boolean
  secondsLeft: number | null
  nameRef: (el: Element | null) => void
}) {
  const slots = tableSlotsFor(player)
  return (
    <article className={`seat ${active ? 'seat--active' : ''} ${player.isFinished ? 'seat--out' : ''}`}>
      <header className="seat__head">
        <span className="seat__name" ref={nameRef}>{player.name}</span>
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
