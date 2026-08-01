import { applyAction, createGame } from '../engine/game'
import type { Card, Difficulty, GameAction, GameEvent, GameState } from '../engine/types'
import { normalizeLobbyCode } from '../lobby/codes'
import { randomUsername, sanitizeUsername } from '../lobby/names'
import { MAX_LOBBY_PLAYERS } from '../lobby/types'

const LOG_LIMIT = 80

export interface RoomSeat {
  playerId: string
  username: string
  /** The browser that plays this seat. Equals playerId except for pass-and-play seats. */
  ownerId: string
}

export interface RoomRecord {
  code: string
  hostId: string
  status: 'waiting' | 'playing'
  seats: RoomSeat[]
  game: GameState | null
  log: { id: number; event: GameEvent }[]
  logSeq: number
  updatedAt: number
}

export type RoomCommand =
  | { type: 'join'; username: string }
  | { type: 'setUsername'; username: string }
  | { type: 'addSeat'; username: string }
  | { type: 'removePlayer'; targetId: string }
  | { type: 'start'; difficulty: Difficulty }
  | { type: 'action'; action: GameAction }
  | { type: 'returnToLobby' }
  | { type: 'leave' }

export interface CommandContext {
  callerId: string
  now: number
}

/** `room: null` means the last player left and the room should be dropped. */
export type CommandOutcome =
  | { ok: true; room: RoomRecord | null }
  | { ok: false; error: string }

const fail = (error: string): CommandOutcome => ({ ok: false, error })

export function emptyRoom(code: string, hostId: string, now: number): RoomRecord {
  return {
    code: normalizeLobbyCode(code),
    hostId,
    status: 'waiting',
    seats: [],
    game: null,
    log: [],
    logSeq: 0,
    updatedAt: now,
  }
}

export function applyCommand(
  input: RoomRecord,
  command: RoomCommand,
  ctx: CommandContext,
): CommandOutcome {
  const room: RoomRecord = structuredClone(input)
  room.updatedAt = ctx.now

  switch (command.type) {
    case 'join':
      return join(room, command.username, ctx)
    case 'setUsername':
      return rename(room, command.username, ctx)
    case 'addSeat':
      return addSeat(room, command.username, ctx)
    case 'removePlayer':
      return removePlayer(room, command.targetId, ctx)
    case 'start':
      return start(room, command.difficulty, ctx)
    case 'action':
      return act(room, command.action, ctx)
    case 'returnToLobby':
      return returnToLobby(room, ctx)
    case 'leave':
      return leave(room, ctx)
  }
}

function join(room: RoomRecord, username: string, ctx: CommandContext): CommandOutcome {
  const existing = room.seats.find((s) => s.playerId === ctx.callerId)
  if (existing) {
    // Reconnecting after a closed tab — keep the seat and the game exactly as it was.
    const name = sanitizeUsername(username)
    if (name) existing.username = name
    return { ok: true, room }
  }
  if (room.status === 'playing') return fail('That game has already started')
  if (room.seats.length >= MAX_LOBBY_PLAYERS) return fail('That table is full')

  room.seats.push({
    playerId: ctx.callerId,
    username: sanitizeUsername(username) || randomUsername(),
    ownerId: ctx.callerId,
  })
  if (room.seats.length === 1) room.hostId = ctx.callerId
  return { ok: true, room }
}

function rename(room: RoomRecord, username: string, ctx: CommandContext): CommandOutcome {
  const seat = room.seats.find((s) => s.playerId === ctx.callerId)
  if (!seat) return fail('You are not at this table')
  const name = sanitizeUsername(username)
  if (!name) return fail('Pick a name first')
  seat.username = name
  return { ok: true, room }
}

function addSeat(room: RoomRecord, username: string, ctx: CommandContext): CommandOutcome {
  if (room.hostId !== ctx.callerId) return fail('Only the host can add seats')
  if (room.status === 'playing') return fail('The game has already started')
  if (room.seats.length >= MAX_LOBBY_PLAYERS) return fail('That table is full')

  room.seats.push({
    playerId: `${ctx.callerId}:${room.seats.length}:${ctx.now.toString(36)}`,
    username: sanitizeUsername(username) || randomUsername(),
    ownerId: ctx.callerId,
  })
  return { ok: true, room }
}

