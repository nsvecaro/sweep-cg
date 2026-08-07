import type { Difficulty, GameAction, GameEvent, GameState } from '@/engine'
import type { FinisherGrade, Lobby, PlayerProfile, Result } from '@/lobby'

export interface LogEntry {
  id: number
  event: GameEvent
}

export interface EmoteEntry {
  id: number
  playerId: string
  emote: string
  at: number
}

/**
 * How a player timed their finishing throw. Cosmetic, and its own channel
 * rather than a game event: the grade only exists on the device that made the
 * gesture, and the whole table should see the ending it earned.
 */
export interface FinisherEntry {
  id: number
  playerId: string
  grade: FinisherGrade
  at: number
}

export interface RoomSnapshot {
  selfId: string
  lobby: Lobby | null
  members: PlayerProfile[]
  botIds: string[]
  /** Seats this browser plays: yourself plus any pass-and-play seats you added. */
  ownedIds: string[]
  game: GameState | null
  log: LogEntry[]
  emotes: EmoteEntry[]
  /** Finishing throws announced this game, oldest first. */
  finishers: FinisherEntry[]
  /** Set when the room is unreachable; the UI shows it instead of the table. */
  connection?: 'online' | 'offline'
}

/**
 * Everything the UI is allowed to know about where the game is running.
 * Commands are asynchronous because a networked room answers over the wire;
 * snapshots stay synchronous and arrive by subscription either way.
 */
export interface SweepTransport {
  readonly kind: 'local' | 'remote'
  readonly selfId: string
  snapshot(): RoomSnapshot
  subscribe(listener: (snapshot: RoomSnapshot) => void): () => void
  setUsername(username: string, isRandomized: boolean): Promise<Result<PlayerProfile>>
  createLobby(): Promise<Result<Lobby>>
  joinLobby(code: string): Promise<Result<Lobby>>
  addBot(): Promise<Result<PlayerProfile>>
  addLocalPlayer(username: string): Promise<Result<PlayerProfile>>
  removePlayer(playerId: string): Promise<Result<null>>
  /** Broadcasts the host's rules pick to the whole lobby. */
  setDifficulty(difficulty: Difficulty): Promise<Result<null>>
  /** Host-only: begins the shared countdown that ends in `startGame`. */
  startCountdown(): Promise<Result<null>>
  startGame(difficulty: Difficulty): Promise<Result<null>>
  dispatch(action: GameAction): Promise<Result<null>>
  /** Fire-and-forget table talk — not a game move, so it never touches the engine. */
  sendEmote(playerId: string, emote: string): Promise<Result<null>>
  /** Tells the table how a finishing throw was timed, so everyone sees the same ending. */
  sendFinisher(playerId: string, grade: FinisherGrade): Promise<Result<null>>
  returnToLobby(): Promise<Result<null>>
  /** Forfeits any game in progress, then drops the seat from the room. */
  leave(): Promise<void>
}
