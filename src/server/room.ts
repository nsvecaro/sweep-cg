import { applyAction, createGame } from '../engine/game.js'
import type { Card, Difficulty, GameAction, GameEvent, GameState } from '../engine/types.js'
import { normalizeLobbyCode } from '../lobby/codes.js'
import { EMOTE_COOLDOWN_MS, EMOTE_IDS } from '../lobby/emotes.js'
import { FINISHER_COOLDOWN_MS, FINISHER_GRADE_IDS, type FinisherGrade } from '../lobby/finishers.js'
import { randomUsername, sanitizeUsername } from '../lobby/names.js'
import { LOBBY_COUNTDOWN_MS, MAX_LOBBY_PLAYERS } from '../lobby/types.js'

const LOG_LIMIT = 80
const EMOTE_LOG_LIMIT = 20
/** At most one per seat per game, so this only has to bound a pathological client. */
const FINISHER_LOG_LIMIT = 8

export interface RoomEmote {
  id: number
  playerId: string
  emote: string
  at: number
}

/** Cosmetic only — the engine neither produces nor reads this. */
export interface RoomFinisher {
  id: number
  playerId: string
  grade: FinisherGrade
  at: number
}

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
  /** The host's live rules pick — every member sees this, only the host can change it. */
  difficulty: Difficulty
  /** Wall-clock deadline for the host's "deal" countdown; null when none is pending. */
  countdownEndsAt: number | null
  game: GameState | null
  log: { id: number; event: GameEvent }[]
  logSeq: number
  emotes: RoomEmote[]
  emoteSeq: number
  finishers: RoomFinisher[]
  finisherSeq: number
  updatedAt: number
}

export type RoomCommand =
  | { type: 'join'; username: string }
  | { type: 'setUsername'; username: string }
  | { type: 'addSeat'; username: string }
  | { type: 'removePlayer'; targetId: string }
  | { type: 'setDifficulty'; difficulty: Difficulty }
  | { type: 'beginCountdown' }
  | { type: 'start'; difficulty: Difficulty }
  | { type: 'action'; action: GameAction }
  | { type: 'emote'; playerId: string; emote: string }
  | { type: 'finisher'; playerId: string; grade: FinisherGrade }
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
    difficulty: 'medium',
    countdownEndsAt: null,
    game: null,
    log: [],
    logSeq: 0,
    emotes: [],
    emoteSeq: 0,
    finishers: [],
    finisherSeq: 0,
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
    case 'setDifficulty':
      return setDifficulty(room, command.difficulty, ctx)
    case 'beginCountdown':
      return beginCountdown(room, ctx)
    case 'start':
      return start(room, command.difficulty, ctx)
    case 'action':
      return act(room, command.action, ctx)
    case 'emote':
      return sendEmote(room, command.playerId, command.emote, ctx)
    case 'finisher':
      return sendFinisher(room, command.playerId, command.grade, ctx)
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
  if (room.countdownEndsAt !== null) return fail('The host is dealing — try again in a moment')
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
  room.countdownEndsAt = null
  return { ok: true, room }
}

function removePlayer(room: RoomRecord, targetId: string, ctx: CommandContext): CommandOutcome {
  if (room.hostId !== ctx.callerId) return fail('Only the host can remove players')
  if (targetId === ctx.callerId) return fail('You cannot remove yourself')
  if (room.status === 'playing') return fail('The game has already started')
  if (!room.seats.some((s) => s.playerId === targetId)) return fail('No such player')

  room.seats = room.seats.filter((s) => s.playerId !== targetId)
  room.countdownEndsAt = null
  return { ok: true, room }
}

function setDifficulty(room: RoomRecord, difficulty: Difficulty, ctx: CommandContext): CommandOutcome {
  if (room.hostId !== ctx.callerId) return fail('Only the host can set the rules')
  if (room.status === 'playing') return fail('The game has already started')
  room.difficulty = difficulty
  room.countdownEndsAt = null
  return { ok: true, room }
}

