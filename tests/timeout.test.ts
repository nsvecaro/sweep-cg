import { describe, expect, it } from 'vitest'
import { TURN_MS, applyAction, createGame } from '@/engine/game'
import { ids, stateOf, seat } from './helpers'

const NOW = 1_700_000_000_000

describe('Timeout', () => {
  it('TIMEOUT_PILE — a stalled player takes the pile and the turn passes', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['4h'] }, { id: 'b' }],
      pile: ['7s', '3c', '5d'],
      activeValue: 7,
      forceLower: true,
      deck: [],
    })
    const result = applyAction(state, { type: 'timeout', playerId: 'a' }, NOW)

    expect(result.error).toBeNull()
    expect(result.state.pile).toHaveLength(0)
    expect(result.state.activeValue).toBeNull()
    expect(result.state.forceLower).toBe(false)
    const seatA = result.state.players.find((p) => p.playerId === 'a')!
    expect(seatA.hand).toHaveLength(4)
    expect(result.state.activePlayerId).toBe('b')
    expect(result.events).toEqual([
      { type: 'PlayerTimedOut', playerId: 'a' },
      { type: 'PileTaken', playerId: 'a', count: 3 },
    ])
  })

  it('TIMEOUT_EMPTY — an empty pile still passes the turn, with no PileTaken event', () => {
    const state = stateOf({ seats: [{ id: 'a', hand: ['4h'] }, { id: 'b' }], pile: [], deck: [] })
    const result = applyAction(state, { type: 'timeout', playerId: 'a' }, NOW)

    expect(result.error).toBeNull()
    expect(result.state.activePlayerId).toBe('b')
    expect(result.events).toEqual([{ type: 'PlayerTimedOut', playerId: 'a' }])
  })

  it('TIMEOUT_BLIND — punishes a player stuck on a blind flip, bypassing the pick-up-pile restriction', () => {
    const state = stateOf({
      seats: [{ id: 'a', faceDown: ['9h'] }, { id: 'b' }],
      pile: ['3s'],
      deck: [],
    })
    const result = applyAction(state, { type: 'timeout', playerId: 'a' }, NOW)

    expect(result.error).toBeNull()
    expect(result.state.activePlayerId).toBe('b')
  })

  it('TIMEOUT_TURN — only the active player can be timed out', () => {
    const state = stateOf({ seats: [{ id: 'a', hand: ['9h'] }, { id: 'b', hand: ['9c'] }], pile: ['3s'] })
    expect(applyAction(state, { type: 'timeout', playerId: 'b' }, NOW).error).toMatch(/Not your turn/)
  })

  it('CLOCK — a successful action resets the deadline to now + TURN_MS', () => {
    const state = stateOf({ seats: [{ id: 'a', hand: ['9h'] }, { id: 'b' }], pile: ['3s'] })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h9'] }, NOW)
    expect(result.state.turnEndsAt).toBe(NOW + TURN_MS)
  })

  it('CLOCK — the deadline refreshes for a sweep even though the same player goes again', () => {
    const state = stateOf({
      seats: [{ id: 'a', faceDown: ['10h', '4c'] }, { id: 'b', hand: ['4h'] }],
      pile: ['3s'],
      deck: [],
      turnEndsAt: NOW - 5_000,
    })
    const later = NOW + 12_345
    const result = applyAction(state, { type: 'playFaceDownCard', playerId: 'a', cardId: 'h10' }, later)

    expect(result.state.activePlayerId).toBe('a')
    expect(result.state.turnEndsAt).toBe(later + TURN_MS)
  })

  it('CLOCK — a rejected action leaves the deadline untouched', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['9h'] }, { id: 'b' }],
      pile: ['3s'],
      turnEndsAt: NOW,
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h4'] }, NOW + 9_999)
    expect(result.error).toBeTruthy()
    expect(result.state.turnEndsAt).toBe(NOW)
  })

  it('CLOCK — no clock during setup; it starts the moment the last player is ready', () => {
    const roster = [
      { playerId: 'a', name: 'Ana' },
      { playerId: 'b', name: 'Bo' },
    ]
    const game = createGame({ difficulty: 'easy', players: roster, seed: 3, now: NOW })
    expect(game.turnEndsAt).toBeNull()

    const aChoice = ids(seat(game, 'a').hand.slice(0, 3))
    const afterOne = applyAction(game, { type: 'setFaceUpCards', playerId: 'a', cardIds: aChoice }, NOW + 1_000).state
    expect(afterOne.phase).toBe('setup')
    expect(afterOne.turnEndsAt).toBeNull()

    const bChoice = ids(seat(afterOne, 'b').hand.slice(0, 3))
    const later = NOW + 5_000
    const afterBoth = applyAction(afterOne, { type: 'setFaceUpCards', playerId: 'b', cardIds: bChoice }, later).state
    expect(afterBoth.phase).toBe('playing')
    expect(afterBoth.turnEndsAt).toBe(later + TURN_MS)
  })

  it('CLOCK — the deadline clears once the game finishes', () => {
    const state = stateOf({
      seats: [{ id: 'a', faceUp: ['9c'] }, { id: 'b', hand: ['4h'] }],
      pile: ['3s'],
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['c9'] }, NOW)
    expect(result.state.phase).toBe('finished')
    expect(result.state.turnEndsAt).toBeNull()
  })
})
