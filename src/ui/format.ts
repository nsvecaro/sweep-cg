import { RANK_LABEL, VALUES, boardOf, canPlayValue, isSpecial } from '@/engine'
import type { GameEvent, GameState } from '@/engine'

const WORDS: Record<number, string> = {
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

/**
 * What you are allowed to throw, split so the display can set the value itself
 * as a card glyph and the rest as words — the readout reads `[10] OR HIGHER`.
 * `spoken` carries the same sentence intact, because the glyph is a drawing and
 * a live region cannot read a drawing.
 */
export interface Demand {
  value: number | null
  headline: string
  spoken: string
  escapes: string
}

export function demandOf(state: GameState): Demand {
  const board = boardOf(state)
  if (board.activeValue === null || board.activeValue === 0) {
    return {
      value: null,
      headline: 'Open table',
      spoken: 'Open table',
      escapes: 'Throw whatever you like',
    }
  }

  const demand: Demand = board.forceLower
    ? { value: 7, headline: 'or lower', spoken: 'Seven or lower', escapes: '' }
    : board.activeValue === 14
      ? { value: 14, headline: 'only', spoken: 'Ace only', escapes: '' }
      : {
          value: board.activeValue,
          headline: 'or higher',
          spoken: `${WORDS[board.activeValue]} or higher`,
          escapes: '',
        }

  const escapes = VALUES.filter(
    (v) =>
      isSpecial(v, state.difficulty) &&
      canPlayValue(v, board) &&
      (board.forceLower ? v > 7 : v < board.activeValue!),
  ).map((v) => RANK_LABEL[v])

  demand.escapes = escapes.length > 0 ? `${escapes.join(' · ')} still work` : 'No way around it'
  return demand
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
    case 'PlayerTimedOut':
      return `${nameOf(event.playerId)} ran out of time`
    case 'GameOver':
      return event.loserId ? `${nameOf(event.loserId)} is left holding the cards` : 'Game over'
    case 'BlindFlipMissed':
      return `${nameOf(event.playerId)} flipped a ${RANK_LABEL[event.card.value]} — pile eaten`
    case 'PlayRejected':
      return null
    case 'CardsDrawn':
      return null
  }
}

function sweepCause(reason: 'ten' | 'quad'): string {
  return reason === 'ten' ? 'a 10' : '4 of a kind'
}

function short(card: { value: number; suit: string }): string {
  const pip = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }[card.suit] ?? ''
  return `${RANK_LABEL[card.value]}${pip}`
}

export function ordinal(place: number): string {
  const suffix = place % 10 === 1 && place % 100 !== 11 ? 'st' : place % 10 === 2 && place % 100 !== 12 ? 'nd' : place % 10 === 3 && place % 100 !== 13 ? 'rd' : 'th'
  return `${place}${suffix}`
}
