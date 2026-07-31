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
}

export type LobbyEvent =
  | { type: 'LobbyCreated'; code: string; hostId: string }
  | { type: 'PlayerJoined'; code: string; playerId: string }

export const MAX_LOBBY_PLAYERS = 6
