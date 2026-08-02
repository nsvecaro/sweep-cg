import { buildDeck, shuffle } from './deck.js'
import {
  HAND_MINIMUM,
  applyValueEffect,
  boardOf,
  canPlayValue,
  isSweep,
  playableZone,
} from './rules.js'
import type {
  ActionResult,
  Card,
  Difficulty,
  GameAction,
  GameEvent,
  GameState,
  LegalMove,
  PlayerState,
} from './types.js'

export const FACE_DOWN_COUNT = 3
export const FACE_UP_COUNT = 3
export const TURN_SECONDS = 20
export const TURN_MS = TURN_SECONDS * 1000

export interface GameConfig {
  difficulty: Difficulty
  players: { playerId: string; name: string; isBot?: boolean }[]
  seed?: number
  now?: number
}

export function createGame(config: GameConfig): GameState {
  const { difficulty, players, seed = Date.now(), now = Date.now() } = config
  if (players.length < 2) throw new Error('Sweep needs at least two players')

  const [deck, rng] = shuffle(buildDeck(), seed | 0)
  const dealtToHand = difficulty === 'hard' ? HAND_MINIMUM : 6

  const seats: PlayerState[] = players.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    isBot: p.isBot ?? false,
    hand: [],
    faceUp: [],
    faceDown: [],
    isFinished: false,
    hasLeft: false,
  }))

  for (let i = 0; i < FACE_DOWN_COUNT; i++) {
    for (const seat of seats) seat.faceDown.push(deck.pop()!)
  }
  if (difficulty === 'hard') {
    for (let i = 0; i < FACE_UP_COUNT; i++) {
      for (const seat of seats) seat.faceUp.push(deck.pop()!)
    }
  }
  for (let i = 0; i < dealtToHand; i++) {
    for (const seat of seats) seat.hand.push(deck.pop()!)
  }
  for (const seat of seats) seat.hand.sort(byValue)

  const state: GameState = {
    difficulty,
    phase: difficulty === 'hard' ? 'playing' : 'setup',
    deck,
    pile: [],
    graveyard: [],
    activeValue: null,
    forceLower: false,
    players: seats,
    activePlayerId: null,
    finishOrder: [],
    turn: 0,
    rng,
    lastReveal: null,
    turnEndsAt: null,
  }
  if (state.phase === 'playing') {
    state.activePlayerId = chooseStarter(state)
    state.turnEndsAt = now + TURN_MS
  }
  return state
}

/**
 * Every action funnels back through here, so the clock resets on the tail
 * state rather than at each `advanceTurn` call site — that also covers a
 * sweep, which keeps the same player on the clock instead of passing turn.
 */
export function applyAction(state: GameState, action: GameAction, now: number = Date.now()): ActionResult {
  const next = structuredClone(state)
  const events: GameEvent[] = []
  next.lastReveal = null

  const player = next.players.find((p) => p.playerId === action.playerId)
  if (!player) return reject(state, action.playerId, 'Unknown player')

  const result = dispatch(state, next, player, action, events)
  if (result.error) return result

  result.state.turnEndsAt =
    result.state.phase === 'playing' && result.state.activePlayerId !== null ? now + TURN_MS : null
  return result
}

function dispatch(
  prev: GameState,
  next: GameState,
  player: PlayerState,
  action: GameAction,
  events: GameEvent[],
): ActionResult {
  switch (action.type) {
    case 'setFaceUpCards':
      return setFaceUpCards(prev, next, player, action.cardIds, events)
    case 'playCards':
      return playCards(prev, next, player, action.cardIds, events)
    case 'playFaceDownCard':
      return playFaceDownCard(prev, next, player, action.cardId, events)
    case 'pickUpPile':
      return pickUpPile(prev, next, player, events)
    case 'forfeit':
      return forfeit(prev, next, player, events)
    case 'timeout':
      return timeout(prev, next, player, events)
  }
}

/** Still at the table: neither gone out nor walked away. */
function isLive(player: PlayerState): boolean {
  return !player.isFinished && !player.hasLeft
}

