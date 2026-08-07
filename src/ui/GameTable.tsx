import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
import { ScreenFx, type Banner, type Blast, type Finale, type Impact, type Flight, type Pulse } from './ScreenFx'
import { shoutFor, type Shout } from './commentary'
import { EmoteBubbles, type EmoteBubble } from './EmoteFx'
import { EmotePicker } from './EmotePicker'
import { FinisherZone } from './FinisherZone'
import {
  FINALE_MS,
  GRADE_BUZZ,
  GRADE_FORCE,
  GRADE_LABEL,
  RESULT_DELAY_MS,
  SLAM_MS,
  SLAM_STAGGER_MS,
  endingFor,
  finisherFor,
  missLine,
  type FinisherGrade,
} from './finisher'
import { demandOf } from './format'
import {
  isMuted,
  playFinaleHit,
  playFinaleMiss,
  playFinisherStinger,
  playSlam,
  playSoundForEvent,
  playYourTurnCue,
  subscribeMuted,
  toggleMuted,
} from './sound'
import { vibrate } from './haptics'

const FLIGHT_MS = 440
const PLAY_STAGGER_MS = 80
const PICKUP_STAGGER_MS = 40
const MAX_PICKUP_GHOSTS = 7
/** How deep into the pile stays visible. Anything older is the ribbon's job. */
const PILE_SHOWN = 5
/** A seat spamming reactions caps out at this many on screen at once. */
const MAX_EMOTES_PER_SEAT = 5
/** Taller than the widest bubble shape (the fire combo) so a stacked burst never touches itself. */
const EMOTE_STACK_GAP = 44

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
  const [pulses, setPulses] = useState<Pulse[]>([])
  const [banner, setBanner] = useState<Banner | null>(null)
  const [flash, setFlash] = useState<{ id: number; tone: Shout['tone'] } | null>(null)
  const [impactFrame, setImpactFrame] = useState<Impact | null>(null)
  const [finale, setFinale] = useState<Finale | null>(null)
  /** Set briefly when a slam lands, so the pile itself takes the hit. */
  const [pileSlam, setPileSlam] = useState(0)
  /** The results panel is held back until the ending has had the screen. */
  const [showResult, setShowResult] = useState(false)
  const [quake, setQuake] = useState<{ id: number; force: number; big?: boolean } | null>(null)
  const [revealAt, setRevealAt] = useState<Map<string, number>>(EMPTY_REVEALS)
  const [emoteBubbles, setEmoteBubbles] = useState<EmoteBubble[]>([])

  const reduced = usePrefersReducedMotion()

  const lastLogId = useRef(-1)
  const seenLog = useRef(false)
  const lastEmoteId = useRef(-1)
  const seenEmotes = useRef(false)
  const flightSeq = useRef(0)
  /** Finisher effects fire on your gesture, before any log entry exists — negative ids
      so they can never collide with the log-id keyed blasts and banners. */
  const finisherSeq = useRef(0)
  /** Cards mid-slam. `planFlights` reads this to know a throw is a finisher. */
  const slamIds = useRef<Set<string>>(new Set())
  /** The grade of a finisher already dispatched, waiting for its cards to land. */
  const pendingEnding = useRef<FinisherGrade | null>(null)
  /** When the running animation finishes — the results panel queues behind it. */
  const busyUntil = useRef(0)
  const revealBatch = useRef(0)
  const timers = useRef<number[]>([])

  const pileRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLDivElement>(null)
  const youRef = useRef<HTMLDivElement>(null)
  const seatRefs = useRef<Map<string, Element>>(new Map())
  const seatCallbacks = useRef<Map<string, (el: Element | null) => void>>(new Map())
  /** The outer seat card, for anchoring emotes below a player rather than at their hand count. */
  const seatAnchorRefs = useRef<Map<string, Element>>(new Map())
  const seatAnchorCallbacks = useRef<Map<string, (el: Element | null) => void>>(new Map())
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

  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false)

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

  const registerSeatAnchor = useCallback((id: string) => {
    let cb = seatAnchorCallbacks.current.get(id)
    if (!cb) {
      cb = (el: Element | null) => {
        if (el) seatAnchorRefs.current.set(id, el)
        else seatAnchorRefs.current.delete(id)
      }
      seatAnchorCallbacks.current.set(id, cb)
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

  const wasMyTurn = useRef(isMyTurn)
  useEffect(() => {
    if (isMyTurn && !wasMyTurn.current) {
      playYourTurnCue()
      vibrate(45)
    }
    wasMyTurn.current = isMyTurn
  }, [isMyTurn])

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
        // A finisher throw doesn't drift in — it slams, all cards arriving as
        // one hit, so the ending has a single frame to detonate on.
        const slam = cards.some((card) => slamIds.current.has(card.id))
        const stagger = slam ? SLAM_STAGGER_MS : PLAY_STAGGER_MS
        const travel = slam ? SLAM_MS : FLIGHT_MS
        cards.forEach((card, i) => {
          const depth = cards.length - 1 - i
          const { jx, jy, jr } = jitterOf(card, depth)
          const from = thrownFrom.current.get(card.id) ?? zoneRect(event.playerId, pile.w)
          thrownFrom.current.delete(card.id)
          const delay = baseDelay + i * stagger
          spawned.push({
            id: `f${flightSeq.current++}`,
            card,
            special: isSpecial(card.value, difficultyRef.current),
            slam,
            x0: from ? from.cx : pile.cx,
            y0: from ? from.cy : pile.cy - 90,
            x1: pile.cx + jx,
            y1: pile.cy + jy,
            r0: 0,
            r1: jr,
            s0: from ? from.w / pile.w : 0.6,
            s1: 1,
            delay,
            duration: travel,
          })
          reveals.set(card.id, delay + travel)
          latest = Math.max(latest, delay + travel)
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
    /** One small answer per play, fired when that play's own cards land. */
    const beats: { pulse: Pulse; at: number; mine: boolean }[] = []

    for (const entry of fresh) {
      const shout = shoutFor(entry.event, entry.id, game.difficulty, nameOf)
      playSoundForEvent(entry.event, shout)
      if (shout && (!loudest || shout.force >= loudest.force)) loudest = { ...shout, id: entry.id }
      if (!reduced && pile) cursor = planFlights(entry.event, pile, spawned, reveals, cursor)

      // Plays are the events that can otherwise pass in silence — the loud ones
      // already earn a blast. Everything that reaches the pile gets this.
      const event = entry.event
      if (pile && (event.type === 'CardsPlayed' || event.type === 'BlindFlipMissed')) {
        beats.push({
          pulse: {
            id: entry.id,
            tone: shout?.tone ?? 'hit',
            x: pile.cx,
            y: pile.cy,
            scale: event.type === 'CardsPlayed' ? event.cards.length : 1,
          },
          at: reduced ? 0 : cursor,
          mine: event.playerId === viewerId,
        })
      }
    }

    // The screen reacts when the cards actually land, not when the packet arrives.
    const impact = runFlights(spawned, reveals)

    // Nothing may put a panel over the table until the last card has landed.
    busyUntil.current = Math.max(busyUntil.current, Date.now() + impact)

    // A finisher we dispatched has come back off the log. Detonate on the frame
    // its cards hit the pile, and hold the results panel behind the whole show.
    const grade = pendingEnding.current
    if (grade && fresh.some((e) => e.event.type === 'PlayerFinished' && e.event.playerId === viewerId)) {
      pendingEnding.current = null
      slamIds.current = new Set()
      busyUntil.current = Math.max(busyUntil.current, Date.now() + impact + FINALE_MS)
      later(() => runEnding(grade), impact)
      // The ordinary "OUT! CLEAN HANDS" shout would talk over the ending.
      loudest = null
    }

    for (const beat of beats) {
      later(() => {
        setPulses((prev) => [...prev, beat.pulse])
        if (beat.mine) vibrate(10)
        later(() => setPulses((prev) => prev.filter((p) => p.id !== beat.pulse.id)), 560)
      }, beat.at)
    }

    if (loudest) {
      const shout = loudest
      // Bigger stack -> bigger blast, and it earns more time on screen to match.
      const stretch = 0.82 + shout.scale * 0.16
      // Embers run much longer than the ring/shard shapes (900ms + up to 260ms
      // per-ember stagger vs. ~560ms) — the cleanup budget has to match the
      // CSS animation length in ScreenFx.tsx/app.css or embers get unmounted
      // mid-fade and the burn reads as no effect at all.
      const blastLifetime = (shout.tone === 'burn' ? 1180 : 720) * stretch
      later(() => {
        setBanner(shout)
        if (shout.force >= 2 && !reduced) {
          setQuake({ id: shout.id, force: shout.force })
          setFlash({ id: shout.id, tone: shout.tone })
          if (pile) {
            setBlasts((prev) => [...prev, { id: shout.id, tone: shout.tone, x: pile.cx, y: pile.cy, scale: shout.scale }])
          }
          later(() => setBlasts((prev) => prev.filter((b) => b.id !== shout.id)), blastLifetime)
          later(() => setQuake((q) => (q?.id === shout.id ? null : q)), 460 * stretch)
          later(() => setFlash((f) => (f?.id === shout.id ? null : f)), 340 * stretch)
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

  /**
   * The results panel queues behind whatever is still playing, then waits
   * another beat. Landing a finisher and having a panel drop on top of the
   * explosion half a frame later wastes the only moment the feature exists for.
   *
   * `busyUntil` is written by the log effect above. That's a layout effect, and
   * React runs every layout effect before any passive one, so by the time this
   * runs the ending's full length is already known.
   */
  useEffect(() => {
    if (game.phase !== 'finished') {
      setShowResult(false)
      return
    }
    const wait = Math.max(0, busyUntil.current - Date.now()) + RESULT_DELAY_MS
    const timer = window.setTimeout(() => setShowResult(true), wait)
    return () => window.clearTimeout(timer)
  }, [game.phase])

  useLayoutEffect(() => {
    if (!seenEmotes.current) {
      seenEmotes.current = true
      lastEmoteId.current = room.emotes.at(-1)?.id ?? -1
      return
    }
    const fresh = room.emotes.filter((entry) => entry.id > lastEmoteId.current)
    if (fresh.length === 0) return
    lastEmoteId.current = room.emotes.at(-1)!.id

    const spawned: EmoteBubble[] = []
    // Stacked per seat so a burst of taps rises as a column instead of one blob.
    const stackDepth = new Map<string, number>()
    for (const entry of fresh) {
      const el = entry.playerId === viewerId ? youRef.current : seatAnchorRefs.current.get(entry.playerId)
      if (!el) continue
      const box = el.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) continue
      const depth = stackDepth.get(entry.playerId) ?? 0
      stackDepth.set(entry.playerId, depth + 1)
      spawned.push({
        id: `e${entry.id}`,
        playerId: entry.playerId,
        emote: entry.emote,
        x: box.left + box.width / 2,
        y: box.bottom - depth * EMOTE_STACK_GAP,
      })
    }
    if (spawned.length === 0) return

    setEmoteBubbles((prev) => {
      let next = prev
      for (const bubble of spawned) {
        const active = next.filter((b) => b.playerId === bubble.playerId)
        if (active.length >= MAX_EMOTES_PER_SEAT) {
          const oldest = active[0].id
          next = next.filter((b) => b.id !== oldest)
        }
        next = [...next, bubble]
      }
      return next
    })
    const ids = new Set(spawned.map((b) => b.id))
    later(() => setEmoteBubbles((prev) => prev.filter((b) => !ids.has(b.id))), 1800)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.emotes])

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

  /**
   * One tap from the results screen back to a live game: clear the table, then
   * start the same countdown the lobby's Deal button would. Host-only, since
   * only the host may deal — if the room refuses either half, the error toast
   * says so and the player is already back in the lobby to sort it out.
   */
  const rematch = async () => {
    const cleared = await transport.returnToLobby()
    if (!cleared.ok) return onError(cleared.error)
    const dealt = await transport.startCountdown()
    onError(dealt.ok ? null : dealt.error)
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

  const finisher = useMemo(() => finisherFor(game, viewer), [game, viewer])

  /**
   * The ending, run when the slammed cards actually hit the pile — not when
   * you let go. Landing it and fumbling it get two entirely separate shows;
   * `endingFor` decides which, and only the grade inside a hit (perfect vs.
   * great) changes how hard it shakes.
   */
  const runEnding = useCallback(
    (grade: FinisherGrade) => {
      const kind = endingFor(grade)
      const id = --finisherSeq.current
      const text = kind === 'hit' ? GRADE_LABEL[grade] : missLine(id)

      setPileSlam(id)
      later(() => setPileSlam((p) => (p === id ? 0 : p)), 420)
      playSlam()
      if (kind === 'hit') playFinaleHit()
      else playFinaleMiss()
      vibrate(kind === 'hit' ? [0, 60, 40, 60, 40, 160] : [0, 90, 120, 90])

      if (reduced) {
        // No screen-wide motion, but the words still have to be said.
        setBanner({ id, who: viewer.name, text, tone: kind === 'hit' ? 'out' : 'take', force: 3, scale: 3 })
        later(() => setBanner((b) => (b?.id === id ? null : b)), FINALE_MS)
        return
      }

      setFinale({ id, kind, text })
      later(() => setFinale((f) => (f?.id === id ? null : f)), FINALE_MS)

      // Everything on the table shakes, hardest for a perfect.
      setQuake({ id, force: kind === 'hit' ? 3 + GRADE_FORCE[grade] : 4, big: true })
      later(() => setQuake((q) => (q?.id === id ? null : q)), 900)

      setFlash({ id, tone: kind === 'hit' ? 'out' : 'take' })
      later(() => setFlash((f) => (f?.id === id ? null : f)), 340)

      if (kind === 'hit') {
        setImpactFrame({ id, grade })
        later(() => setImpactFrame((f) => (f?.id === id ? null : f)), 320)
      }
    },
    [later, reduced, viewer.name],
  )

  /**
   * The gesture itself only arms things: it marks the cards as a slam, gives
   * an instant release cue so letting go feels answered, and dispatches. The
   * show waits for the cards to land — see `runEnding`.
   */
  const strikeFinisher = (grade: FinisherGrade) => {
    if (!finisher) return
    for (const card of finisher.cards) {
      const rect = rectOf(cardRefs.current.get(card.id))
      if (rect) thrownFrom.current.set(card.id, rect)
    }

    slamIds.current = new Set(finisher.cards.map((c) => c.id))
    pendingEnding.current = grade
    playFinisherStinger(grade)
    vibrate(GRADE_BUZZ[grade])

    void send(
      transport.dispatch({ type: 'playCards', playerId: viewerId, cardIds: finisher.cards.map((c) => c.id) }),
    )
  }

  const chosenValue = chosen.length > 0 ? owned.find((c) => c.id === chosen[0])?.value : undefined
  const quakeStyle = quake
    ? ({ animationName: quake.id % 2 === 0 ? 'quakeA' : 'quakeB', '--force': quake.force } as React.CSSProperties)
    : undefined
  /** A finale shakes the whole table however hard it hit; ordinary shouts only do it at force 3. */
  const tableQuakes = quake !== null && (quake.big === true || quake.force >= 3)
  const quakeClass = quake ? (quake.big ? 'quaking quaking--big' : 'quaking') : ''

  /**
   * Your table row and your hand. Pulled out because the finisher zone wraps
   * exactly this and nothing else — whichever of the two holds the last cards,
   * the other one is empty by the time a finisher is on offer. While the zone
   * owns the gesture the cards drop their own onClick, so a tap can't both
   * select a card and throw it.
   */
  /**
   * Lives in both layouts: its own row normally, and inside the finisher zone's
   * meter row during a finisher. There it has to stop its own pointer events —
   * otherwise reaching for it would release over the zone and throw the cards.
   */
  const eatButton = (
    <button
      type="button"
      className="btn btn--eat"
      disabled={!canTakePile}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={() => void send(transport.dispatch({ type: 'pickUpPile', playerId: viewerId }))}
    >
      Eat the pile{game.pile.length > 0 ? ` (${game.pile.length})` : ''}
    </button>
  )

  const cardZone = (
    <>
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
                    onClick={zone === 'faceUp' && !finisher ? () => toggle(up) : undefined}
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
            onClick={finisher ? undefined : () => toggle(card)}
            innerRef={registerCard(card.id)}
          />
        ))}
        {viewer.hand.length === 0 && <EmptySlot label="empty" />}
      </div>
    </>
  )

  return (
    <>
      <div className={`cabinet ${quakeClass}`} style={quakeStyle} aria-hidden="true" />

      <main
        className={`table ${isMyTurn ? 'table--live' : ''} ${tableQuakes ? quakeClass : ''}`}
        style={tableQuakes ? quakeStyle : undefined}
      >
        <header className="rail">
          <span className="rail__mark">
            <SteelBall className="rail__ball" />
            Sweep
          </span>
          <span className="rail__code">{room.lobby?.code}</span>
          <span className="rail__mode">{game.difficulty}</span>
          <button
            type="button"
            className="btn btn--tiny"
            aria-pressed={muted}
            onClick={() => toggleMuted()}
          >
            {muted ? 'Sound off' : 'Sound on'}
          </button>
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
              anchorRef={registerSeatAnchor(player.playerId)}
            />
          ))}
        </section>

        <section className="board">
          <Ticker room={room} game={game} />

          <div className="board__row">
            <Stack label="Deck" count={game.deck.length} />
            <div className="pileWrap">
              <span className="pileBed" aria-hidden="true" />
              <div className={`pile ${pileSlam ? 'pile--slammed' : ''}`} ref={pileRef}>
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

        <section className={`you ${isMyTurn ? 'you--active' : ''} ${finisher ? 'you--finisher' : ''}`}>
          <div className="you__head" ref={youRef}>
            <span className="you__name">{viewer.name}</span>
            <span className="you__meta">
              {isMyTurn && secondsLeft !== null && <Clock seconds={secondsLeft} />}
              <span className="you__turn">{isMyTurn ? 'your throw' : `${nameOf(game.activePlayerId)} is thinking`}</span>
            </span>
            <EmotePicker transport={transport} playerId={viewerId} onError={onError} />
          </div>

          {/* Wrapped by the finisher zone when a throw can end it, so the swipe
              lands on these very cards instead of on a second copy of them. The
              zone also swallows the actions row — the finisher throws the cards
              itself, and eating rides along in the meter's row, so the console
              keeps exactly the height it has the rest of the game. */}
          {finisher ? (
            <FinisherZone
              cards={finisher.cards}
              reduced={reduced}
              onStrike={strikeFinisher}
              aside={eatButton}
            >
              {cardZone}
            </FinisherZone>
          ) : (
            <>
              {cardZone}
              <div className="actions">
                <button type="button" className="btn btn--go" disabled={chosen.length === 0} onClick={throwCards}>
                  {chosen.length === 0
                    ? 'Pick a card'
                    : `Throw ${chosen.length > 1 ? `${chosen.length}× ` : ''}${RANK_LABEL[chosenValue ?? 0]}`}
                </button>
                {eatButton}
              </div>
            </>
          )}
          {mustFlip && <p className="hint hint--center">Nothing left but blind cards. Flip one and pray.</p>}
        </section>
      </main>

      <ScreenFx
        flights={flights}
        blasts={blasts}
        pulses={pulses}
        banner={banner}
        flash={flash}
        impact={impactFrame}
        finale={finale}
      />
      <EmoteBubbles bubbles={emoteBubbles} />
      <PlayLog room={room} game={game} />
      {game.phase === 'finished' && showResult && (
        <Result
          game={game}
          viewerId={viewerId}
          isHost={room.lobby?.hostId === room.selfId}
          onRematch={() => void rematch()}
          onDone={() => void send(transport.returnToLobby())}
        />
      )}
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
  anchorRef,
}: {
  player: PlayerState
  difficulty: GameState['difficulty']
  active: boolean
  secondsLeft: number | null
  seatRef: (el: Element | null) => void
  anchorRef: (el: Element | null) => void
}) {
  const slots = tableSlotsFor(player)
  return (
    <article
      className={`seat ${active ? 'seat--active' : ''} ${player.isFinished ? 'seat--out' : ''}`}
      ref={anchorRef}
    >
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
