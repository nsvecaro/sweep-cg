import { describe, expect, it } from 'vitest'
import { TURN_MS } from '@/engine/game'
import { LOBBY_COUNTDOWN_MS } from '@/lobby'
import {
  applyCommand,
  applyDueCountdown,
  applyDueTimeouts,
  emptyRoom,
  viewOf,
  type RoomCommand,
  type RoomRecord,
} from '@/server/room'

const NOW = 1_700_000_000_000

const run = (room: RoomRecord, command: RoomCommand, callerId: string): RoomRecord => {
  const outcome = applyCommand(room, command, { callerId, now: NOW })
  if (!outcome.ok) throw new Error(outcome.error)
  if (!outcome.room) throw new Error('Room was dropped')
  return outcome.room
}

const refuse = (room: RoomRecord, command: RoomCommand, callerId: string): string => {
  const outcome = applyCommand(room, command, { callerId, now: NOW })
  if (outcome.ok) throw new Error('Expected a refusal')
  return outcome.error
}

/** A two-player table with the hand already dealt. */
const dealt = () => {
  let room = emptyRoom('TABLE', 'host', NOW)
  room = run(room, { type: 'join', username: 'Ana' }, 'host')
  room = run(room, { type: 'join', username: 'Bo' }, 'guest')
  return run(room, { type: 'start', difficulty: 'hard' }, 'host')
}

/** A two-player table still waiting in the lobby. */
const waiting = () => {
  let room = emptyRoom('TABLE', 'host', NOW)
  room = run(room, { type: 'join', username: 'Ana' }, 'host')
  return run(room, { type: 'join', username: 'Bo' }, 'guest')
}

