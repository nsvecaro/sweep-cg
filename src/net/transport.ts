import type { Difficulty, GameAction, GameEvent, GameState } from '@/engine'
import type { Lobby, PlayerProfile, Result } from '@/lobby'

export interface LogEntry {
  id: number
  event: GameEvent
}

export interface RoomSnapshot {
  selfId: string
  lobby: Lobby | null
  members: PlayerProfile[]
  botIds: string[]
  game: GameState | null
  log: LogEntry[]
}

/**
 * Everything the UI is allowed to know about where the game is running.
 * The local implementation keeps state in memory; a networked one would
 * satisfy the same shape over a socket with an authoritative server.
 */
export interface SweepTransport {
  readonly kind: 'local' | 'remote'
  readonly selfId: string
  snapshot(): RoomSnapshot
  subscribe(listener: (snapshot: RoomSnapshot) => void): () => void
  setUsername(username: string, isRandomized: boolean): Result<PlayerProfile>
  createLobby(): Result<Lobby>
  joinLobby(code: string): Result<Lobby>
  addBot(): Result<PlayerProfile>
  addLocalPlayer(username: string): Result<PlayerProfile>
  removePlayer(playerId: string): Result<null>
  startGame(difficulty: Difficulty): Result<null>
  dispatch(action: GameAction): Result<null>
  returnToLobby(): Result<null>
  leave(): void
}