function removePlayer(room: RoomRecord, targetId: string, ctx: CommandContext): CommandOutcome {
  if (room.hostId !== ctx.callerId) return fail('Only the host can remove players')
  if (targetId === ctx.callerId) return fail('You cannot remove yourself')
  if (room.status === 'playing') return fail('The game has already started')
  if (!room.seats.some((s) => s.playerId === targetId)) return fail('No such player')

  room.seats = room.seats.filter((s) => s.playerId !== targetId)
  return { ok: true, room }
}

function start(room: RoomRecord, difficulty: Difficulty, ctx: CommandContext): CommandOutcome {
  if (room.hostId !== ctx.callerId) return fail('Only the host can deal')
  if (room.status === 'playing') return fail('The game has already started')
  if (room.seats.length < 2) return fail('Sweep needs at least two players')

  room.status = 'playing'
  room.game = createGame({
    difficulty,
    players: room.seats.map((s) => ({ playerId: s.playerId, name: s.username })),
  })
  room.log = []
  return { ok: true, room }
}

function act(room: RoomRecord, action: GameAction, ctx: CommandContext): CommandOutcome {
  if (!room.game) return fail('No game in progress')
  const seat = room.seats.find((s) => s.playerId === action.playerId)
  if (!seat) return fail('No such player')
  if (seat.ownerId !== ctx.callerId) return fail('That is not your seat')

  const result = applyAction(room.game, action)
  if (result.error) return fail(result.error)
  room.game = result.state
  record(room, result.events)
  return { ok: true, room }
}

function returnToLobby(room: RoomRecord, ctx: CommandContext): CommandOutcome {
  if (!room.seats.some((s) => s.ownerId === ctx.callerId)) return fail('You are not at this table')
  // Only once the hand is over — otherwise one player could wipe a live game,
  // or clear the results overlay out from under everyone else.
  if (room.game && room.game.phase !== 'finished') return fail('The game is still going')
  room.status = 'waiting'
  room.game = null
  room.log = []
  return { ok: true, room }
}

function leave(room: RoomRecord, ctx: CommandContext): CommandOutcome {
  const mine = room.seats.filter((s) => s.ownerId === ctx.callerId)
  if (mine.length === 0) return { ok: true, room }

  // Forfeit before the seats disappear, so the engine can hand out the walkover.
  if (room.game && room.game.phase !== 'finished') {
    for (const seat of mine) {
      const result = applyAction(room.game, { type: 'forfeit', playerId: seat.playerId })
      if (!result.error) {
        room.game = result.state
        record(room, result.events)
      }
    }
  }

  room.seats = room.seats.filter((s) => s.ownerId !== ctx.callerId)
  if (room.seats.length === 0) return { ok: true, room: null }
  if (!room.seats.some((s) => s.playerId === room.hostId)) room.hostId = room.seats[0].playerId
  return { ok: true, room }
}

function record(room: RoomRecord, events: GameEvent[]): void {
  for (const event of events) room.log.push({ id: room.logSeq++, event })
  if (room.log.length > LOG_LIMIT) room.log = room.log.slice(-LOG_LIMIT)
}

/* ---- what a given browser is allowed to see ---- */

export interface RoomView {
  code: string
  hostId: string
  status: 'waiting' | 'playing'
  members: { playerId: string; username: string }[]
  ownedIds: string[]
  game: GameState | null
  log: { id: number; event: GameEvent }[]
  version: number
}

const hidden = (cards: Card[], tag: string): Card[] =>
  cards.map((_, index) => ({ id: `hidden-${tag}-${index}`, suit: 'spades', value: 0 }))

/**
 * Strips the cards a browser has no business knowing. Only counts survive for
 * other people's hands, so reading the network tab tells you nothing useful.
 */
export function viewOf(room: RoomRecord, callerId: string, version: number): RoomView {
  const ownedIds = room.seats.filter((s) => s.ownerId === callerId).map((s) => s.playerId)
  const game = room.game

  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    members: room.seats.map((s) => ({ playerId: s.playerId, username: s.username })),
    ownedIds,
    log: room.log,
    version,
    game: game && {
      ...game,
      rng: 0,
      deck: hidden(game.deck, 'deck'),
      graveyard: hidden(game.graveyard, 'grave'),
      players: game.players.map((player) =>
        ownedIds.includes(player.playerId)
          ? player
          : {
              ...player,
              hand: hidden(player.hand, `${player.playerId}-hand`),
              faceDown: hidden(player.faceDown, `${player.playerId}-down`),
            },
      ),
    },
  }
}
