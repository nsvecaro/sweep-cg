import { describe, expect, it } from 'vitest'
import { LOBBY_CODE_LENGTH, isValidLobbyCode, normalizeLobbyCode } from '@/lobby/codes'
import { randomUsername, sanitizeUsername } from '@/lobby/names'
import { LobbyService } from '@/lobby/service'
import type { LobbyEvent } from '@/lobby/types'

const withRecorder = () => {
  const service = new LobbyService()
  const events: LobbyEvent[] = []
  service.on((event) => events.push(event))
  return { service, events }
}

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('MULTIPLAYER lobby', () => {
  it('PLAYER_NAME — a chosen username is saved against the player', () => {
    const { service } = withRecorder()
    const profile = unwrap(service.setUsername('p1', '  Noel  ', false))

    expect(profile).toEqual({ playerId: 'p1', username: 'Noel' })
    expect(service.getProfile('p1')?.username).toBe('Noel')
  })

  it('PLAYER_NAME — a randomized username is non-empty and within the length cap', () => {
    const { service } = withRecorder()
    for (let i = 0; i < 50; i++) {
      const name = randomUsername()
      expect(name.length).toBeGreaterThan(0)
      expect(sanitizeUsername(name)).toBe(name)
    }
    expect(unwrap(service.setUsername('p1', randomUsername(), true)).username.length).toBeGreaterThan(0)
  })

  it('PLAYER_NAME — an empty username is refused', () => {
    const { service } = withRecorder()
    const result = service.setUsername('p1', '   ', false)
    expect(result.ok).toBe(false)
  })

  it('LOBBY_CREATE — the creator becomes the host and the only member', () => {
    const { service, events } = withRecorder()
    service.setUsername('p1', 'Host', false)
    const lobby = unwrap(service.createLobby('p1'))

    expect(lobby.hostId).toBe('p1')
    expect(lobby.playerIds).toEqual(['p1'])
    expect(lobby.status).toBe('waiting')
    expect(events).toContainEqual({ type: 'LobbyCreated', code: lobby.code, hostId: 'p1' })
  })

  it('LOBBY_CREATE — hosting requires a username', () => {
    const { service } = withRecorder()
    expect(service.createLobby('p1').ok).toBe(false)
  })

  it('LOBBY_CODE — every code is five alphanumeric characters and unique', () => {
    const { service } = withRecorder()
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) {
      const id = `p${i}`
      service.setUsername(id, `P${i}`, false)
      const lobby = unwrap(service.createLobby(id))
      expect(lobby.code).toHaveLength(LOBBY_CODE_LENGTH)
      expect(isValidLobbyCode(lobby.code)).toBe(true)
      expect(seen.has(lobby.code)).toBe(false)
      seen.add(lobby.code)
    }
  })

  it('LOBBY_JOIN — a second player joins with the code and is added to the roster', () => {
    const { service, events } = withRecorder()
    service.setUsername('p1', 'Host', false)
    service.setUsername('p2', 'Guest', false)
    const lobby = unwrap(service.createLobby('p1'))

    const joined = unwrap(service.joinLobby(lobby.code.toLowerCase(), 'p2'))
    expect(joined.playerIds).toEqual(['p1', 'p2'])
    expect(service.membersOf(lobby.code).map((m) => m.username)).toEqual(['Host', 'Guest'])
    expect(events).toContainEqual({ type: 'PlayerJoined', code: lobby.code, playerId: 'p2' })
  })

  it('LOBBY_JOIN — an unknown code is refused', () => {
    const { service } = withRecorder()
    service.setUsername('p2', 'Guest', false)
    expect(service.joinLobby('ZZZZZ', 'p2').ok).toBe(false)
  })

  it('LOBBY_JOIN — a lobby already playing cannot be joined', () => {
    const { service } = withRecorder()
    service.setUsername('p1', 'Host', false)
    service.setUsername('p2', 'Guest', false)
    const lobby = unwrap(service.createLobby('p1'))
    service.setStatus(lobby.code, 'playing')

    expect(service.joinLobby(lobby.code, 'p2').ok).toBe(false)
  })

  it('LOBBY_CODE — codes are normalized from whatever the player types', () => {
    expect(normalizeLobbyCode(' ab-c d ')).toBe('ABCD')
    expect(isValidLobbyCode('abcde')).toBe(true)
    expect(isValidLobbyCode('abcd')).toBe(false)
    expect(isValidLobbyCode('ABC0I')).toBe(false)
  })

  it('the host seat passes on when the host leaves, and an empty lobby closes', () => {
    const { service } = withRecorder()
    service.setUsername('p1', 'Host', false)
    service.setUsername('p2', 'Guest', false)
    const lobby = unwrap(service.createLobby('p1'))
    service.joinLobby(lobby.code, 'p2')

    expect(unwrap(service.leaveLobby(lobby.code, 'p1'))?.hostId).toBe('p2')
    expect(unwrap(service.leaveLobby(lobby.code, 'p2'))).toBeNull()
    expect(service.getLobby(lobby.code)).toBeUndefined()
  })
})
