import type { Difficulty, GameAction } from '@/engine'
import { sanitizeUsername, type FinisherGrade, type Lobby, type PlayerProfile, type Result } from '@/lobby'
import type { RoomView } from '@/server/room'
import type { EmoteEntry, FinisherEntry, LogEntry, RoomSnapshot, SweepTransport } from './transport'

const POLL_MS = 1100
// A lobby waiting to deal still needs to notice a host-started countdown quickly —
// that pending setTimeout is scheduled before the countdown exists, so a slow idle
// cadence here means a guest's first sight of "starting…" lands most of the way through it.
const IDLE_POLL_MS = 1200
const ID_KEY = 'sweep:playerId'
const ROOM_KEY = 'sweep:room'

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = <T>(error: string): Result<T> => ({ ok: false, error })

interface Stored {
  code: string
  username: string
}

function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing with storage disabled: the session just won't survive a reload.
  }
}

/** Stable across reloads, so closing the tab does not cost you your seat. */
function playerId(): string {
  const existing = readStorage<string>(ID_KEY)
  if (existing) return existing
  const fresh = `p-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
  writeStorage(ID_KEY, fresh)
  return fresh
}

/**
 * Talks to the room held on the server. Commands go up over HTTP and the
 * authoritative state comes back; a poll fills in whatever the other players did.
 */
export class RemoteTransport implements SweepTransport {
  readonly kind = 'remote' as const
  readonly selfId = playerId()

  private username = ''
  private code: string | null = null
  private view: RoomView | null = null
  private connection: 'online' | 'offline' = 'online'
  private listeners = new Set<(snapshot: RoomSnapshot) => void>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private polling = false

  constructor() {
    const stored = readStorage<Stored>(ROOM_KEY)
    if (stored?.code) {
      this.username = stored.username
      void this.joinLobby(stored.code)
    }
  }

  snapshot(): RoomSnapshot {
    const view = this.view
    const lobby: Lobby | null = view
      ? {
          code: view.code,
          hostId: view.hostId,
          playerIds: view.members.map((m) => m.playerId),
          status: view.status,
          difficulty: view.difficulty,
          countdownEndsAt: view.countdownEndsAt,
        }
      : null

    return {
      selfId: this.selfId,
      lobby,
      members: view ? view.members.map((m) => ({ playerId: m.playerId, username: m.username })) : [],
      botIds: [],
      ownedIds: view ? view.ownedIds : [this.selfId],
      game: view ? view.game : null,
      log: view ? (view.log as LogEntry[]) : [],
      emotes: view ? (view.emotes as EmoteEntry[]) : [],
      finishers: view ? ((view.finishers ?? []) as FinisherEntry[]) : [],
      connection: this.connection,
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
    const name = sanitizeUsername(username)
    if (!name && !isRandomized) return fail('Pick a name first')
    this.username = name
    if (this.code) {
      const sent = await this.send({ type: 'setUsername', username: name })
      if (!sent.ok) return fail(sent.error)
    }
    return ok({ playerId: this.selfId, username: name })
  }

  async createLobby(): Promise<Result<Lobby>> {
    const sent = await this.send({ type: 'create', username: this.username })
    if (!sent.ok) return fail(sent.error)
    return this.currentLobby()
  }

  async joinLobby(code: string): Promise<Result<Lobby>> {
    const sent = await this.send({ type: 'join', username: this.username }, code)
    if (!sent.ok) return fail(sent.error)
    return this.currentLobby()
  }

  async addBot(): Promise<Result<PlayerProfile>> {
    return fail('Online tables are for people — share the code with a friend')
  }

  async addLocalPlayer(username: string): Promise<Result<PlayerProfile>> {
    const sent = await this.send({ type: 'addSeat', username })
    if (!sent.ok) return fail(sent.error)
    const added = this.view?.members.at(-1)
    return added ? ok({ playerId: added.playerId, username: added.username }) : fail('Could not add a seat')
  }

  async removePlayer(playerId: string): Promise<Result<null>> {
    const sent = await this.send({ type: 'removePlayer', targetId: playerId })
    return sent.ok ? ok(null) : fail(sent.error)
  }

  async setDifficulty(difficulty: Difficulty): Promise<Result<null>> {
    const sent = await this.send({ type: 'setDifficulty', difficulty })
    return sent.ok ? ok(null) : fail(sent.error)
  }

  async startCountdown(): Promise<Result<null>> {
    const sent = await this.send({ type: 'beginCountdown' })
    return sent.ok ? ok(null) : fail(sent.error)
  }

  async startGame(difficulty: Difficulty): Promise<Result<null>> {
    const sent = await this.send({ type: 'start', difficulty })
    return sent.ok ? ok(null) : fail(sent.error)
  }

  async dispatch(action: GameAction): Promise<Result<null>> {
    const sent = await this.send({ type: 'action', action })
    return sent.ok ? ok(null) : fail(sent.error)
  }

  async sendEmote(playerId: string, emote: string): Promise<Result<null>> {
    const sent = await this.send({ type: 'emote', playerId, emote })
    return sent.ok ? ok(null) : fail(sent.error)
  }

  async sendFinisher(playerId: string, grade: FinisherGrade): Promise<Result<null>> {
    const sent = await this.send({ type: 'finisher', playerId, grade })
    return sent.ok ? ok(null) : fail(sent.error)
  }

  async returnToLobby(): Promise<Result<null>> {
    const sent = await this.send({ type: 'returnToLobby' })
    return sent.ok ? ok(null) : fail(sent.error)
  }

  async leave(): Promise<void> {
    if (this.code) await this.send({ type: 'leave' })
    this.reset()
  }

  private reset(): void {
    this.stopPolling()
    this.code = null
    this.view = null
    this.connection = 'online'
    writeStorage(ROOM_KEY, null)
    this.publish()
  }

  private currentLobby(): Result<Lobby> {
    const lobby = this.snapshot().lobby
    return lobby ? ok(lobby) : fail('Could not reach the table')
  }

  private async send(
    command: Record<string, unknown> & { type: string },
    code?: string,
  ): Promise<Result<null>> {
    const target = code ?? this.code
    try {
      const response = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callerId: this.selfId, code: target, command }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        view?: RoomView
        error?: string
        left?: boolean
      }

      if (!response.ok) {
        this.connection = 'online'
        if (response.status === 404) this.reset()
        return fail(payload.error ?? 'The table did not answer')
      }

      this.connection = 'online'
      if (payload.view) this.adopt(payload.view)
      return ok(null)
    } catch {
      this.connection = 'offline'
      this.publish()
      return fail('No connection to the table')
    }
  }

  private adopt(view: RoomView): void {
    this.view = view
    this.code = view.code
    writeStorage(ROOM_KEY, { code: view.code, username: this.username } satisfies Stored)
    this.startPolling()
    this.publish()
  }

  private startPolling(): void {
    if (this.polling) return
    this.polling = true
    this.scheduleTick()
  }

  private stopPolling(): void {
    this.polling = false
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  private scheduleTick(): void {
    if (!this.polling) return
    // A table waiting in the lobby does not need checking as often as a live hand.
    const wait = this.view?.game ? POLL_MS : IDLE_POLL_MS
    this.timer = setTimeout(() => void this.tick(), wait)
  }

  private async tick(): Promise<void> {
    if (!this.polling || !this.code) return
    const since = this.view?.version ?? -1
    try {
      const response = await fetch(
        `/api/room?code=${encodeURIComponent(this.code)}&callerId=${encodeURIComponent(this.selfId)}&since=${since}`,
      )
      if (response.status === 404) {
        this.reset()
        return
      }
      const payload = (await response.json().catch(() => ({}))) as {
        view?: RoomView
        unchanged?: boolean
      }
      if (this.connection === 'offline') {
        this.connection = 'online'
        this.publish()
      }
      if (payload.view) this.adopt(payload.view)
    } catch {
      if (this.connection === 'online') {
        this.connection = 'offline'
        this.publish()
      }
    }
    this.scheduleTick()
  }
}