function setFaceUpCards(
  prev: GameState,
  next: GameState,
  player: PlayerState,
  cardIds: string[],
  events: GameEvent[],
): ActionResult {
  if (next.phase !== 'setup') return reject(prev, player.playerId, 'Setup is already complete')
  if (next.difficulty === 'hard') {
    return reject(prev, player.playerId, 'Hard mode deals face-up cards automatically')
  }
  if (player.faceUp.length > 0) return reject(prev, player.playerId, 'Face-up cards already set')
  if (cardIds.length !== FACE_UP_COUNT) {
    return reject(prev, player.playerId, `Choose exactly ${FACE_UP_COUNT} cards`)
  }

  const chosen = takeCards(player.hand, cardIds)
  if (!chosen) return reject(prev, player.playerId, 'Those cards are not in your hand')

  player.faceUp = chosen.sort(byValue)
  events.push({ type: 'PlayerReady', playerId: player.playerId })

  maybeStartPlay(next)
  return { state: next, events, error: null }
}

/** Setup ends once everyone still seated has shown their three cards. */
function maybeStartPlay(state: GameState): void {
  if (state.phase !== 'setup') return
  const seated = state.players.filter((p) => !p.hasLeft)
  if (!seated.every((p) => p.faceUp.length === FACE_UP_COUNT)) return
  state.phase = 'playing'
  state.activePlayerId = chooseStarter(state)
}

/**
 * Walking out mid-game. The leaver's cards go out of play and they rank below
 * everyone still at the table; when that leaves a single player, they win.
 */
function forfeit(
  prev: GameState,
  next: GameState,
  player: PlayerState,
  events: GameEvent[],
): ActionResult {
  if (next.phase === 'finished') return reject(prev, player.playerId, 'The game is over')
  if (player.hasLeft) return reject(prev, player.playerId, 'You already left the game')

  const wasActive = next.activePlayerId === player.playerId
  player.hasLeft = true
  next.graveyard.push(...player.hand, ...player.faceUp, ...player.faceDown)
  player.hand = []
  player.faceUp = []
  player.faceDown = []
  events.push({ type: 'PlayerLeft', playerId: player.playerId })

  const live = next.players.filter(isLive)
  if (live.length <= 1) {
    next.phase = 'finished'
    next.activePlayerId = null
    if (live.length === 1) {
      const winner = live[0]
      winner.isFinished = true
      next.finishOrder.push(winner.playerId)
      events.push({
        type: 'PlayerFinished',
        playerId: winner.playerId,
        place: next.finishOrder.length,
      })
    }
    events.push({ type: 'GameOver', loserId: null, finishOrder: [...next.finishOrder] })
    return { state: next, events, error: null }
  }

  if (wasActive) advanceTurn(next, 1, events)
  maybeStartPlay(next)
  return { state: next, events, error: null }
}

function playCards(
  prev: GameState,
  next: GameState,
  player: PlayerState,
  cardIds: string[],
  events: GameEvent[],
): ActionResult {
  const guard = requireTurn(prev, next, player)
  if (guard) return guard
  if (cardIds.length === 0) return reject(prev, player.playerId, 'No cards selected')

  const zone = playableZone(player)
  if (zone === 'faceDown') {
    return reject(prev, player.playerId, 'Only face-down cards remain — flip one')
  }
  if (zone === null) return reject(prev, player.playerId, 'You have no cards')

  const source = zone === 'hand' ? player.hand : player.faceUp
  const cards = takeCards(source, cardIds)
  if (!cards) {
    return reject(prev, player.playerId, `Those cards are not in your ${zone === 'hand' ? 'hand' : 'face-up row'}`)
  }

  const value = cards[0].value
  if (cards.some((c) => c.value !== value)) {
    return reject(prev, player.playerId, 'Multiple cards must share the same value')
  }
  if (!canPlayValue(value, boardOf(next))) {
    return reject(prev, player.playerId, 'That card cannot beat the pile')
  }

  next.pile.push(...cards)
  resolvePlay(next, player, cards, value, events)
  return { state: next, events, error: null }
}

