import { describe, expect, it } from 'vitest'
import { applyAction, getLegalMoves } from '@/engine/game'
import { card, seat, stateOf } from './helpers'

describe('PlayCards', () => {
  it('VALID_PLAY — a card equal to or higher than the pile is accepted, a lower one is not', () => {
    const state = stateOf({ seats: [{ id: 'a', hand: ['9h', '4c'] }, { id: 'b' }], pile: ['6s'] })

    const high = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h9'] })
    expect(high.error).toBeNull()
    expect(high.state.activeValue).toBe(9)

    const low = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['c4'] })
    expect(low.error).toBeTruthy()
    expect(low.events).toContainEqual(expect.objectContaining({ type: 'PlayRejected', playerId: 'a' }))
  })

  it('VALID_PLAY — equal to the top card is a legal play', () => {
    const state = stateOf({ seats: [{ id: 'a', hand: ['6h'] }, { id: 'b' }], pile: ['6s'] })
    expect(applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h6'] }).error).toBeNull()
  })

  it('PLAY_MULTIPLES — several cards of one value go down together, mixed values do not', () => {
    const state = stateOf({ seats: [{ id: 'a', hand: ['6h', '6c', '9d'] }, { id: 'b' }], pile: ['4s'] })

    const pair = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h6', 'c6'] })
    expect(pair.error).toBeNull()
    expect(pair.state.pile.map((c) => c.value)).toEqual([4, 6, 6])

    const mixed = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h6', 'd9'] })
    expect(mixed.error).toMatch(/same value/)
  })

  it('PLAY_ORDER — face-up cards stay locked while the hand still holds cards', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['4h'], faceUp: ['9c'] }, { id: 'b' }],
      pile: ['3s'],
    })
    expect(applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['c9'] }).error).toBeTruthy()
    expect(applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h4'] }).error).toBeNull()
  })

  it('PLAY_ORDER — face-down cards stay locked while face-up cards remain', () => {
    const state = stateOf({
      seats: [{ id: 'a', faceUp: ['9c'], faceDown: ['5h'] }, { id: 'b' }],
      pile: ['3s'],
      deck: [],
    })
    expect(applyAction(state, { type: 'playFaceDownCard', playerId: 'a', cardId: 'h5' }).error).toBeTruthy()
  })

  it('PLAY_ORDER — with an empty hand the face-up row becomes playable', () => {
    const state = stateOf({
      seats: [{ id: 'a', faceUp: ['9c'], faceDown: ['5h'] }, { id: 'b' }],
      pile: ['3s'],
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['c9'] })
    expect(result.error).toBeNull()
    expect(seat(result.state, 'a').faceUp).toHaveLength(0)
  })

  it('RULES — a player who is not active cannot act', () => {
    const state = stateOf({ seats: [{ id: 'a', hand: ['9h'] }, { id: 'b', hand: ['9c'] }], pile: ['3s'] })
    expect(applyAction(state, { type: 'playCards', playerId: 'b', cardIds: ['c9'] }).error).toMatch(/Not your turn/)
  })

  it('MIN_HAND — the hand refills to three after a play while the deck holds cards', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['9h', '4c', '4d'] }, { id: 'b' }],
      pile: ['3s'],
      deck: ['2c', '2d', '2h'],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h9'] })
    expect(seat(result.state, 'a').hand).toHaveLength(3)
    expect(result.state.deck).toHaveLength(2)
    expect(result.events).toContainEqual({ type: 'CardsDrawn', playerId: 'a', count: 1 })
  })

  it('MIN_HAND — nothing is drawn once the deck is empty', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['9h', '4c'] }, { id: 'b' }],
      pile: ['3s'],
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h9'] })
    expect(seat(result.state, 'a').hand).toHaveLength(1)
  })

  it('DECK_PILE — drawing moves cards out of the deck and into the hand', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['9h'] }, { id: 'b' }],
      pile: ['3s'],
      deck: ['5c', '6c', '7c', '8c'],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h9'] })
    expect(result.state.deck).toHaveLength(1)
    expect(seat(result.state, 'a').hand).toHaveLength(3)
  })

  it('PICKUP — the whole pile goes to hand, the board resets and the turn passes', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['4h'] }, { id: 'b' }],
      pile: ['7s', '3c', '5d'],
      activeValue: 7,
      forceLower: true,
      deck: [],
    })
    const result = applyAction(state, { type: 'pickUpPile', playerId: 'a' })

    expect(result.error).toBeNull()
    expect(result.state.pile).toHaveLength(0)
    expect(seat(result.state, 'a').hand).toHaveLength(4)
    expect(result.state.activeValue).toBeNull()
    expect(result.state.forceLower).toBe(false)
    expect(result.state.activePlayerId).toBe('b')
    expect(result.events).toContainEqual({ type: 'PileTaken', playerId: 'a', count: 3 })
  })

  it('PICKUP — an empty pile cannot be taken', () => {
    const state = stateOf({ seats: [{ id: 'a', hand: ['4h'] }, { id: 'b' }], pile: [] })
    expect(applyAction(state, { type: 'pickUpPile', playerId: 'a' }).error).toMatch(/empty/)
  })

  it('WIN — clearing hand, face-up and face-down retires the player', () => {
    const state = stateOf({
      seats: [{ id: 'a', faceUp: ['9c'] }, { id: 'b', hand: ['4h'] }, { id: 'c', hand: ['5h'] }],
      pile: ['3s'],
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['c9'] })

    expect(seat(result.state, 'a').isFinished).toBe(true)
    expect(result.state.finishOrder).toEqual(['a'])
    expect(result.events).toContainEqual({ type: 'PlayerFinished', playerId: 'a', place: 1 })
    expect(result.state.activePlayerId).toBe('b')
  })

  it('WIN — the game ends when only one player is left holding cards', () => {
    const state = stateOf({
      seats: [{ id: 'a', faceUp: ['9c'] }, { id: 'b', hand: ['4h'] }],
      pile: ['3s'],
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['c9'] })

    expect(result.state.phase).toBe('finished')
    expect(result.events).toContainEqual({ type: 'GameOver', loserId: 'b', finishOrder: ['a'] })
  })

  it('turn order steps over players who have already gone out', () => {
    const state = stateOf({
      seats: [
        { id: 'a', hand: ['9h'] },
        { id: 'b', isFinished: true },
        { id: 'c', hand: ['5h'] },
        { id: 'd', hand: ['6h'] },
      ],
      pile: ['3s'],
      deck: [],
    })
    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ['h9'] })
    expect(result.state.activePlayerId).toBe('c')
  })
})

