import { describe, expect, it } from 'vitest'
import { applyAction } from '@/engine/game'
import { canPlayValue } from '@/engine/rules'
import { seat, stateOf } from './helpers'

const board = (activeValue: number | null, forceLower = false, difficulty: 'easy' | 'medium' | 'hard' = 'medium') => ({
  difficulty,
  activeValue,
  forceLower,
})

describe('special cards', () => {
  it('SPECIAL_ACE — an ace beats anything and leaves only an ace or a two to answer', () => {
    const state = stateOf({ seats: [{ id: 'a', hand: ['Ah'] }, { id: 'b' }], pile: ['Ks'], deck: [] })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h14'] })

    expect(result.error).toBeNull()
    expect(result.state.activeValue).toBe(14)
    expect(canPlayValue(14, board(14))).toBe(true)
    expect(canPlayValue(2, board(14))).toBe(true)
    expect(canPlayValue(13, board(14))).toBe(false)
    expect(canPlayValue(10, board(14))).toBe(false)
    expect(canPlayValue(5, board(14, false, 'easy'))).toBe(false)
    expect(canPlayValue(5, board(14, false, 'medium'))).toBe(true)
  })

  it('SPECIAL_2 — a two lands on anything and drops the pile back to two', () => {
    const state = stateOf({ seats: [{ id: 'a', hand: ['2h'] }, { id: 'b' }], pile: ['Ks'], deck: [] })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h2'] })

    expect(result.error).toBeNull()
    expect(result.state.activeValue).toBe(2)
    expect(canPlayValue(3, board(2))).toBe(true)
  })

  it('SPECIAL_5 — on an empty pile a five opens the board to any card', () => {
    const state = stateOf({ seats: [{ id: 'a', hand: ['5h'] }, { id: 'b' }], pile: [], deck: [] })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h5'] })

    expect(result.state.activeValue).toBe(0)
    expect(canPlayValue(3, board(0))).toBe(true)
  })

  it('SPECIAL_5 — on an eight it mirrors the eight but carries no skip', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['5h'] }, { id: 'b' }, { id: 'c' }],
      pile: ['8s'],
      activeValue: 8,
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h5'] })

    expect(result.state.activeValue).toBe(8)
    expect(result.state.activePlayerId).toBe('b')
    expect(canPlayValue(7, board(8))).toBe(false)
    expect(canPlayValue(9, board(8))).toBe(true)
  })

  it('SPECIAL_5 — on a seven it mirrors the seven and keeps the force-lower demand', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['5h'] }, { id: 'b' }],
      pile: ['7s'],
      activeValue: 7,
      forceLower: true,
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h5'] })

    expect(result.state.activeValue).toBe(7)
    expect(result.state.forceLower).toBe(true)
    expect(canPlayValue(9, board(7, true))).toBe(false)
    expect(canPlayValue(6, board(7, true))).toBe(true)
  })

  it('SPECIAL_5 — stacked fives keep mirroring the card that started the run', () => {
    const first = stateOf({
      seats: [{ id: 'a', hand: ['5h'] }, { id: 'b', hand: ['5c'] }],
      pile: ['Ks'],
      activeValue: 13,
      deck: [],
    })
    const afterFirst = applyAction(first, { type: 'playCards', playerId: 'a', cardIds: ['h5'] }).state
    expect(afterFirst.activeValue).toBe(13)

    const afterSecond = applyAction(afterFirst, { type: 'playCards', playerId: 'b', cardIds: ['c5'] }).state
    expect(afterSecond.activeValue).toBe(13)
  })

  it('SPECIAL_5 — a five is an ordinary card in easy mode', () => {
    expect(canPlayValue(5, board(9, false, 'easy'))).toBe(false)
    expect(canPlayValue(5, board(9, false, 'medium'))).toBe(true)
  })

  it('SPECIAL_7 — a seven needs a seven or lower beneath it and forces the answer low', () => {
    expect(canPlayValue(7, board(9))).toBe(false)
    expect(canPlayValue(7, board(6))).toBe(true)

    const state = stateOf({ seats: [{ id: 'a', hand: ['7h'] }, { id: 'b' }], pile: ['6s'], deck: [] })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h7'] })

    expect(result.state.forceLower).toBe(true)
    expect(result.state.activeValue).toBe(7)
    expect(canPlayValue(9, board(7, true))).toBe(false)
    expect(canPlayValue(4, board(7, true))).toBe(true)
    expect(canPlayValue(14, board(7, true))).toBe(true)
    expect(canPlayValue(2, board(7, true))).toBe(true)
    expect(canPlayValue(5, board(7, true))).toBe(true)
  })

  it('SPECIAL_7 — the force-lower demand clears as soon as an ordinary card lands', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['4h'] }, { id: 'b' }],
      pile: ['7s'],
      activeValue: 7,
      forceLower: true,
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h4'] })
    expect(result.state.forceLower).toBe(false)
    expect(result.state.activeValue).toBe(4)
  })

  it('SPECIAL_8 — an eight needs an eight or lower beneath it and skips the next player', () => {
    expect(canPlayValue(8, board(9))).toBe(false)
    expect(canPlayValue(8, board(8))).toBe(true)

    const state = stateOf({
      seats: [{ id: 'a', hand: ['8h'] }, { id: 'b' }, { id: 'c' }],
      pile: ['6s'],
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h8'] })

    expect(result.state.activePlayerId).toBe('c')
    expect(result.events).toContainEqual({ type: 'PlayerSkipped', playerId: 'b' })
  })

  it('SPECIAL_8 — a stack of eights still skips exactly one player', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['8h', '8c', 'Kd'] }, { id: 'b' }, { id: 'c' }],
      pile: ['6s'],
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h8', 'c8'] })
    expect(result.state.activePlayerId).toBe('c')
  })

  it('SPECIAL_8 — in a two-player game any number of eights hands the turn straight back', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['8h', '8c', '8s', 'Kd'] }, { id: 'b' }],
      pile: ['6s'],
      deck: [],
    })
    for (const throwing of [['h8'], ['h8', 'c8'], ['h8', 'c8', 's8']]) {
      const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: throwing })
      expect(result.error).toBeNull()
      expect(result.state.activePlayerId).toBe('a')
    }
  })

  it('SPECIAL_10 — a ten sweeps the pile to the graveyard and the player goes again', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['10h', '4c'] }, { id: 'b' }],
      pile: ['3s', '9d'],
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h10'] })

    expect(result.state.pile).toHaveLength(0)
    expect(result.state.graveyard).toHaveLength(3)
    expect(result.state.activeValue).toBeNull()
    expect(result.state.activePlayerId).toBe('a')
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'PileSwept', playerId: 'a' }))
  })

  it('SPECIAL_10 — a ten is blocked once the pile reaches ten or higher', () => {
    expect(canPlayValue(10, board(null))).toBe(true)
    expect(canPlayValue(10, board(9))).toBe(true)
    expect(canPlayValue(10, board(13))).toBe(false)
  })

  it('SWEEP_FOUR — four of one value stacked in a row burns the pile', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['4h', 'Kd'] }, { id: 'b' }],
      pile: ['4s', '4c', '4d'],
      activeValue: 4,
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h4'] })

    expect(result.state.pile).toHaveLength(0)
    expect(result.state.graveyard).toHaveLength(4)
    expect(result.state.activePlayerId).toBe('a')
  })

  it('SWEEP_FOUR — four of a kind thrown in one turn also burns the pile', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['7h', '7s', '7c', '7d'] }, { id: 'b' }],
      pile: ['5s'],
      activeValue: 5,
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h7', 's7', 'c7', 'd7'] })

    expect(result.state.pile).toHaveLength(0)
    expect(result.state.graveyard).toHaveLength(5)
  })

  it('SWEEP_FOUR — a mirrored run such as A,5,A,5 is not four of a kind', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['5c'] }, { id: 'b' }],
      pile: ['Ah', '5h', 'As'],
      activeValue: 14,
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['c5'] })

    expect(result.error).toBeNull()
    expect(result.state.pile).toHaveLength(4)
    expect(result.state.graveyard).toHaveLength(0)
  })

  it('a sweep still tops the hand back up to three', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['10h'] }, { id: 'b' }],
      pile: ['3s'],
      deck: ['4c', '6c', '9c'],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h10'] })
    expect(seat(result.state, 'a').hand).toHaveLength(3)
  })
})
