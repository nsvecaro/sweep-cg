import { describe, expect, it } from 'vitest'
import { applyAction, createGame } from '@/engine/game'
import { isSpecial } from '@/engine/rules'
import { ids, seat } from './helpers'

const roster = [
  { playerId: 'a', name: 'Ana' },
  { playerId: 'b', name: 'Bo' },
]

describe('SetupGame', () => {
  it('SETUP — every player receives three face-down cards in every difficulty', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const game = createGame({ difficulty, players: roster, seed: 7 })
      for (const player of game.players) expect(player.faceDown).toHaveLength(3)
    }
  })

  it('DIFF_EASY — six cards in hand, face-up chosen by the player, specials are A/2/10', () => {
    const game = createGame({ difficulty: 'easy', players: roster, seed: 11 })
    expect(game.phase).toBe('setup')
    for (const player of game.players) {
      expect(player.hand).toHaveLength(6)
      expect(player.faceUp).toHaveLength(0)
    }
    for (const value of [14, 2, 10]) expect(isSpecial(value, 'easy')).toBe(true)
    for (const value of [5, 7, 8]) expect(isSpecial(value, 'easy')).toBe(false)
  })

  it('DIFF_MEDIUM — same setup as easy, but 5/7/8 join the specials', () => {
    const game = createGame({ difficulty: 'medium', players: roster, seed: 11 })
    expect(game.phase).toBe('setup')
    for (const player of game.players) expect(player.hand).toHaveLength(6)
    for (const value of [14, 2, 10, 5, 7, 8]) expect(isSpecial(value, 'medium')).toBe(true)
  })

  it('DIFF_HARD — face-up cards are dealt automatically and play starts at once', () => {
    const game = createGame({ difficulty: 'hard', players: roster, seed: 11 })
    expect(game.phase).toBe('playing')
    for (const player of game.players) {
      expect(player.faceUp).toHaveLength(3)
      expect(player.hand).toHaveLength(3)
    }
    for (const value of [14, 2, 10, 5, 7, 8]) expect(isSpecial(value, 'hard')).toBe(true)
  })

  it('SetFaceUpCards — moves the three chosen cards to faceUp and emits PlayerReady', () => {
    const game = createGame({ difficulty: 'easy', players: roster, seed: 3 })
    const chosen = ids(seat(game, 'a').hand.slice(0, 3))
    const result = applyAction(game, { type: 'setFaceUpCards', playerId: 'a', cardIds: chosen })

    expect(result.error).toBeNull()
    expect(ids(seat(result.state, 'a').faceUp).sort()).toEqual([...chosen].sort())
    expect(seat(result.state, 'a').hand).toHaveLength(3)
    expect(result.events).toContainEqual({ type: 'PlayerReady', playerId: 'a' })
  })

  it('SetFaceUpCards — rejects any count other than three, and rejects hard mode', () => {
    const easy = createGame({ difficulty: 'easy', players: roster, seed: 3 })
    const twoCards = ids(seat(easy, 'a').hand.slice(0, 2))
    expect(applyAction(easy, { type: 'setFaceUpCards', playerId: 'a', cardIds: twoCards }).error).toMatch(/exactly 3/)

    const hard = createGame({ difficulty: 'hard', players: roster, seed: 3 })
    const three = ids(seat(hard, 'a').hand.slice(0, 3))
    expect(applyAction(hard, { type: 'setFaceUpCards', playerId: 'a', cardIds: three }).error).toBeTruthy()
  })

  it('FIRST_MOVE — the player holding the lowest card opens the game', () => {
    const game = createGame({ difficulty: 'hard', players: roster, seed: 42 })
    const lowest = (id: string) => Math.min(...seat(game, id).hand.map((c) => c.value))
    const expected = lowest('a') <= lowest('b') ? 'a' : 'b'
    expect(game.activePlayerId).toBe(expected)
  })

  it('play is blocked until every player has set their face-up cards', () => {
    const game = createGame({ difficulty: 'easy', players: roster, seed: 3 })
    const chosen = ids(seat(game, 'a').hand.slice(0, 3))
    const afterOne = applyAction(game, { type: 'setFaceUpCards', playerId: 'a', cardIds: chosen }).state
    expect(afterOne.phase).toBe('setup')
    expect(afterOne.activePlayerId).toBeNull()

    const bChoice = ids(seat(afterOne, 'b').hand.slice(0, 3))
    const afterBoth = applyAction(afterOne, { type: 'setFaceUpCards', playerId: 'b', cardIds: bChoice }).state
    expect(afterBoth.phase).toBe('playing')
    expect(afterBoth.activePlayerId).not.toBeNull()
  })
})