function playFaceDownCard(
  prev: GameState,
  next: GameState,
  player: PlayerState,
  cardId: string,
  events: GameEvent[],
): ActionResult {
  const guard = requireTurn(prev, next, player)
  if (guard) return guard
  if (player.hand.length > 0 || player.faceUp.length > 0) {
    return reject(prev, player.playerId, 'Play your hand and face-up cards first')
  }

  const taken = takeCards(player.faceDown, [cardId])
  if (!taken) return reject(prev, player.playerId, 'That card is not face-down in front of you')

  const card = taken[0]
  next.lastReveal = card

  if (!canPlayValue(card.value, boardOf(next))) {
    events.push({ type: 'PlayRejected', playerId: player.playerId, reason: 'Blind card missed' })
    player.hand.push(card, ...next.pile)
    player.hand.sort(byValue)
    events.push({ type: 'PileTaken', playerId: player.playerId, count: next.pile.length + 1 })
    next.pile = []
    clearBoard(next)
    advanceTurn(next, 1, events)
    settle(next, events)
    return { state: next, events, error: null }
  }

  next.pile.push(card)
  resolvePlay(next, player, [card], card.value, events)
  return { state: next, events, error: null }
}

function pickUpPile(
  prev: GameState,
  next: GameState,
  player: PlayerState,
  events: GameEvent[],
): ActionResult {
  const guard = requireTurn(prev, next, player)
  if (guard) return guard
  if (next.pile.length === 0) return reject(prev, player.playerId, 'The pile is empty')
  if (playableZone(player) === 'faceDown') {
    return reject(prev, player.playerId, 'You must flip a face-down card')
  }

  const count = next.pile.length
  player.hand.push(...next.pile)
  player.hand.sort(byValue)
  next.pile = []
  clearBoard(next)
  events.push({ type: 'PileTaken', playerId: player.playerId, count })
  advanceTurn(next, 1, events)
  settle(next, events)
  return { state: next, events, error: null }
}

/**
 * The clock ran out on the active player. Whatever's on the pile becomes
 * theirs — win or lose, the turn moves on. Unlike `pickUpPile`, this ignores
 * the blind-flip restriction: a player stalling on a face-down card still
 * gets punished and passed over, rather than stuck holding up the table.
 */
function timeout(
  prev: GameState,
  next: GameState,
  player: PlayerState,
  events: GameEvent[],
): ActionResult {
  const guard = requireTurn(prev, next, player)
  if (guard) return guard

  events.push({ type: 'PlayerTimedOut', playerId: player.playerId })

  const count = next.pile.length
  if (count > 0) {
    player.hand.push(...next.pile)
    player.hand.sort(byValue)
    next.pile = []
    clearBoard(next)
    events.push({ type: 'PileTaken', playerId: player.playerId, count })
  }

  advanceTurn(next, 1, events)
  settle(next, events)
  return { state: next, events, error: null }
}

function resolvePlay(
  state: GameState,
  player: PlayerState,
  cards: Card[],
  value: number,
  events: GameEvent[],
): void {
  if (isSweep(state.pile, value)) {
    const swept = state.pile
    const reason = value === 10 ? 'ten' : 'quad'
    state.graveyard.push(...swept)
    state.pile = []
    clearBoard(state)
    events.push({ type: 'PileSwept', playerId: player.playerId, cards: swept, reason })
    drawToMinimum(state, player, events)
    checkFinished(state, player, events)
    if (player.isFinished) advanceTurn(state, 1, events)
    settle(state, events)
    return
  }

  const effect = applyValueEffect(value, cards.length, boardOf(state))
  state.activeValue = effect.activeValue
  state.forceLower = effect.forceLower
  events.push({ type: 'CardsPlayed', playerId: player.playerId, cards })

  drawToMinimum(state, player, events)
  checkFinished(state, player, events)
  advanceTurn(state, 1 + effect.skips, events)
  settle(state, events)
}

function drawToMinimum(state: GameState, player: PlayerState, events: GameEvent[]): void {
  let drawn = 0
  while (player.hand.length < HAND_MINIMUM && state.deck.length > 0) {
    player.hand.push(state.deck.pop()!)
    drawn++
  }
  if (drawn > 0) {
    player.hand.sort(byValue)
    events.push({ type: 'CardsDrawn', playerId: player.playerId, count: drawn })
  }
}

function checkFinished(state: GameState, player: PlayerState, events: GameEvent[]): void {
  if (player.isFinished) return
  if (player.hand.length || player.faceUp.length || player.faceDown.length) return
  player.isFinished = true
  state.finishOrder.push(player.playerId)
  events.push({ type: 'PlayerFinished', playerId: player.playerId, place: state.finishOrder.length })
}

