import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  RANK_LABEL,
  TURN_MS,
  getLegalMoves,
  isSpecial,
  playableZone,
  type Card,
  type GameEvent,
  type GameState,
  type PlayerState,
} from '@/engine'
import type { RoomSnapshot, SweepTransport } from '@/net/transport'
import { LeaveGame } from './LeaveGame'
import { CardBack, Digits, EmptySlot, PlayingCard, RankGlyph, SteelBall } from './PlayingCard'
import { PileRibbon } from './PileRibbon'
import { PlayLog, Ticker } from './PlayLog'
import { Result } from './Result'
import { ScreenFx, type Banner, type Blast, type Flight } from './ScreenFx'
import { shoutFor, type Shout } from './commentary'
import { demandOf } from './format'

const FLIGHT_MS = 440
const PLAY_STAGGER_MS = 80
const PICKUP_STAGGER_MS = 40
const MAX_PICKUP_GHOSTS = 7
/** How deep into the pile stays visible. Anything older is the ribbon's job. */
const PILE_SHOWN = 5

interface Rect {
  cx: number
  cy: number
  w: number
}

const EMPTY_REVEALS: Map<string, number> = new Map()

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function rectOf(el: Element | null | undefined): Rect | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width }
}

/** Deterministic per-card scatter so the pile reads as tossed, not fanned. */
function hashCardId(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return Math.abs(hash)
}

/**
 * Where a card sits once it has settled into the pile. The flight animation and
 * the rendered card both read this, which is what lets a ghost land exactly on
 * the pixel its real counterpart is about to occupy.
 */
