import { buildDeck } from '@/engine/deck'
import type { Card, Difficulty, GameState, PlayerState, Suit } from '@/engine/types'

const RANKS: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11 }
const SUITS: Record<string, Suit> = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' }

/** "10h", "As", "7c" — ids match buildDeck() so deck conservation still holds. */
export function card(spec: string): Card {
  const suitChar = spec.slice(-1)
  const rank = spec.slice(0, -1)
  const value = RANKS[rank] ?? Number(rank)
  const suit = SUITS[suitChar]
  if (!suit || !Number.isFinite(value)) throw new Error(`Bad card spec: ${spec}`)
  return { id: `${suitChar}${value}`, suit, value }
}

export const cards = (...specs: string[]): Card[] => specs.map(card)
export const ids = (list: Card[]): string[] => list.map((c) => c.id)

export interface SeatSpec {
  id: string
  hand?: string[]
  faceUp?: string[]
  faceDown?: string[]
  isFinished?: boolean
}

export interface StateSpec {
  difficulty?: Difficulty
  seats: SeatSpec[]
  pile?: string[]
  graveyard?: string[]
  deck?: string[]
  activeValue?: number | null
  forceLower?: boolean
  activePlayerId?: string
  phase?: GameState['phase']
}

/** Builds an exact board. Any card not named goes back to the deck. */
export function stateOf(spec: StateSpec): GameState {
  const players: PlayerState[] = spec.seats.map((seat) => ({
    playerId: seat.id,
    name: seat.id,
    isBot: false,
    hand: cards(...(seat.hand ?? [])),
    faceUp: cards(...(seat.faceUp ?? [])),
    faceDown: cards(...(seat.faceDown ?? [])),
    isFinished: seat.isFinished ?? false,
  }))

  const pile = cards(...(spec.pile ?? []))
  const graveyard = cards(...(spec.graveyard ?? []))
  const used = new Set<string>()
  for (const list of [...players.map((p) => [...p.hand, ...p.faceUp, ...p.faceDown]), pile, graveyard]) {
    for (const c of list) used.add(c.id)
  }

  const deck = spec.deck ? cards(...spec.deck) : buildDeck().filter((c) => !used.has(c.id))

  return {
    difficulty: spec.difficulty ?? 'medium',
    phase: spec.phase ?? 'playing',
    deck,
    pile,
    graveyard,
    activeValue: spec.activeValue === undefined ? (pile.at(-1)?.value ?? null) : spec.activeValue,
    forceLower: spec.forceLower ?? false,
    players,
    activePlayerId: spec.activePlayerId ?? players[0].playerId,
    finishOrder: players.filter((p) => p.isFinished).map((p) => p.playerId),
    turn: 0,
    rng: 1,
    lastReveal: null,
  }
}

export function allCards(state: GameState): Card[] {
  return [
    ...state.deck,
    ...state.pile,
    ...state.graveyard,
    ...state.players.flatMap((p) => [...p.hand, ...p.faceUp, ...p.faceDown]),
  ]
}

export function seat(state: GameState, id: string): PlayerState {
  const player = state.players.find((p) => p.playerId === id)
  if (!player) throw new Error(`No seat ${id}`)
  return player
}