function advanceTurn(state: GameState, steps: number, events: GameEvent[]): void {
  const seats = state.players
  const live = seats.filter(isLive)
  if (live.length === 0) {
    state.activePlayerId = null
    return
  }

  let index = seats.findIndex((p) => p.playerId === state.activePlayerId)
  if (index < 0) index = -1

  let moved = 0
  while (moved < steps) {
    index = (index + 1) % seats.length
    if (!isLive(seats[index])) continue
    moved++
    if (moved < steps) {
      events.push({ type: 'PlayerSkipped', playerId: seats[index].playerId })
    }
  }
  state.activePlayerId = seats[index].playerId
  state.turn++
}

function settle(state: GameState, events: GameEvent[]): void {
  const live = state.players.filter(isLive)
  if (live.length > 1) return
  state.phase = 'finished'
  state.activePlayerId = null
  events.push({
    type: 'GameOver',
    loserId: live.length === 1 ? live[0].playerId : null,
    finishOrder: [...state.finishOrder],
  })
}

function requireTurn(prev: GameState, next: GameState, player: PlayerState): ActionResult | null {
  if (next.phase === 'setup') return reject(prev, player.playerId, 'Setup is not finished')
  if (next.phase === 'finished') return reject(prev, player.playerId, 'The game is over')
  if (player.hasLeft) return reject(prev, player.playerId, 'You left the game')
  if (next.activePlayerId !== player.playerId) return reject(prev, player.playerId, 'Not your turn')
  if (player.isFinished) return reject(prev, player.playerId, 'You already went out')
  return null
}

function reject(state: GameState, playerId: string, reason: string): ActionResult {
  return {
    state,
    events: [{ type: 'PlayRejected', playerId, reason }],
    error: reason,
  }
}

function clearBoard(state: GameState): void {
  state.activeValue = null
  state.forceLower = false
}

function takeCards(source: Card[], cardIds: string[]): Card[] | null {
  const picked: Card[] = []
  for (const id of cardIds) {
    const index = source.findIndex((c) => c.id === id)
    if (index < 0) return null
    picked.push(source.splice(index, 1)[0])
  }
  return picked
}

function chooseStarter(state: GameState): string {
  const seated = state.players.filter(isLive)
  let best = seated[0] ?? state.players[0]
  let bestValue = Infinity
  for (const player of seated) {
    const low = Math.min(...player.hand.map((c) => c.value))
    if (low < bestValue) {
      bestValue = low
      best = player
    }
  }
  return best.playerId
}

function byValue(a: Card, b: Card): number {
  return a.value - b.value || a.suit.localeCompare(b.suit)
}

export function getLegalMoves(state: GameState, playerId: string): LegalMove[] {
  if (state.phase !== 'playing' || state.activePlayerId !== playerId) return []
  const player = state.players.find((p) => p.playerId === playerId)
  if (!player || !isLive(player)) return []

  const zone = playableZone(player)
  if (zone === null) return []
  if (zone === 'faceDown') {
    return player.faceDown.map((c) => ({ kind: 'playFaceDown', cardId: c.id }) as LegalMove)
  }

  const source = zone === 'hand' ? player.hand : player.faceUp
  const board = boardOf(state)
  const moves: LegalMove[] = []
  const byValueGroups = new Map<number, Card[]>()
  for (const card of source) {
    const group = byValueGroups.get(card.value) ?? []
    group.push(card)
    byValueGroups.set(card.value, group)
  }
  for (const [value, group] of byValueGroups) {
    if (!canPlayValue(value, board)) continue
    for (let count = 1; count <= group.length; count++) {
      moves.push({ kind: 'play', zone, cardIds: group.slice(0, count).map((c) => c.id), value })
    }
  }
  if (state.pile.length > 0) moves.push({ kind: 'pickUp' })
  return moves
}

export function moveToAction(move: LegalMove, playerId: string): GameAction {
  switch (move.kind) {
    case 'play':
      return { type: 'playCards', playerId, cardIds: move.cardIds }
    case 'playFaceDown':
      return { type: 'playFaceDownCard', playerId, cardId: move.cardId }
    case 'pickUp':
      return { type: 'pickUpPile', playerId }
  }
}