function beginCountdown(room: RoomRecord, ctx: CommandContext): CommandOutcome {
  if (room.hostId !== ctx.callerId) return fail('Only the host can deal')
  if (room.status === 'playing') return fail('The game has already started')
  if (room.seats.length < 2) return fail('Sweep needs at least two players')
  room.countdownEndsAt = ctx.now + LOBBY_COUNTDOWN_MS
  return { ok: true, room }
}

function start(room: RoomRecord, difficulty: Difficulty, ctx: CommandContext): CommandOutcome {
  if (room.hostId !== ctx.callerId) return fail('Only the host can deal')
  if (room.status === 'playing') return fail('The game has already started')
  if (room.seats.length < 2) return fail('Sweep needs at least two players')

  room.status = 'playing'
  room.countdownEndsAt = null
  room.game = createGame({
    difficulty,
    players: room.seats.map((s) => ({ playerId: s.playerId, name: s.username })),
    now: ctx.now,
  })
  room.log = []
  room.finishers = []
  return { ok: true, room }
}

function act(room: RoomRecord, action: GameAction, ctx: CommandContext): CommandOutcome {
  if (!room.game) return fail('No game in progress')
  // The clock is the table's to enforce, never a move a player can request for themself.
  if (action.type === 'timeout') return fail('The table enforces that automatically')
  const seat = room.seats.find((s) => s.playerId === action.playerId)
  if (!seat) return fail('No such player')
  if (seat.ownerId !== ctx.callerId) return fail('That is not your seat')

  const result = applyAction(room.game, action, ctx.now)
  if (result.error) return fail(result.error)
  room.game = result.state
  record(room, result.events)
  return { ok: true, room }
}

function sendEmote(room: RoomRecord, playerId: string, emote: string, ctx: CommandContext): CommandOutcome {
  if (!EMOTE_IDS.has(emote)) return fail('Unknown emote')
  const seat = room.seats.find((s) => s.playerId === playerId)
  if (!seat) return fail('No such player')
  if (seat.ownerId !== ctx.callerId) return fail('That is not your seat')

  // Rooms written before this feature shipped have no `emotes` array yet.
  room.emotes ??= []
  room.emoteSeq ??= 0
  const last = [...room.emotes].reverse().find((e) => e.playerId === playerId)
  if (last && ctx.now - last.at < EMOTE_COOLDOWN_MS) return fail('Not so fast')

  room.emotes.push({ id: room.emoteSeq++, playerId, emote, at: ctx.now })
  if (room.emotes.length > EMOTE_LOG_LIMIT) room.emotes = room.emotes.slice(-EMOTE_LOG_LIMIT)
  return { ok: true, room }
}

/**
 * Broadcasts how well a player timed their finishing throw, so the whole table
 * gets the same ending rather than only the device that made the gesture.
 *
 * The grade can't be derived server-side — it exists purely in the gesture —
 * so this trusts the client for it. That's fine: it changes no card and no
 * outcome. What it will not do is let a client fake the *moment*, hence the
 * `isFinished` guard. You can only announce a finisher for a seat you own,
 * that has actually gone out, in a game that actually exists.
 */
function sendFinisher(
  room: RoomRecord,
  playerId: string,
  grade: FinisherGrade,
  ctx: CommandContext,
): CommandOutcome {
  if (!FINISHER_GRADE_IDS.has(grade)) return fail('Unknown finisher grade')
  const seat = room.seats.find((s) => s.playerId === playerId)
  if (!seat) return fail('No such player')
  if (seat.ownerId !== ctx.callerId) return fail('That is not your seat')

  const player = room.game?.players.find((p) => p.playerId === playerId)
  if (!player?.isFinished) return fail('That player has not gone out')

  // Rooms written before this feature shipped have no `finishers` array yet.
  room.finishers ??= []
  room.finisherSeq ??= 0
  const last = [...room.finishers].reverse().find((f) => f.playerId === playerId)
  if (last && ctx.now - last.at < FINISHER_COOLDOWN_MS) return fail('Not so fast')

  room.finishers.push({ id: room.finisherSeq++, playerId, grade, at: ctx.now })
  if (room.finishers.length > FINISHER_LOG_LIMIT) {
    room.finishers = room.finishers.slice(-FINISHER_LOG_LIMIT)
  }
  return { ok: true, room }
}

