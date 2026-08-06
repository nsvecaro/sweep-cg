import type { Difficulty } from '../engine/types.js'

export interface PlayerProfile {
  playerId: string
  username: string
}

export type LobbyStatus = 'waiting' | 'playing'

export interface Lobby {
  code: string
  hostId: string
  playerIds: string[]
  status: LobbyStatus
  /** The host's live rules pick — every member sees this, only the host can change it. */
  difficulty: Difficulty
  /** Wall-clock deadline for the host's "deal" countdown; null when none is pending. */
  countdownEndsAt: number | null
}

export type LobbyEvent =
  | { type: 'LobbyCreated'; code: string; hostId: string }
  | { type: 'PlayerJoined'; code: string; playerId: string }

export const MAX_LOBBY_PLAYERS = 6
/** How long the shared "starting…" countdown runs once the host presses deal. */
export const LOBBY_COUNTDOWN_MS = 5000
