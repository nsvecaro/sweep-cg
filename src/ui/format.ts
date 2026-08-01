import { RANK_LABEL, VALUES, boardOf, canPlayValue, isSpecial } from '@/engine'
import type { GameEvent, GameState } from '@/engine'

const WORDS: Record<number, string> = {
  0: 'Anything',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
  14: 'Ace',
}

export interface Demand {
  headline: string
  escapes: string
}

export function demandOf(state: GameState): Demand {
  const board = boardOf(state)
  if (board.activeValue === null || board.activeValue === 0) {
    return { headline: 'Open table', escapes: 'Throw whatever you like' }
  }

  const headline = board.forceLower
    ? 'Seven or lower'
    : board.activeValue === 14
      ? 'Ace only'
      : `${WORDS[board.activeValue]} or higher`

  const escapes = VALUES.filter(
    (v) =>
      isSpecial(v, state.difficulty) &&
      canPlayValue(v, board) &&
      (board.forceLower ? v > 7 : v < board.activeValue!),
  ).map((v) => RANK_LABEL[v])

  return {
    headline,
    escapes: escapes.length > 0 ? `${escapes.join(' · ')} still work` : 'No way around it',
  }
}

export function describeEvent(event: GameEvent, nameOf: (id: string) => string): string | null {
  switch (event.type) {
    case 'PlayerReady':
      return `${nameOf(event.playerId)} is ready`
    case 'CardsPlayed':
      return `${nameOf(event.playerId)} threw ${event.cards.map(short).join(' ')}`
    case 'PileSwept':
      return `${nameOf(event.playerId)} swept with ${sweepCause(event.reason)} — going again`
    case 'PileTaken':
      return `${nameOf(event.playerId)} took ${event.count} cards`
    case 'PlayerSkipped':
      return `${nameOf(event.playerId)} was skipped`
    case 'PlayerFinished':
      return `${nameOf(event.playerId)} is out — place ${event.place}`
    case 'PlayerLeft':
      return `${nameOf(event.playerId)} left the game`
    case 'GameOver':
      return event.loserId ? `${nameOf(event.loserId)} is left holding the cards` : 'Game over'
    case 'PlayRejected':
      return event.reason === 'Blind card missed' ? `${nameOf(event.playerId)} missed the blind flip` : null
    case 'CardsDrawn':
      return null
  }
}

function sweepCause(reason: 'ten' | 'quad'): string {
  return reason === 'ten' ? 'a 10' : '4 of a kind'
}

/** Punchy headline for throwing 2+ of a kind at once. */
export function burstLabel(count: number): string | null {
  switch (count) {
    case 2:
      return 'Double Trouble!'
    case 3:
      return 'Triple Threat!'
    case 4:
      return 'Quadzilla!!'
    default:
      return null
  }
}

export function sweepLabel(name: string, reason: 'ten' | 'quad'): string {
  return `${name} swept with ${sweepCause(reason)}`
}

function short(card: { value: number; suit: string }): string {
  const pip = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }[card.suit] ?? ''
  return `${RANK_LABEL[card.value]}${pip}`
}

export function ordinal(place: number): string {
  const suffix = place % 10 === 1 && place % 100 !== 11 ? 'st' : place % 10 === 2 && place % 100 !== 12 ? 'nd' : place % 10 === 3 && place % 100 !== 13 ? 'rd' : 'th'
  return `${place}${suffix}`
}