// Slack behind the displayed 20s so a move that beat the clock client-side
// doesn't get overtaken by clock skew and the command's own network hop.
const TIMEOUT_GRACE_MS = 1000

/**
 * Called lazily from the API layer (on a poll or a command) instead of a
 * background timer — there's no long-running process to own one. Returns
 * null when nothing is due, so callers can skip the write entirely.
 */
export function applyDueTimeouts(input: RoomRecord, now: number): RoomRecord | null {
  const game = input.game
  if (!game || game.phase !== 'playing' || game.activePlayerId === null) return null
  if (game.turnEndsAt === null || now < game.turnEndsAt + TIMEOUT_GRACE_MS) return null

  const room: RoomRecord = structuredClone(input)
  room.updatedAt = now
  const result = applyAction(room.game!, { type: 'timeout', playerId: game.activePlayerId }, now)
  if (result.error) return null
  room.game = result.state
  record(room, result.events)
  return room
}

/**
 * Called lazily from the API layer, exactly like `applyDueTimeouts` — nothing
 * runs a background timer for a serverless room, so whichever client happens
 * to poll (or send a command) once the deadline passes deals the game on
 * everyone's behalf. Every path that shrinks or changes the lobby already
 * clears `countdownEndsAt`, so by the time this fires the seat count is
 * guaranteed still good.
 */
export function applyDueCountdown(input: RoomRecord, now: number): RoomRecord | null {
  const endsAt = input.countdownEndsAt
  if (typeof endsAt !== 'number' || now < endsAt) return null

  const room: RoomRecord = structuredClone(input)
  room.updatedAt = now
  const outcome = start(room, room.difficulty ?? 'medium', { callerId: room.hostId, now })
  return outcome.ok ? outcome.room : null
}

/** Runs both of a room's lazy due-checks in one pass, for the one call site that needs both. */
export function applyDueRoom(input: RoomRecord, now: number): RoomRecord | null {
  const afterCountdown = applyDueCountdown(input, now)
  const afterTimeout = applyDueTimeouts(afterCountdown ?? input, now)
  return afterTimeout ?? afterCountdown
}

function returnToLobby(room: RoomRecord, ctx: CommandContext): CommandOutcome {
  if (!room.seats.some((s) => s.ownerId === ctx.callerId)) return fail('You are not at this table')
  // Only once the hand is over — otherwise one player could wipe a live game,
  // or clear the results overlay out from under everyone else.
  if (room.game && room.game.phase !== 'finished') return fail('The game is still going')
  room.status = 'waiting'
  room.game = null
  room.log = []
  // A finisher belongs to the hand it ended. Left behind, a client joining
  // mid-way through the next game would replay last game's ending.
  room.finishers = []
  return { ok: true, room }
}

function leave(room: RoomRecord, ctx: CommandContext): CommandOutcome {
  const mine = room.seats.filter((s) => s.ownerId === ctx.callerId)
  if (mine.length === 0) return { ok: true, room }

  // Forfeit before the seats disappear, so the engine can hand out the walkover.
  if (room.game && room.game.phase !== 'finished') {
    for (const seat of mine) {
      const result = applyAction(room.game, { type: 'forfeit', playerId: seat.playerId }, ctx.now)
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
  difficulty: Difficulty
  countdownEndsAt: number | null
  members: { playerId: string; username: string }[]
  ownedIds: string[]
  game: GameState | null
  log: { id: number; event: GameEvent }[]
  emotes: RoomEmote[]
  finishers: RoomFinisher[]
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
    difficulty: room.difficulty ?? 'medium',
    countdownEndsAt: typeof room.countdownEndsAt === 'number' ? room.countdownEndsAt : null,
    members: room.seats.map((s) => ({ playerId: s.playerId, username: s.username })),
    ownedIds,
    log: room.log,
    emotes: room.emotes ?? [],
    finishers: room.finishers ?? [],
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
