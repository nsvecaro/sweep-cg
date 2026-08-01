import { describe, expect, it } from 'vitest'
import { applyAction, createGame, getLegalMoves } from '@/engine/game'
import type { GameEvent } from '@/engine/types'
import { allCards, seat, stateOf } from './helpers'

const roster = [
  { playerId: 'a', name: 'Ana' },
  { playerId: 'b', name: 'Bo' },
]

const trio = [...roster, { playerId: 'c', name: 'Cy' }]

const forfeitBy = (playerId: string) => ({ type: 'forfeit', playerId }) as const

const eventTypes = (events: GameEvent[]) => events.map((e) => e.type)

describe('LeaveGame', () => {
  it('LEAVE_WALKOVER — in a two-player game the player who stays wins', () => {
    const state = stateOf({
      seats: [
        { id: 'a', hand: ['5c', '9d'] },
        { id: 'b', hand: ['6h', 'Ks'] },
      ],
      activePlayerId: 'a',
    })

    const result = applyAction(state, forfeitBy('a'))

    expect(result.error).toBeNull()
    expect(result.state.phase).toBe('finished')
    expect(result.state.finishOrder).toEqual(['b'])
    expect(seat(result.state, 'b').isFinished).toBe(true)
    expect(seat(result.state, 'a').hasLeft).toBe(true)
    expect(result.state.activePlayerId).toBeNull()
    expect(eventTypes(result.events)).toEqual(['PlayerLeft', 'PlayerFinished', 'GameOver'])
  })

  it('LEAVE_WALKOVER — the winner is not branded the loser', () => {
    const state = stateOf({
      seats: [
        { id: 'a', hand: ['5c'] },
        { id: 'b', hand: ['6h'] },
      ],
      activePlayerId: 'b',
    })

    const over = applyAction(state, forfeitBy('b')).events.find((e) => e.type === 'GameOver')

    expect(over).toEqual({ type: 'GameOver', loserId: null, finishOrder: ['a'] })
  })

  it('LEAVE_CARDS — the leaver’s cards go out of play and the deck is conserved', () => {
    const game = createGame({ difficulty: 'hard', players: trio, seed: 42 })
    const before = allCards(game).length

    const result = applyAction(game, forfeitBy('c'))
    const left = seat(result.state, 'c')

    expect(left.hand).toHaveLength(0)
    expect(left.faceUp).toHaveLength(0)
    expect(left.faceDown).toHaveLength(0)
    expect(allCards(result.state)).toHaveLength(before)
  })

  it('LEAVE_CONTINUES — with three players the remaining two carry on', () => {
    const game = createGame({ difficulty: 'hard', players: trio, seed: 3 })

    const result = applyAction(game, forfeitBy('c'))

    expect(result.state.phase).toBe('playing')
    expect(result.state.activePlayerId).not.toBe('c')
    expect(eventTypes(result.events)).toContain('PlayerLeft')
    expect(eventTypes(result.events)).not.toContain('GameOver')
  })

  it('LEAVE_TURN — leaving on your own turn passes play to the next seat', () => {
    const state = stateOf({
      seats: [
        { id: 'a', hand: ['5c'] },
        { id: 'b', hand: ['6h'] },
        { id: 'c', hand: ['7s'] },
      ],
      activePlayerId: 'a',
    })

    const result = applyAction(state, forfeitBy('a'))

    expect(result.state.activePlayerId).toBe('b')
  })

  it('LEAVE_TURN — the turn never lands on a seat that walked out', () => {
    const state = stateOf({
      seats: [
        { id: 'a', hand: ['5c'] },
        { id: 'b', hand: ['6h'] },
        { id: 'c', hand: ['7s'] },
      ],
      activePlayerId: 'c',
    })

    const withoutA = applyAction(state, forfeitBy('a')).state
    expect(withoutA.activePlayerId).toBe('c')

    // c plays, so the turn walks past the empty seat rather than stopping on it.
    const afterPlay = applyAction(withoutA, { type: 'playCards', playerId: 'c', cardIds: ['s7'] })
    expect(afterPlay.state.activePlayerId).toBe('b')
  })

  it('LEAVE_NO_MOVES — a player who left has no legal moves', () => {
    const state = stateOf({
      seats: [
        { id: 'a', hand: ['5c'] },
        { id: 'b', hand: ['6h'] },
        { id: 'c', hand: ['7s'] },
      ],
      activePlayerId: 'a',
    })

    const result = applyAction(state, forfeitBy('a')).state

    expect(getLegalMoves(result, 'a')).toEqual([])
  })

  it('LEAVE_REJECTED — a player who left cannot keep playing', () => {
    const state = stateOf({
      seats: [
        { id: 'a', hand: ['5c'] },
        { id: 'b', hand: ['6h'] },
        { id: 'c', hand: ['7s'] },
      ],
      activePlayerId: 'a',
    })

    const after = applyAction(state, forfeitBy('a')).state
    const replay = applyAction(after, { type: 'pickUpPile', playerId: 'a' })

    expect(replay.error).toBe('You left the game')
  })

  it('LEAVE_REJECTED — leaving twice, or after the game is over, is refused', () => {
    const state = stateOf({
      seats: [
        { id: 'a', hand: ['5c'] },
        { id: 'b', hand: ['6h'] },
        { id: 'c', hand: ['7s'] },
      ],
      activePlayerId: 'a',
    })

    const after = applyAction(state, forfeitBy('a')).state
    expect(applyAction(after, forfeitBy('a')).error).toBe('You already left the game')

    const finished = applyAction(after, forfeitBy('b')).state
    expect(finished.phase).toBe('finished')
    expect(applyAction(finished, forfeitBy('c')).error).toBe('The game is over')
  })

  it('LEAVE_SETUP — leaving during setup still hands the win to the other player', () => {
    const game = createGame({ difficulty: 'easy', players: roster, seed: 5 })
    expect(game.phase).toBe('setup')

    const result = applyAction(game, forfeitBy('a'))

    expect(result.state.phase).toBe('finished')
    expect(result.state.finishOrder).toEqual(['b'])
  })

  it('LEAVE_SETUP — with three players, setup completes without the seat that left', () => {
    const game = createGame({ difficulty: 'easy', players: trio, seed: 9 })

    const readyA = applyAction(game, {
      type: 'setFaceUpCards',
      playerId: 'a',
      cardIds: seat(game, 'a').hand.slice(0, 3).map((c) => c.id),
    }).state
    const readyB = applyAction(readyA, {
      type: 'setFaceUpCards',
      playerId: 'b',
      cardIds: seat(readyA, 'b').hand.slice(0, 3).map((c) => c.id),
    }).state
    expect(readyB.phase).toBe('setup')

    // c never picks and walks out instead — play must still begin.
    const result = applyAction(readyB, forfeitBy('c'))

    expect(result.state.phase).toBe('playing')
    expect(result.state.activePlayerId).not.toBe('c')
  })

  it('LEAVE_LATE — a game played out after someone left still names the real loser', () => {
    // c walked out early; a and b played on, and b is about to go out first.
    const state = stateOf({
      seats: [
        { id: 'b', hand: ['5c'] },
        { id: 'a', hand: ['9d', 'Ks'] },
        { id: 'c', hasLeft: true },
      ],
      deck: [],
      activePlayerId: 'b',
      pile: ['4d'],
    })

    const result = applyAction(state, { type: 'playCards', playerId: 'b', cardIds: ['c5'] })

    expect(result.state.phase).toBe('finished')
    expect(result.state.finishOrder).toEqual(['b'])
    expect(result.events.find((e) => e.type === 'GameOver')).toMatchObject({ loserId: 'a' })
  })
})
