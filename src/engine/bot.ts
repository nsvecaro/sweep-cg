import { nextRandom } from './deck'
import { applyAction, getLegalMoves, moveToAction } from './game'
import { isSpecial } from './rules'
import type { GameAction, GameState, LegalMove } from './types'

function moveScore(state: GameState, playerId: string, move: LegalMove): number {
  if (move.kind === 'pickUp') return -10000
  if (move.kind === 'playFaceDown') return 0

  const result = applyAction(state, moveToAction(move, playerId))
  if (result.error) return -Infinity
  const swept = result.events.some((e) => e.type === 'PileSwept')
  if (swept) return 5000 + state.pile.length * 10 - move.cardIds.length

  const cost = isSpecial(move.value, state.difficulty) ? 100 + move.value : move.value
  return -cost * 10 + (move.cardIds.length - 1) * 3
}

export function chooseBotAction(state: GameState, playerId: string): GameAction | null {
  const moves = getLegalMoves(state, playerId)
  if (moves.length === 0) return null

  if (moves[0].kind === 'playFaceDown') {
    const [roll] = nextRandom(state.rng + state.turn)
    const pick = moves[Math.floor(roll * moves.length)] ?? moves[0]
    return moveToAction(pick, playerId)
  }

  let best: LegalMove = moves[0]
  let bestScore = -Infinity
  for (const move of moves) {
    const score = moveScore(state, playerId, move)
    if (score > bestScore) {
      bestScore = score
      best = move
    }
  }
  return moveToAction(best, playerId)
}

export function chooseBotFaceUpCards(state: GameState, playerId: string): string[] {
  const player = state.players.find((p) => p.playerId === playerId)
  if (!player) return []
  return player.hand
    .slice()
    .sort((a, b) => {
      const aSpecial = isSpecial(a.value, state.difficulty) ? 1 : 0
      const bSpecial = isSpecial(b.value, state.difficulty) ? 1 : 0
      return bSpecial - aSpecial || b.value - a.value
    })
    .slice(0, 3)
    .map((c) => c.id)
}