describe('PlayFaceDownCard', () => {
  const endgame = (faceDown: string[], pile: string[], activeValue?: number | null) =>
    stateOf({ seats: [{ id: 'a', faceDown }, { id: 'b', hand: ['4h'] }], pile, deck: [], activeValue })

  it('ENDGAME — a blind card can only be flipped once hand and face-up are empty', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['4c'], faceDown: ['9h'] }, { id: 'b' }],
      pile: ['3s'],
      deck: [],
    })
    expect(applyAction(state, { type: 'playFaceDownCard', playerId: 'a', cardId: 'h9' }).error).toBeTruthy()
  })

  it('ENDGAME — a valid blind card lands on the pile and the turn passes', () => {
    const state = endgame(['9h', '4c'], ['3s'])
    const result = applyAction(state, { type: 'playFaceDownCard', playerId: 'a', cardId: 'h9' })

    expect(result.error).toBeNull()
    expect(result.state.pile.at(-1)).toEqual(card('9h'))
    expect(result.state.lastReveal).toEqual(card('9h'))
    expect(result.state.activePlayerId).toBe('b')
  })

  it('ENDGAME — a blind miss drags the card and the whole pile into the hand', () => {
    const state = endgame(['4c', '9h'], ['3s', 'Ks'])
    const result = applyAction(state, { type: 'playFaceDownCard', playerId: 'a', cardId: 'c4' })

    expect(result.error).toBeNull()
    expect(seat(result.state, 'a').hand).toHaveLength(3)
    expect(result.state.pile).toHaveLength(0)
    expect(result.state.activePlayerId).toBe('b')
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'PlayRejected' }))
  })

  it('ENDGAME — a blind ten still sweeps and hands the player another turn', () => {
    const state = endgame(['10h', '4c'], ['3s'])
    const result = applyAction(state, { type: 'playFaceDownCard', playerId: 'a', cardId: 'h10' })

    expect(result.state.pile).toHaveLength(0)
    expect(result.state.graveyard).toHaveLength(2)
    expect(result.state.activePlayerId).toBe('a')
  })

  it('a player in the blind phase must flip rather than take the pile', () => {
    const state = endgame(['9h'], ['3s'])
    expect(applyAction(state, { type: 'pickUpPile', playerId: 'a' }).error).toMatch(/flip/)
    expect(getLegalMoves(state, 'a').every((m) => m.kind === 'playFaceDown')).toBe(true)
  })
})