describe('ONLINE room', () => {
  it('ROOM_JOIN — the first player to join becomes the host', () => {
    let room = emptyRoom('TABLE', 'host', NOW)
    room = run(room, { type: 'join', username: 'Ana' }, 'host')
    room = run(room, { type: 'join', username: 'Bo' }, 'guest')

    expect(room.hostId).toBe('host')
    expect(room.seats.map((s) => s.username)).toEqual(['Ana', 'Bo'])
  })

  it('ROOM_REJOIN — joining again with the same id keeps the seat and the game', () => {
    const room = dealt()
    const hand = room.game!.players[0].hand.length

    const back = run(room, { type: 'join', username: 'Ana' }, 'host')

    expect(back.seats).toHaveLength(2)
    expect(back.game).not.toBeNull()
    expect(back.game!.players[0].hand).toHaveLength(hand)
  })

  it('ROOM_CLOSED — a stranger cannot join a game already in progress', () => {
    expect(refuse(dealt(), { type: 'join', username: 'Cy' }, 'latecomer')).toBe(
      'That game has already started',
    )
  })

  it('ROOM_HOST — only the host can deal or remove players', () => {
    let room = emptyRoom('TABLE', 'host', NOW)
    room = run(room, { type: 'join', username: 'Ana' }, 'host')
    room = run(room, { type: 'join', username: 'Bo' }, 'guest')

    expect(refuse(room, { type: 'start', difficulty: 'hard' }, 'guest')).toBe(
      'Only the host can deal',
    )
    expect(refuse(room, { type: 'removePlayer', targetId: 'host' }, 'guest')).toBe(
      'Only the host can remove players',
    )
  })

  it('ROOM_SEATS — you cannot play a seat you do not own', () => {
    const room = dealt()
    const active = room.game!.activePlayerId!
    const thief = active === 'host' ? 'guest' : 'host'

    const error = refuse(room, { type: 'action', action: { type: 'pickUpPile', playerId: active } }, thief)

    expect(error).toBe('That is not your seat')
  })

  it('ROOM_TURNS — the engine still refuses a move out of turn', () => {
    const room = dealt()
    const idle = room.game!.activePlayerId === 'host' ? 'guest' : 'host'

    expect(refuse(room, { type: 'action', action: { type: 'pickUpPile', playerId: idle } }, idle)).toBe(
      'Not your turn',
    )
  })

  it('ROOM_LEAVE — leaving a two-player game hands the win to the other player', () => {
    const room = dealt()

    const after = run(room, { type: 'leave' }, 'guest')

    expect(after.seats.map((s) => s.playerId)).toEqual(['host'])
    expect(after.game!.phase).toBe('finished')
    expect(after.game!.finishOrder).toEqual(['host'])
    expect(after.log.map((e) => e.event.type)).toContain('PlayerLeft')
  })

  it('ROOM_LEAVE — the last player out drops the room entirely', () => {
    const room = run(dealt(), { type: 'leave' }, 'guest')

    const outcome = applyCommand(room, { type: 'leave' }, { callerId: 'host', now: NOW })

    expect(outcome).toEqual({ ok: true, room: null })
  })

  it('ROOM_LEAVE — the host badge moves to whoever is still there', () => {
    let room = emptyRoom('TABLE', 'host', NOW)
    room = run(room, { type: 'join', username: 'Ana' }, 'host')
    room = run(room, { type: 'join', username: 'Bo' }, 'guest')

    const after = run(room, { type: 'leave' }, 'host')

    expect(after.hostId).toBe('guest')
  })

  it('ROOM_PASS — a host seat added for this device is played by the host', () => {
    let room = emptyRoom('TABLE', 'host', NOW)
    room = run(room, { type: 'join', username: 'Ana' }, 'host')
    room = run(room, { type: 'addSeat', username: 'Kid' }, 'host')

    expect(room.seats).toHaveLength(2)
    expect(room.seats[1].ownerId).toBe('host')

    // Leaving takes both of the host's seats with it, so the room empties.
    const started = run(room, { type: 'start', difficulty: 'hard' }, 'host')
    const outcome = applyCommand(started, { type: 'leave' }, { callerId: 'host', now: NOW })
    expect(outcome).toEqual({ ok: true, room: null })
  })

  it('ROOM_SECRET — a player never receives another player’s cards', () => {
    const room = dealt()

    const view = viewOf(room, 'guest', 4)
    const mine = view.game!.players.find((p) => p.playerId === 'guest')!
    const theirs = view.game!.players.find((p) => p.playerId === 'host')!
    const realHost = room.game!.players.find((p) => p.playerId === 'host')!

    expect(view.ownedIds).toEqual(['guest'])
    expect(mine.hand.map((c) => c.id)).toEqual(
      room.game!.players.find((p) => p.playerId === 'guest')!.hand.map((c) => c.id),
    )
    // Counts survive so the table still renders; the identities do not.
    expect(theirs.hand).toHaveLength(realHost.hand.length)
    expect(theirs.hand.every((c) => c.value === 0)).toBe(true)
    expect(theirs.hand.some((c) => realHost.hand.some((r) => r.id === c.id))).toBe(false)
    // Face-up cards are meant to be seen by everyone.
    expect(theirs.faceUp.map((c) => c.id)).toEqual(realHost.faceUp.map((c) => c.id))
  })

  it('ROOM_SECRET — the undealt deck and the shuffle state stay on the server', () => {
    const room = dealt()

    const view = viewOf(room, 'guest', 1)

    expect(view.game!.rng).toBe(0)
    expect(view.game!.deck).toHaveLength(room.game!.deck.length)
    expect(view.game!.deck.every((c) => c.value === 0)).toBe(true)
  })

  it('ROOM_FULL — a seventh player is turned away', () => {
    let room = emptyRoom('TABLE', 'host', NOW)
    for (let i = 0; i < 6; i++) room = run(room, { type: 'join', username: `P${i}` }, `p${i}`)

    expect(refuse(room, { type: 'join', username: 'Late' }, 'late')).toBe('That table is full')
  })

  it('ROOM_RESET — a live game cannot be wiped by one player', () => {
    expect(refuse(dealt(), { type: 'returnToLobby' }, 'guest')).toBe('The game is still going')
  })

  it('ROOM_RESET — once the game is over, either player can deal again', () => {
    const finished = run(dealt(), { type: 'leave' }, 'guest')
    expect(finished.game!.phase).toBe('finished')

    const room = run(finished, { type: 'returnToLobby' }, 'host')

    expect(room.status).toBe('waiting')
    expect(room.game).toBeNull()
    expect(room.log).toEqual([])
  })

  it('ROOM_TIMEOUT — a player cannot request their own timeout as a command', () => {
    const room = dealt()
    const active = room.game!.activePlayerId!

    expect(refuse(room, { type: 'action', action: { type: 'timeout', playerId: active } }, active)).toBe(
      'The table enforces that automatically',
    )
  })

  it('ROOM_TIMEOUT — applyDueTimeouts does nothing before the deadline', () => {
    const room = dealt()
    expect(applyDueTimeouts(room, room.game!.turnEndsAt! - 1)).toBeNull()
  })

  it('ROOM_TIMEOUT — applyDueTimeouts gives a grace window past the displayed deadline', () => {
    const room = dealt()
    // A move that beat the clock client-side can still land a moment late over the wire.
    expect(applyDueTimeouts(room, room.game!.turnEndsAt!)).toBeNull()
    expect(applyDueTimeouts(room, room.game!.turnEndsAt! + 500)).toBeNull()
  })

  it('ROOM_TIMEOUT — applyDueTimeouts punishes the stalled player once the grace window passes', () => {
    const room = dealt()
    const active = room.game!.activePlayerId!

    const dueAt = room.game!.turnEndsAt! + 1000
    const settled = applyDueTimeouts(room, dueAt)!

    expect(settled).not.toBeNull()
    expect(settled.game!.activePlayerId).not.toBe(active)
    expect(settled.log.map((e) => e.event.type)).toContain('PlayerTimedOut')
    expect(settled.game!.turnEndsAt).toBe(dueAt + TURN_MS)
  })

  it('ROOM_DIFFICULTY — only the host can set the rules, and it broadcasts to the whole lobby', () => {
    const room = waiting()

    expect(refuse(room, { type: 'setDifficulty', difficulty: 'hard' }, 'guest')).toBe(
      'Only the host can set the rules',
    )

    const picked = run(room, { type: 'setDifficulty', difficulty: 'hard' }, 'host')
    expect(picked.difficulty).toBe('hard')
    expect(viewOf(picked, 'guest', 1).difficulty).toBe('hard')
  })

  it('ROOM_COUNTDOWN — only the host can start the deal countdown, and it needs two players', () => {
    let room = emptyRoom('TABLE', 'host', NOW)
    room = run(room, { type: 'join', username: 'Ana' }, 'host')

    expect(refuse(room, { type: 'beginCountdown' }, 'host')).toBe('Sweep needs at least two players')

    room = run(room, { type: 'join', username: 'Bo' }, 'guest')
    expect(refuse(room, { type: 'beginCountdown' }, 'guest')).toBe('Only the host can deal')

    const counting = run(room, { type: 'beginCountdown' }, 'host')
    expect(counting.countdownEndsAt).toBe(NOW + LOBBY_COUNTDOWN_MS)
    expect(counting.status).toBe('waiting')
  })

  it('ROOM_COUNTDOWN — nobody new can join while the deal countdown is running', () => {
    const room = run(waiting(), { type: 'beginCountdown' }, 'host')

    expect(refuse(room, { type: 'join', username: 'Cy' }, 'latecomer')).toBe(
      'The host is dealing — try again in a moment',
    )
  })

  it('ROOM_COUNTDOWN — removing a player cancels a pending countdown', () => {
    let room = emptyRoom('TABLE', 'host', NOW)
    room = run(room, { type: 'join', username: 'Ana' }, 'host')
    room = run(room, { type: 'join', username: 'Bo' }, 'guest')
    room = run(room, { type: 'addSeat', username: 'Kid' }, 'host')
    room = run(room, { type: 'beginCountdown' }, 'host')
    expect(room.countdownEndsAt).not.toBeNull()

    const after = run(room, { type: 'removePlayer', targetId: 'guest' }, 'host')
    expect(after.countdownEndsAt).toBeNull()
  })

  it('ROOM_COUNTDOWN — applyDueCountdown does nothing before the deadline', () => {
    const room = run(waiting(), { type: 'beginCountdown' }, 'host')
    expect(applyDueCountdown(room, room.countdownEndsAt! - 1)).toBeNull()
  })

  it('ROOM_COUNTDOWN — applyDueCountdown deals once the deadline passes, using the host’s chosen rules', () => {
    let room = run(waiting(), { type: 'setDifficulty', difficulty: 'hard' }, 'host')
    room = run(room, { type: 'beginCountdown' }, 'host')

    const dealtRoom = applyDueCountdown(room, room.countdownEndsAt!)!

    expect(dealtRoom).not.toBeNull()
    expect(dealtRoom.status).toBe('playing')
    expect(dealtRoom.countdownEndsAt).toBeNull()
    expect(dealtRoom.game!.difficulty).toBe('hard')
  })

  // ---- finisher broadcast ----------------------------------------------
  // Cosmetic, and trusted for its *grade* (only the gesture knows that), but
  // not for who or when. These guard the parts a client could otherwise lie about.

  /** Puts `playerId` legitimately out, so a finisher may be announced for them. */
  const wentOut = (room: RoomRecord, playerId: string): RoomRecord => {
    const next: RoomRecord = structuredClone(room)
    const player = next.game!.players.find((p) => p.playerId === playerId)!
    player.isFinished = true
    return next
  }

  it('ROOM_FINISHER — a player who has gone out can announce how they timed it', () => {
    const room = run(wentOut(dealt(), 'host'), { type: 'finisher', playerId: 'host', grade: 'perfect' }, 'host')

    expect(room.finishers).toHaveLength(1)
    expect(room.finishers[0]).toMatchObject({ playerId: 'host', grade: 'perfect' })
    // Everyone at the table can read it — that is the entire point of the channel.
    expect(viewOf(room, 'guest', 1).finishers).toEqual(room.finishers)
  })

  it('ROOM_FINISHER — you cannot announce one for somebody else’s seat', () => {
    const room = wentOut(dealt(), 'host')
    expect(refuse(room, { type: 'finisher', playerId: 'host', grade: 'perfect' }, 'guest')).toMatch(/your seat/i)
  })

  it('ROOM_FINISHER — you cannot announce one before actually going out', () => {
    expect(refuse(dealt(), { type: 'finisher', playerId: 'host', grade: 'perfect' }, 'host')).toMatch(/gone out/i)
  })

  it('ROOM_FINISHER — a grade the UI has no animation for is refused', () => {
    const room = wentOut(dealt(), 'host')
    const command = { type: 'finisher', playerId: 'host', grade: 'flawless' } as unknown as RoomCommand
    expect(refuse(room, command, 'host')).toMatch(/unknown finisher/i)
  })

  it('ROOM_FINISHER — the same seat cannot spam the table with endings', () => {
    const room = run(wentOut(dealt(), 'host'), { type: 'finisher', playerId: 'host', grade: 'perfect' }, 'host')
    expect(refuse(room, { type: 'finisher', playerId: 'host', grade: 'clean' }, 'host')).toMatch(/not so fast/i)
  })

  it('ROOM_FINISHER — an ending belongs to its own hand and never leaks into the next', () => {
    let room = run(wentOut(dealt(), 'host'), { type: 'finisher', playerId: 'host', grade: 'perfect' }, 'host')
    room.game!.phase = 'finished'

    room = run(room, { type: 'returnToLobby' }, 'host')
    expect(room.finishers).toEqual([])

    room = run(room, { type: 'start', difficulty: 'medium' }, 'host')
    expect(room.finishers).toEqual([])
  })
})
