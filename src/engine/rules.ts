import type { Card, Difficulty, GameState } from './types'

export const HAND_MINIMUM = 3
export const SWEEP_RUN = 4

const EASY_SPECIALS = [2, 10, 14]
const ADVANCED_SPECIALS = [2, 5, 7, 8, 10, 14]

export function specialsFor(difficulty: Difficulty): number[] {
  return difficulty === 'easy' ? EASY_SPECIALS : ADVANCED_SPECIALS
}

export function isSpecial(value: number, difficulty: Difficulty): boolean {
  return specialsFor(difficulty).includes(value)
}

/** Cards that ignore the pile's active value entirely. */
function isWild(value: number, difficulty: Difficulty): boolean {
  if (value === 2 || value === 14) return true
  return value === 5 && isSpecial(5, difficulty)
}

export interface Board {
  difficulty: Difficulty
  activeValue: number | null
  forceLower: boolean
}

export function boardOf(state: GameState): Board {
  return {
    difficulty: state.difficulty,
    activeValue: state.activeValue,
    forceLower: state.forceLower,
  }
}

export function canPlayValue(value: number, board: Board): boolean {
  const { difficulty, activeValue, forceLower } = board
  const empty = activeValue === null

  if (value === 10) return empty || activeValue < 10

  if (forceLower) return value <= 7 || isWild(value, difficulty)

  if (isWild(value, difficulty)) return true
  if (value === 7 && isSpecial(7, difficulty)) return empty || activeValue <= 7
  if (value === 8 && isSpecial(8, difficulty)) return empty || activeValue <= 8

  return empty || value >= activeValue
}

/**
 * The board state a play leaves behind, before sweeps are resolved.
 * Eights stack: each one skips the next seat still in the game.
 */
export function applyValueEffect(value: number, count: number, board: Board): {
  activeValue: number
  forceLower: boolean
  skips: number
} {
  const { difficulty } = board
  if (value === 2) return { activeValue: 2, forceLower: false, skips: 0 }
  if (value === 5 && isSpecial(5, difficulty)) {
    return { activeValue: board.activeValue ?? 0, forceLower: board.forceLower, skips: 0 }
  }
  if (value === 7 && isSpecial(7, difficulty)) {
    return { activeValue: 7, forceLower: true, skips: 0 }
  }
  if (value === 8 && isSpecial(8, difficulty)) {
    return { activeValue: 8, forceLower: false, skips: count }
  }
  return { activeValue: value, forceLower: false, skips: 0 }
}

/** True when the top of the pile is a run of four cards of one face value. */
export function completesFourOfAKind(pile: Card[]): boolean {
  if (pile.length < SWEEP_RUN) return false
  const top = pile[pile.length - 1].value
  for (let i = pile.length - SWEEP_RUN; i < pile.length; i++) {
    if (pile[i].value !== top) return false
  }
  return true
}

export function isSweep(pile: Card[], playedValue: number): boolean {
  return playedValue === 10 || completesFourOfAKind(pile)
}

export function playableZone(player: { hand: Card[]; faceUp: Card[]; faceDown: Card[] }):
  | 'hand'
  | 'faceUp'
  | 'faceDown'
  | null {
  if (player.hand.length > 0) return 'hand'
  if (player.faceUp.length > 0) return 'faceUp'
  if (player.faceDown.length > 0) return 'faceDown'
  return null
}
