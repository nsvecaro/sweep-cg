import { boardOf, canPlayValue, playableZone, type Card, type GameState, type PlayerState } from '@/engine'

/**
 * The finisher: the throw that empties your last zone gets a gesture of its
 * own instead of the ordinary Throw button. It changes nothing about the game
 * — the same cards go to the same pile — it only grades how well you timed the
 * release, and the screen answers in proportion.
 */
export type FinisherGrade = 'perfect' | 'great' | 'clean'

/** One full left-to-right-and-back pass of the timing marker. */
export const SWEEP_MS = 1400

/**
 * Bands are measured in "offset from the sweet spot": 0 dead centre, 1 at
 * either wall. They double as the meter's widths, since a band of width `w`
 * spans `w` of the track around the middle.
 */
export const PERFECT_BAND = 0.1
export const GREAT_BAND = 0.32

export interface Finisher {
  cards: Card[]
  value: number
  zone: 'hand' | 'faceUp'
}

/**
 * The play that would take this player out — nothing left to draw, nothing
 * face down, and one zone holding cards that are all the same value and legal
 * on the current board. Anything short of that returns null, so the gesture is
 * only ever offered for a throw that really does end it. Blind face-down flips
 * are deliberately excluded: that card might not even beat the pile.
 */
export function finisherFor(game: GameState, player: PlayerState): Finisher | null {
  if (game.phase !== 'playing' || game.activePlayerId !== player.playerId) return null
  if (game.deck.length > 0 || player.faceDown.length > 0) return null

  const zone = playableZone(player)
  if (zone !== 'hand' && zone !== 'faceUp') return null
  // Cards in the other zone would still be sitting there after the throw.
  if (zone === 'hand' && player.faceUp.length > 0) return null

  const cards = zone === 'hand' ? player.hand : player.faceUp
  if (cards.length === 0) return null

  const value = cards[0].value
  if (cards.some((card) => card.value !== value)) return null
  if (!canPlayValue(value, boardOf(game))) return null

  return { cards, value, zone }
}

/** Where the marker sits `elapsed` ms in: 0 at the left wall, 1 at the right. */
export function sweepAt(elapsed: number): number {
  const phase = (elapsed % SWEEP_MS) / SWEEP_MS
  return phase < 0.5 ? phase * 2 : 2 - phase * 2
}

export function gradeAt(position: number): FinisherGrade {
  const offset = Math.abs(position - 0.5) * 2
  if (offset <= PERFECT_BAND) return 'perfect'
  if (offset <= GREAT_BAND) return 'great'
  return 'clean'
}

export const GRADE_LABEL: Record<FinisherGrade, string> = {
  perfect: 'PERFECT SWEEP',
  great: 'CLEAN HIT',
  clean: 'OUT ANYWAY',
}

/** How hard the screen answers: blast size, shake, stinger and buzz all read this. */
export const GRADE_FORCE: Record<FinisherGrade, 1 | 2 | 3> = { perfect: 3, great: 2, clean: 1 }

export const GRADE_BUZZ: Record<FinisherGrade, number | number[]> = {
  perfect: [0, 45, 35, 110],
  great: [0, 30, 45, 60],
  clean: 40,
}

/**
 * Two endings, not three. Anything that lands on green — either band — throws
 * the party; falling off the track entirely gets laughed at. The grade still
 * separates `perfect` from `great` inside the party (louder banner, bigger
 * shake), it just doesn't change which ending plays.
 */
export type FinisherEnding = 'hit' | 'miss'

export function endingFor(grade: FinisherGrade): FinisherEnding {
  return grade === 'clean' ? 'miss' : 'hit'
}

/** Cards leave your hand and land together — one impact, not a polite fan. */
export const SLAM_MS = 260
export const SLAM_STAGGER_MS = 40

/** How long the ending holds the screen before anything else may interrupt. */
export const FINALE_MS = 1500

/**
 * The pop-up waits this long after the ending finishes. The whole point of the
 * finisher is the moment it lands; a results panel on top of it throws that away.
 */
export const RESULT_DELAY_MS = 1500

/** Kept deliberately clean of hard profanity — dial it up here if you want it filthier. */
const MISS_LINES = [
  'BRO DEADASS MISSED THE FINISHER',
  'THAT WAS RIGHT THERE. RIGHT THERE.',
  'CERTIFIED HANDS OF BUTTER',
  'YOU HAD ONE JOB. ONE.',
  'AIR. ABSOLUTE AIR.',
  'MY GRANDMOTHER TIMES IT BETTER',
  'BRICKED IT IN FRONT OF EVERYONE',
  'WON THE GAME, LOST THE RESPECT',
]

/** Deterministic per strike, so one release never flickers between two lines. */
export function missLine(seed: number): string {
  const hash = (Math.abs(seed) * 2654435761) >>> 0
  return MISS_LINES[hash % MISS_LINES.length]
}
