import { describe, expect, it } from 'vitest'
import { chooseBotAction, chooseBotFaceUpCards } from '@/engine/bot'
import { nextRandom } from '@/engine/deck'
import { applyAction, createGame, getLegalMoves, moveToAction } from '@/engine/game'
import type { Difficulty, GameState } from '@/engine/types'
import { allCards, ids } from './helpers'

const DECK_SIZE = 52
const STEP_CAP = 20000

function checkInvariants(state: GameState): void {
  const cards = allCards(state)
  expect(cards).toHaveLength(DECK_SIZE)
  expect(new Set(ids(cards)).size).toBe(DECK_SIZE)

  const finished = new Set(state.players.filter((p) => p.isFinished).map((p) => p.playerId))
  expect(new Set(state.finishOrder)).toEqual(finished)

  if (state.phase === 'playing') {
    expect(state.activePlayerId).not.toBeNull()
    const active = state.players.find((p) => p.playerId === state.activePlayerId)
    expect(active?.isFinished).toBe(false)
  }
  for (const player of state.players) {
    if (player.faceUp.length > 0) expect(player.faceDown.length).toBeGreaterThan(0)
  }
}

function completeSetup(start: GameState, useBots: boolean): GameState {
  let state = start
  while (state.phase === 'setup') {
    const waiting = state.players.find((p) => p.faceUp.length === 0)
    if (!waiting) throw new Error('Setup stalled')
    const cardIds = useBots
      ? chooseBotFaceUpCards(state, waiting.playerId)
      : ids(waiting.hand.slice(0, 3))
    const result = applyAction(state, { type: 'setFaceUpCards', playerId: waiting.playerId, cardIds })
    expect(result.error).toBeNull()
    state = result.state
  }
  return state
}

interface RunOptions {
  difficulty: Difficulty
  playerCount: number
  seed: number
  driver: 'random' | 'bot'
}

function playOut({ difficulty, playerCount, seed, driver }: RunOptions): { state: GameState; steps: number } {
  const players = Array.from({ length: playerCount }, (_, i) => ({ playerId: `p${i}`, name: `P${i}` }))
  let state = completeSetup(createGame({ difficulty, players, seed }), driver === 'bot')
  let rng = seed | 0
  let steps = 0

  while (state.phase === 'playing' && steps < STEP_CAP) {
    steps++
    const playerId = state.activePlayerId!
    const moves = getLegalMoves(state, playerId)
    expect(moves.length).toBeGreaterThan(0)

    let action
    if (driver === 'bot') {
      action = chooseBotAction(state, playerId)
    } else {
      const plays = moves.filter((m) => m.kind !== 'pickUp')
      const [roll, next] = nextRandom(rng)
      rng = next
      const pool = plays.length > 0 && roll > 0.12 ? plays : moves
      const [pickRoll, next2] = nextRandom(rng)
      rng = next2
      action = moveToAction(pool[Math.floor(pickRoll * pool.length)] ?? pool[0], playerId)
    }

    const result = applyAction(state, action!)
    expect(result.error).toBeNull()
    state = result.state
    checkInvariants(state)
  }

  return { state, steps }
}

describe('engine invariants', () => {
  const seeds = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]

  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    for (const playerCount of [2, 3, 4]) {
      it(`RULES — ${difficulty}/${playerCount}p games stay legal and terminate under random legal play`, () => {
        for (const seed of seeds) {
          const { state, steps } = playOut({ difficulty, playerCount, seed, driver: 'random' })
          expect(steps).toBeLessThan(STEP_CAP)
          expect(state.phase).toBe('finished')
          expect(state.finishOrder.length).toBe(playerCount - 1)
        }
      })
    }
  }

  it('DECK_PILE — every card stays accounted for from deal to game over', () => {
    const { state } = playOut({ difficulty: 'medium', playerCount: 4, seed: 99, driver: 'random' })
    expect(state.deck).toHaveLength(0)
    checkInvariants(state)
  })

  it('bots only ever submit moves the engine accepts, and games between them finish', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (const seed of [4, 17, 256]) {
        const { state, steps } = playOut({ difficulty, playerCount: 3, seed, driver: 'bot' })
        expect(steps).toBeLessThan(STEP_CAP)
        expect(state.phase).toBe('finished')
      }
    }
  })
})
