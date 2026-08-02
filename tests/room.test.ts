import { describe, expect, it } from 'vitest'
import { TURN_MS } from '@/engine/game'
import { applyCommand, applyDueTimeouts, emptyRoom, viewOf, type RoomCommand, type RoomRecord } from '@/server/room'

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
})
