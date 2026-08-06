import {
  applyAction,
  chooseBotAction,
  chooseBotFaceUpCards,
  createGame,
  type Difficulty,
  type GameAction,
  type GameEvent,
  type GameState,
} from '@/engine'
import {
  LOBBY_COUNTDOWN_MS,
  LobbyService,
  MAX_LOBBY_PLAYERS,
  randomUsername,
  type Lobby,
  type PlayerProfile,
  type Result,
} from '@/lobby'
import type { LogEntry, RoomSnapshot, SweepTransport } from './transport'

const BOT_DELAY_MS = 750
const LOG_LIMIT = 80

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = <T>(error: string): Result<T> => ({ ok: false, error })

let idCounter = 0
const nextId = (prefix: string) => `${prefix}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export class LocalTransport implements SweepTransport {
  readonly kind = 'local' as const
  readonly selfId = nextId('you')

  private lobbyService = new LobbyService()
  private code: string | null = null
  private botIds = new Set<string>()
  private ownedIds = new Set<string>([this.selfId])
  private game: GameState | null = null
  private log: LogEntry[] = []
  private logSeq = 0
  private listeners = new Set<(snapshot: RoomSnapshot) => void>()
  private botTimer: ReturnType<typeof setTimeout> | null = null
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null
  private countdownTimer: ReturnType<typeof setTimeout> | null = null

  snapshot(): RoomSnapshot {
    return {
      selfId: this.selfId,
      lobby: this.code ? (this.lobbyService.getLobby(this.code) ?? null) : null,
      members: this.code ? this.lobbyService.membersOf(this.code) : [],
      botIds: [...this.botIds],
      ownedIds: [...this.ownedIds],
      game: this.game,
      log: this.log,
    }
  }

  subscribe(listener: (snapshot: RoomSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  private publish(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }

  async setUsername(username: string, isRandomized: boolean): Promise<Result<PlayerProfile>> {
    const result = this.lobbyService.setUsername(this.selfId, username, isRandomized)
    if (result.ok) this.publish()
    return result
  }

  async createLobby(): Promise<Result<Lobby>> {
    const result = this.lobbyService.createLobby(this.selfId)
    if (result.ok) {
      this.code = result.value.code
      this.publish()
    }
    return result
  }

  async joinLobby(code: string): Promise<Result<Lobby>> {
    const result = this.lobbyService.joinLobby(code, this.selfId)
    if (result.ok) {
      this.code = result.value.code
      this.publish()
    }
    return result
  }

  async addBot(): Promise<Result<PlayerProfile>> {
    const seat = this.addSeat(`${randomUsername()}`)
    if (seat.ok) {
      this.botIds.add(seat.value.playerId)
      // A bot seat is not a pass-and-play seat. Leaving it owned makes the app
      // stop and ask a human to identify as the bot before every bot turn.
      this.ownedIds.delete(seat.value.playerId)
    }
    this.publish()
    return seat
  }

  async addLocalPlayer(username: string): Promise<Result<PlayerProfile>> {
    const seat = this.addSeat(username || randomUsername())
    this.publish()
    return seat
  }

  private addSeat(username: string): Result<PlayerProfile> {
    const lobby = this.requireLobby()
    if (!lobby.ok) return fail(lobby.error)
    if (lobby.value.playerIds.length >= MAX_LOBBY_PLAYERS) return fail('That lobby is full')

    const playerId = nextId('seat')
    this.lobbyService.registerProfile({ playerId, username })
    const joined = this.lobbyService.joinLobby(lobby.value.code, playerId)
    if (!joined.ok) return fail(joined.error)
    this.ownedIds.add(playerId)
    return ok({ playerId, username })
  }

  async removePlayer(playerId: string): Promise<Result<null>> {
    const lobby = this.requireLobby()
    if (!lobby.ok) return fail(lobby.error)
    if (playerId === this.selfId) return fail('You cannot remove yourself')
    const result = this.lobbyService.leaveLobby(lobby.value.code, playerId)
    if (!result.ok) return fail(result.error)
    this.botIds.delete(playerId)
    this.ownedIds.delete(playerId)
    this.clearCountdownTimer()
    this.publish()
    return ok(null)
  }

  async setDifficulty(difficulty: Difficulty): Promise<Result<null>> {
    const lobby = this.requireLobby()
    if (!lobby.ok) return fail(lobby.error)
    const result = this.lobbyService.setDifficulty(lobby.value.code, difficulty)
    if (!result.ok) return fail(result.error)
    this.clearCountdownTimer()
    this.publish()
    return ok(null)
  }

  async startCountdown(): Promise<Result<null>> {
    const lobby = this.requireLobby()
    if (!lobby.ok) return fail(lobby.error)
    const result = this.lobbyService.beginCountdown(lobby.value.code, Date.now() + LOBBY_COUNTDOWN_MS)
    if (!result.ok) return fail(result.error)
    this.publish()

    this.clearCountdownTimer()
    const code = lobby.value.code
    this.countdownTimer = setTimeout(() => {
      this.countdownTimer = null
      this.finishCountdown(code)
    }, LOBBY_COUNTDOWN_MS)
    return ok(null)
  }

  /** Fires once the shared countdown reaches zero — deals, unless something cancelled it first. */
  private finishCountdown(code: string): void {
    const lobby = this.lobbyService.getLobby(code)
    if (!lobby || lobby.countdownEndsAt === null) return
    void this.startGame(lobby.difficulty)
  }

  async startGame(difficulty: Difficulty): Promise<Result<null>> {
    const lobby = this.requireLobby()
    if (!lobby.ok) return fail(lobby.error)
    if (lobby.value.playerIds.length < 2) return fail('Sweep needs at least two players')

    this.lobbyService.setStatus(lobby.value.code, 'playing')
    this.game = createGame({
      difficulty,
      players: this.lobbyService.membersOf(lobby.value.code).map((p) => ({
        playerId: p.playerId,
        name: p.username,
        isBot: this.botIds.has(p.playerId),
      })),
    })
    this.log = []
    this.publish()
    this.scheduleBot()
    this.scheduleTimeout()
    return ok(null)
  }

  async dispatch(action: GameAction): Promise<Result<null>> {
    return this.applyLocally(action)
  }

  private applyLocally(action: GameAction): Result<null> {
    if (!this.game) return fail('No game in progress')
    const result = applyAction(this.game, action)
    if (result.error) return fail(result.error)
    this.game = result.state
    this.record(result.events)
    this.publish()
    this.scheduleBot()
    this.scheduleTimeout()
    return ok(null)
  }

  async returnToLobby(): Promise<Result<null>> {
    const lobby = this.requireLobby()
    if (!lobby.ok) return fail(lobby.error)
    this.clearBotTimer()
    this.clearTimeoutTimer()
    this.game = null
    this.log = []
    this.lobbyService.setStatus(lobby.value.code, 'waiting')
    this.publish()
    return ok(null)
  }

  async leave(): Promise<void> {
    if (this.game && this.game.phase !== 'finished') {
      this.applyLocally({ type: 'forfeit', playerId: this.selfId })
    }
    this.clearBotTimer()
    this.clearTimeoutTimer()
    this.clearCountdownTimer()
    if (this.code) this.lobbyService.leaveLobby(this.code, this.selfId)
    this.code = null
    this.game = null
    this.log = []
    this.botIds.clear()
    this.ownedIds = new Set([this.selfId])
    this.publish()
  }

  private requireLobby(): Result<Lobby> {
    const lobby = this.code ? this.lobbyService.getLobby(this.code) : undefined
    return lobby ? ok(lobby) : fail('You are not in a lobby')
  }

  private record(events: GameEvent[]): void {
    for (const event of events) {
      this.log = [...this.log, { id: this.logSeq++, event }]
    }
    if (this.log.length > LOG_LIMIT) this.log = this.log.slice(-LOG_LIMIT)
  }

  private clearBotTimer(): void {
    if (this.botTimer !== null) clearTimeout(this.botTimer)
    this.botTimer = null
  }

  private clearTimeoutTimer(): void {
    if (this.timeoutTimer !== null) clearTimeout(this.timeoutTimer)
    this.timeoutTimer = null
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer !== null) clearTimeout(this.countdownTimer)
    this.countdownTimer = null
  }

  /**
   * No server here to enforce the clock lazily — this device owns the whole
   * game, so it fires the punishment itself once the deadline passes.
   */
  private scheduleTimeout(): void {
    this.clearTimeoutTimer()
    const game = this.game
    if (!game || game.phase !== 'playing' || !game.activePlayerId || game.turnEndsAt === null) return

    const activePlayerId = game.activePlayerId
    const turn = game.turn
    const wait = Math.max(0, game.turnEndsAt - Date.now())
    this.timeoutTimer = setTimeout(() => {
      this.timeoutTimer = null
      if (!this.game || this.game.turn !== turn || this.game.activePlayerId !== activePlayerId) return
      this.applyLocally({ type: 'timeout', playerId: activePlayerId })
    }, wait)
  }

  private scheduleBot(): void {
    this.clearBotTimer()
    const action = this.pendingBotAction()
    if (!action) return
    this.botTimer = setTimeout(() => {
      this.botTimer = null
      const current = this.pendingBotAction()
      if (current) this.applyLocally(current)
    }, BOT_DELAY_MS)
  }

  private pendingBotAction(): GameAction | null {
    const game = this.game
    if (!game) return null

    if (game.phase === 'setup') {
      const waiting = game.players.find((p) => this.botIds.has(p.playerId) && p.faceUp.length === 0)
      if (!waiting) return null
      return {
        type: 'setFaceUpCards',
        playerId: waiting.playerId,
        cardIds: chooseBotFaceUpCards(game, waiting.playerId),
      }
    }
    if (game.phase !== 'playing' || !game.activePlayerId) return null
    if (!this.botIds.has(game.activePlayerId)) return null
    return chooseBotAction(game, game.activePlayerId)
  }
}
