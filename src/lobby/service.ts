import type { Difficulty } from '../engine/types.js'
import { generateLobbyCode, normalizeLobbyCode } from './codes.js'
import { randomUsername, sanitizeUsername } from './names.js'
import { MAX_LOBBY_PLAYERS, type Lobby, type LobbyEvent, type LobbyStatus, type PlayerProfile } from './types.js'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = <T>(error: string): Result<T> => ({ ok: false, error })

export class LobbyService {
  private profiles = new Map<string, PlayerProfile>()
  private lobbies = new Map<string, Lobby>()
  private listeners = new Set<(event: LobbyEvent) => void>()

  on(listener: (event: LobbyEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: LobbyEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  setUsername(playerId: string, username: string, isRandomized: boolean): Result<PlayerProfile> {
    const name = isRandomized ? sanitizeUsername(username || randomUsername()) : sanitizeUsername(username)
    if (name.length === 0) return fail('Pick a name first')
    const profile: PlayerProfile = { playerId, username: name }
    this.profiles.set(playerId, profile)
    return ok(profile)
  }

  createLobby(hostId: string): Result<Lobby> {
    if (!this.profiles.has(hostId)) return fail('Set a username before hosting')
    const code = generateLobbyCode((candidate) => this.lobbies.has(candidate))
    const lobby: Lobby = {
      code,
      hostId,
      playerIds: [hostId],
      status: 'waiting',
      difficulty: 'medium',
      countdownEndsAt: null,
    }
    this.lobbies.set(code, lobby)
    this.emit({ type: 'LobbyCreated', code, hostId })
    return ok(lobby)
  }

  joinLobby(rawCode: string, playerId: string): Result<Lobby> {
    if (!this.profiles.has(playerId)) return fail('Set a username before joining')
    const code = normalizeLobbyCode(rawCode)
    const lobby = this.lobbies.get(code)
    if (!lobby) return fail('No lobby with that code')
    if (lobby.status !== 'waiting') return fail('That game has already started')
    if (lobby.playerIds.includes(playerId)) return ok(lobby)
    if (lobby.countdownEndsAt !== null) return fail('The host is dealing — try again in a moment')
    if (lobby.playerIds.length >= MAX_LOBBY_PLAYERS) return fail('That lobby is full')

    lobby.playerIds.push(playerId)
    this.emit({ type: 'PlayerJoined', code, playerId })
    return ok(lobby)
  }

  leaveLobby(code: string, playerId: string): Result<Lobby | null> {
    const lobby = this.lobbies.get(normalizeLobbyCode(code))
    if (!lobby) return fail('No lobby with that code')
    lobby.playerIds = lobby.playerIds.filter((id) => id !== playerId)
    if (lobby.playerIds.length === 0) {
      this.lobbies.delete(lobby.code)
      return ok(null)
    }
    if (lobby.hostId === playerId) lobby.hostId = lobby.playerIds[0]
    lobby.countdownEndsAt = null
    return ok(lobby)
  }

  setStatus(code: string, status: LobbyStatus): Result<Lobby> {
    const lobby = this.lobbies.get(normalizeLobbyCode(code))
    if (!lobby) return fail('No lobby with that code')
    lobby.status = status
    lobby.countdownEndsAt = null
    return ok(lobby)
  }

  setDifficulty(code: string, difficulty: Difficulty): Result<Lobby> {
    const lobby = this.lobbies.get(normalizeLobbyCode(code))
    if (!lobby) return fail('No lobby with that code')
    lobby.difficulty = difficulty
    lobby.countdownEndsAt = null
    return ok(lobby)
  }

  beginCountdown(code: string, endsAt: number): Result<Lobby> {
    const lobby = this.lobbies.get(normalizeLobbyCode(code))
    if (!lobby) return fail('No lobby with that code')
    if (lobby.playerIds.length < 2) return fail('Sweep needs at least two players')
    lobby.countdownEndsAt = endsAt
    return ok(lobby)
  }

  cancelCountdown(code: string): void {
    const lobby = this.lobbies.get(normalizeLobbyCode(code))
    if (lobby) lobby.countdownEndsAt = null
  }

  registerProfile(profile: PlayerProfile): void {
    this.profiles.set(profile.playerId, profile)
  }

  getProfile(playerId: string): PlayerProfile | undefined {
    return this.profiles.get(playerId)
  }

  getLobby(code: string): Lobby | undefined {
    return this.lobbies.get(normalizeLobbyCode(code))
  }

  membersOf(code: string): PlayerProfile[] {
    const lobby = this.getLobby(code)
    if (!lobby) return []
    return lobby.playerIds.map(
      (id) => this.profiles.get(id) ?? { playerId: id, username: 'Unknown' },
    )
  }
}