function jitterOf(card: Card, depth: number) {
  const seed = hashCardId(card.id)
  return {
    jx: ((seed % 7) - 3) * (depth + 1),
    jy: (((seed >> 3) % 5) - 2) * (depth + 1),
    jr: ((seed >> 6) % 17) - 8,
  }
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

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
  const [flights, setFlights] = useState<Flight[]>([])
  const [blasts, setBlasts] = useState<Blast[]>([])
  const [banner, setBanner] = useState<Banner | null>(null)
  const [flash, setFlash] = useState<{ id: number; tone: Shout['tone'] } | null>(null)
  const [quake, setQuake] = useState<{ id: number; force: number } | null>(null)
  const [revealAt, setRevealAt] = useState<Map<string, number>>(EMPTY_REVEALS)

  const reduced = usePrefersReducedMotion()

  const lastLogId = useRef(-1)
  const seenLog = useRef(false)
  const flightSeq = useRef(0)
  const revealBatch = useRef(0)
  const timers = useRef<number[]>([])

  const pileRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLDivElement>(null)
  const seatRefs = useRef<Map<string, Element>>(new Map())
  const seatCallbacks = useRef<Map<string, (el: Element | null) => void>>(new Map())
  const cardRefs = useRef<Map<string, Element>>(new Map())
  const cardCallbacks = useRef<Map<string, (el: Element | null) => void>>(new Map())
  /** Rects grabbed the instant before a throw, while the cards are still on screen. */
  const thrownFrom = useRef<Map<string, Rect>>(new Map())
  /** Zone scales live in CSS; read once so flight scaling matches what is rendered. */
  const scales = useRef({ pile: 1.15, hand: 0.86, seat: 0.44 })
  const difficultyRef = useRef(game.difficulty)
  difficultyRef.current = game.difficulty

  useLayoutEffect(() => {
    const sync = () => {
      const style = getComputedStyle(document.documentElement)
      const read = (name: string, fallback: number) =>
        parseFloat(style.getPropertyValue(name)) || fallback
      scales.current = {
        pile: read('--scale-pile', 1.15),
        hand: read('--scale-hand', 0.86),
        seat: read('--scale-seat', 0.44),
      }
    }
    sync()
    // Re-read on resize so a breakpoint that retunes the zones can't leave the
    // flight animation scaling to the old ones.
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms)
    timers.current.push(id)
  }, [])

  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id)
    },
    [],
  )

  /** Stable per-id ref callbacks — inline closures would detach on every clock tick. */
  const registerSeat = useCallback((id: string) => {
    let cb = seatCallbacks.current.get(id)
    if (!cb) {
      cb = (el: Element | null) => {
        if (el) seatRefs.current.set(id, el)
        else seatRefs.current.delete(id)
      }
      seatCallbacks.current.set(id, cb)
    }
    return cb
  }, [])

  const registerCard = useCallback((id: string) => {
    let cb = cardCallbacks.current.get(id)
    if (!cb) {
      cb = (el: Element | null) => {
        if (el) cardRefs.current.set(id, el)
        else cardRefs.current.delete(id)
      }
      cardCallbacks.current.set(id, cb)
    }
    return cb
  }, [])

  const viewer = game.players.find((p) => p.playerId === viewerId)!
  const opponents = game.players.filter((p) => p.playerId !== viewerId)
  const isMyTurn = game.activePlayerId === viewerId
  const moves = useMemo(() => getLegalMoves(game, viewerId), [game, viewerId])
  const zone = playableZone(viewer)

  const playableValues = new Set(moves.filter((m) => m.kind === 'play').map((m) => m.value))
  const canTakePile = moves.some((m) => m.kind === 'pickUp')
  const mustFlip = zone === 'faceDown' && isMyTurn
  const demand = demandOf(game)
  const nameOf = useCallback(
    (id: string | null) => game.players.find((p) => p.playerId === id)?.name ?? 'Someone',
    [game],
  )

  useEffect(() => {
    setSelected([])
    // A rejected play leaves its captured rect behind. Once the turn moves the
    // hand may have been re-sorted, so any survivor now points at the wrong card.
    thrownFrom.current.clear()
  }, [game.turn, game.activePlayerId, viewerId])

  /** Where a player's cards come from, or go to, when we can't see the cards themselves. */
  const zoneRect = useCallback(
    (playerId: string, pileWidth: number): Rect | null => {
      const cardWidth = pileWidth / scales.current.pile
      if (playerId === viewerId) {
        const hand = rectOf(handRef.current)
        return hand && { ...hand, w: cardWidth * scales.current.hand }
      }
      const seat = rectOf(seatRefs.current.get(playerId))
      return seat && { ...seat, w: cardWidth * scales.current.seat }
    },
    [viewerId],
  )

  /**
   * Turns one event into the cards you see move. Shared by the live log and by
   * the pass-and-play replay, which shows the incoming player what they missed.
   */
  /**
   * `baseDelay` lets one event's flight start only once an earlier one in the
   * same batch has landed — a blind flip that misses fires `BlindFlipMissed`
   * then `PileTaken` in the same action, and the card has to visibly reach
   * the pile before the pickup ghosts carry the pile away. Returns the delay
   * the next event in the batch should start from.
   */
  const planFlights = useCallback(
    (event: GameEvent, pile: Rect, spawned: Flight[], reveals: Map<string, number>, baseDelay: number): number => {
      if (event.type === 'CardsPlayed') {
        const cards = event.cards
        let latest = baseDelay
        cards.forEach((card, i) => {
          const depth = cards.length - 1 - i
          const { jx, jy, jr } = jitterOf(card, depth)
          const from = thrownFrom.current.get(card.id) ?? zoneRect(event.playerId, pile.w)
          thrownFrom.current.delete(card.id)
          const delay = baseDelay + i * PLAY_STAGGER_MS
          spawned.push({
            id: `f${flightSeq.current++}`,
            card,
            special: isSpecial(card.value, difficultyRef.current),
            x0: from ? from.cx : pile.cx,
            y0: from ? from.cy : pile.cy - 90,
            x1: pile.cx + jx,
            y1: pile.cy + jy,
            r0: 0,
            r1: jr,
            s0: from ? from.w / pile.w : 0.6,
            s1: 1,
            delay,
            duration: FLIGHT_MS,
          })
          reveals.set(card.id, delay + FLIGHT_MS)
          latest = Math.max(latest, delay + FLIGHT_MS)
        })
        return latest
      } else if (event.type === 'BlindFlipMissed') {
        const card = event.card
        const from = thrownFrom.current.get(card.id) ?? zoneRect(event.playerId, pile.w)
        thrownFrom.current.delete(card.id)
        spawned.push({
          id: `f${flightSeq.current++}`,
          card,
          special: isSpecial(card.value, difficultyRef.current),
          x0: from ? from.cx : pile.cx,
          y0: from ? from.cy : pile.cy - 90,
          x1: pile.cx,
          y1: pile.cy,
          r0: 0,
          r1: 0,
          s0: from ? from.w / pile.w : 0.6,
          s1: 1,
          delay: baseDelay,
          duration: FLIGHT_MS,
        })
        return baseDelay + FLIGHT_MS
      } else if (event.type === 'PileTaken') {
        const to = zoneRect(event.playerId, pile.w)
        const ghosts = Math.min(event.count, MAX_PICKUP_GHOSTS)
        for (let i = 0; i < ghosts; i++) {
          const seed = scatterSeed(flightSeq.current + i)
          spawned.push({
            id: `f${flightSeq.current++}`,
            card: null,
            special: false,
            x0: pile.cx + ((seed % 7) - 3),
            y0: pile.cy + (((seed >> 3) % 5) - 2),
            x1: to ? to.cx + ((seed % 11) - 5) : pile.cx,
            y1: to ? to.cy : pile.cy + 120,
            r0: ((seed >> 6) % 17) - 8,
            r1: 0,
            s0: 1,
            s1: to ? to.w / pile.w : 0.6,
            delay: baseDelay + i * PICKUP_STAGGER_MS,
            duration: FLIGHT_MS,
          })
        }
        return baseDelay + Math.max(0, ghosts - 1) * PICKUP_STAGGER_MS + FLIGHT_MS
      }
      return baseDelay
    },
    [zoneRect],
  )

  const runFlights = useCallback(
    (spawned: Flight[], reveals: Map<string, number>) => {
      const impact = spawned.reduce((max, f) => Math.max(max, f.delay + f.duration), 0)
      if (spawned.length > 0) {
        setFlights((prev) => [...prev, ...spawned])
        const ids = new Set(spawned.map((f) => f.id))
        later(() => setFlights((prev) => prev.filter((f) => !ids.has(f.id))), impact + 90)
      }
      if (reveals.size > 0) {
        const batch = ++revealBatch.current
        setRevealAt(reveals)
        later(() => {
          if (revealBatch.current === batch) setRevealAt(EMPTY_REVEALS)
        }, impact + 260)
      }
      return impact
    },
    [later],
  )

  useLayoutEffect(() => {
    if (!seenLog.current) {
      seenLog.current = true
      lastLogId.current = room.log.at(-1)?.id ?? -1
      return
    }
    const fresh = room.log.filter((entry) => entry.id > lastLogId.current)
    if (fresh.length === 0) return
    lastLogId.current = room.log.at(-1)!.id

    // Measure before anything shakes: a quake transforms the board, and every
    // coordinate below is read straight off the viewport.
    const pile = rectOf(pileRef.current)
    const spawned: Flight[] = []
    const reveals = new Map<string, number>()
    let loudest: Banner | null = null
    let cursor = 0

    for (const entry of fresh) {
      const shout = shoutFor(entry.event, entry.id, game.difficulty, nameOf)
      if (shout && (!loudest || shout.force >= loudest.force)) loudest = { ...shout, id: entry.id }
      if (!reduced && pile) cursor = planFlights(entry.event, pile, spawned, reveals, cursor)
    }

    // The screen reacts when the cards actually land, not when the packet arrives.
    const impact = runFlights(spawned, reveals)

    if (loudest) {
      const shout = loudest
      later(() => {
        setBanner(shout)
        if (shout.force >= 2 && !reduced) {
          setQuake({ id: shout.id, force: shout.force })
          setFlash({ id: shout.id, tone: shout.tone })
          if (pile) setBlasts((prev) => [...prev, { id: shout.id, tone: shout.tone, x: pile.cx, y: pile.cy }])
          later(() => setBlasts((prev) => prev.filter((b) => b.id !== shout.id)), 720)
          later(() => setQuake((q) => (q?.id === shout.id ? null : q)), 460)
          later(() => setFlash((f) => (f?.id === shout.id ? null : f)), 340)
        }
        later(
          () => setBanner((b) => (b?.id === shout.id ? null : b)),
          shout.force >= 3 ? 1700 : shout.force >= 2 ? 1300 : 950,
        )
      }, impact)
    }
    // Log entries are the only trigger; game/viewer are read from the same commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.log])

  useLayoutEffect(() => {
    if (replayLogId == null) return
    const entry = room.log.find((e) => e.id === replayLogId)
    const pile = rectOf(pileRef.current)
    if (entry && pile && !reduced) {
      const spawned: Flight[] = []
      const reveals = new Map<string, number>()
      planFlights(entry.event, pile, spawned, reveals, 0)
      runFlights(spawned, reveals)
    }
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
    // Grab the source rects while the cards are still in the hand — a moment
    // later they are gone from the DOM and the flight would have to guess.
    for (const id of chosen) {
      const rect = rectOf(cardRefs.current.get(id))
      if (rect) thrownFrom.current.set(id, rect)
    }
    void send(transport.dispatch({ type: 'playCards', playerId: viewerId, cardIds: chosen }))
  }

  const chosenValue = chosen.length > 0 ? owned.find((c) => c.id === chosen[0])?.value : undefined
  const quakeStyle = quake
    ? ({ animationName: quake.id % 2 === 0 ? 'quakeA' : 'quakeB', '--force': quake.force } as React.CSSProperties)
    : undefined

  return (
    <>
      <div className={`cabinet ${quake ? 'quaking' : ''}`} style={quakeStyle} aria-hidden="true" />

      <main className={`table ${isMyTurn ? 'table--live' : ''} ${quake && quake.force >= 3 ? 'quaking' : ''}`} style={quake && quake.force >= 3 ? quakeStyle : undefined}>
        <header className="rail">
          <span className="rail__mark">
            <SteelBall className="rail__ball" />
            Sweep
          </span>
          <span className="rail__code">{room.lobby?.code}</span>
          <span className="rail__mode">{game.difficulty}</span>
          <LeaveGame
            transport={transport}
            rivals={game.players.filter((p) => !p.isFinished && !p.hasLeft && p.playerId !== viewerId).length}
          />
        </header>

        <section className="seats" aria-label="Other players">
          {opponents.map((player) => (
            <OpponentSeat
              key={player.playerId}
              player={player}
              difficulty={game.difficulty}
              active={game.activePlayerId === player.playerId}
              secondsLeft={game.activePlayerId === player.playerId ? secondsLeft : null}
              seatRef={registerSeat(player.playerId)}
            />
          ))}
        </section>

        <section className="board">
          <Ticker room={room} game={game} />

          <div className="board__row">
            <Stack label="Deck" count={game.deck.length} />
            <div className="pileWrap">
              <span className="pileBed" aria-hidden="true" />
              <div className="pile" ref={pileRef}>
                {game.pile.length === 0 ? (
                  <EmptySlot label="empty" />
                ) : (
                  game.pile.slice(-PILE_SHOWN).map((card, index, shown) => {
                    const depth = shown.length - 1 - index
                    const { jx, jy, jr } = jitterOf(card, depth)
                    const delay = revealAt.get(card.id)
                    return (
                      <div
                        key={card.id}
                        className={`pile__card ${delay === undefined ? '' : 'pile__card--incoming'}`}
                        style={
                          {
                            '--depth': depth,
                            '--jx': jx,
                            '--jy': jy,
                            '--jr': jr,
                            '--in-delay': delay === undefined ? undefined : `${delay}ms`,
                          } as React.CSSProperties
                        }
                      >
                        <PlayingCard card={card} special={isSpecial(card.value, game.difficulty)} />
                      </div>
                    )
                  })
                )}
              </div>
              {game.pile.length > 0 && (
                <span className="pile__count">
                  <Digits value={game.pile.length} label={`${plural(game.pile.length, 'card')} in the pile`} />
                </span>
              )}
            </div>
            <Stack label="Burnt" count={game.graveyard.length} muted />
          </div>

          <PileRibbon game={game} log={room.log} nameOf={nameOf} />

          <section className="dmd" aria-live="polite">
            {/* The glyph carries the value on screen; this carries it aloud. */}
            <p className="sr-only">
              {demand.spoken}. {demand.escapes}
            </p>
            <p className="dmd__line" aria-hidden="true">
              {demand.value !== null && <RankGlyph value={demand.value} className="dmd__glyph" />}
              <span className="dmd__words">{demand.headline}</span>
            </p>
            <p className="dmd__sub" aria-hidden="true">
              {demand.escapes}
            </p>
          </section>
        </section>

        <section className={`you ${isMyTurn ? 'you--active' : ''}`}>
          <div className="you__head">
            <span className="you__name">{viewer.name}</span>
            <span className="you__meta">
              {isMyTurn && secondsLeft !== null && <Clock seconds={secondsLeft} />}
              <span className="you__turn">{isMyTurn ? 'your throw' : `${nameOf(game.activePlayerId)} is thinking`}</span>
            </span>
          </div>

          <div className="tableau">
            <div className="tableau__cards">
              {tableSlots.length === 0 && <EmptySlot label="clear" />}
              {tableSlots.map(({ down, up }, i) => (
                <div key={down?.id ?? up?.id ?? i} className="tableau__slot">
                  {down && (
                    <div className="tableau__down">
                      {up ? (
                        <CardBack />
                      ) : mustFlip ? (
                        <button
                          type="button"
                          className="card card--back card--tappable card--flip"
                          ref={registerCard(down.id)}
                          onClick={() => {
                            const rect = rectOf(cardRefs.current.get(down.id))
                            if (rect) thrownFrom.current.set(down.id, rect)
                            void send(
                              transport.dispatch({ type: 'playFaceDownCard', playerId: viewerId, cardId: down.id }),
                            )
                          }}
                        >
                          <span className="card__count">flip</span>
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
                        special={isSpecial(up.value, game.difficulty)}
                        onClick={zone === 'faceUp' ? () => toggle(up) : undefined}
                        innerRef={registerCard(up.id)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="hand" aria-label="Your hand" ref={handRef}>
            {viewer.hand.map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                state={cardState(isMyTurn, playableValues.has(card.value))}
                selected={chosen.includes(card.id)}
                special={isSpecial(card.value, game.difficulty)}
                onClick={() => toggle(card)}
                innerRef={registerCard(card.id)}
              />
            ))}
            {viewer.hand.length === 0 && <EmptySlot label="empty" />}
          </div>

          <div className="actions">
            <button type="button" className="btn btn--go" disabled={chosen.length === 0} onClick={throwCards}>
              {chosen.length === 0
                ? 'Pick a card'
                : `Throw ${chosen.length > 1 ? `${chosen.length}× ` : ''}${RANK_LABEL[chosenValue ?? 0]}`}
            </button>
            <button
              type="button"
              className="btn btn--eat"
              disabled={!canTakePile}
              onClick={() => void send(transport.dispatch({ type: 'pickUpPile', playerId: viewerId }))}
            >
              Eat the pile{game.pile.length > 0 ? ` (${game.pile.length})` : ''}
            </button>
          </div>
          {mustFlip && <p className="hint hint--center">Nothing left but blind cards. Flip one and pray.</p>}
        </section>
      </main>

      <ScreenFx flights={flights} blasts={blasts} banner={banner} flash={flash} />
      <PlayLog room={room} game={game} />
      {game.phase === 'finished' && <Result game={game} onDone={() => void send(transport.returnToLobby())} />}
    </>
  )
}

function cardState(interactive: boolean, playable: boolean) {
  if (!interactive) return 'plain' as const
  return playable ? ('playable' as const) : ('dead' as const)
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
  return (
    <span className={`clock ${seconds <= 5 ? 'clock--urgent' : ''}`}>
      <Digits value={seconds} label={`${plural(seconds, 'second')} left`} />
    </span>
  )
}

function OpponentSeat({
  player,
  difficulty,
  active,
  secondsLeft,
  seatRef,
}: {
  player: PlayerState
  difficulty: GameState['difficulty']
  active: boolean
  secondsLeft: number | null
  seatRef: (el: Element | null) => void
}) {
  const slots = tableSlotsFor(player)
  return (
    <article className={`seat ${active ? 'seat--active' : ''} ${player.isFinished ? 'seat--out' : ''}`}>
      <header className="seat__head">
        <span className="seat__name">{player.name}</span>
        {secondsLeft !== null && <Clock seconds={secondsLeft} />}
        {player.isFinished ? (
          <span className="tag">out</span>
        ) : (
          <span className="seat__hand" ref={seatRef}>
            <Digits value={player.hand.length} label={`${plural(player.hand.length, 'card')} in hand`} />
          </span>
        )}
      </header>
      <div className="seat__cards">
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
                <PlayingCard card={up} special={isSpecial(up.value, difficulty)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </article>
  )
}
