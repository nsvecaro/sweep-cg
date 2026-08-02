import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isValidLobbyCode, normalizeLobbyCode } from '../src/lobby/codes.js'
import {
  applyCommand,
  applyDueTimeouts,
  emptyRoom,
  viewOf,
  type RoomCommand,
  type RoomRecord,
} from '../src/server/room.js'
import { Contended, UNCHANGED, create, load, update } from '../src/server/store.js'

/** Opening a table is the one command that has no room to act on yet. */
type WireCommand = RoomCommand | { type: 'create'; username: string }

interface Body {
  callerId?: unknown
  code?: unknown
  command?: unknown
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  try {
    if (req.method === 'GET') return await poll(req, res)
    if (req.method === 'POST') return await command(req, res)
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof Contended) return res.status(409).json({ error: error.message })
    const message = error instanceof Error ? error.message : 'Something went wrong'
    // Configuration problems are worth surfacing verbatim — they are ours, not the player's.
    return res.status(500).json({ error: message })
  }
}

async function poll(req: VercelRequest, res: VercelResponse) {
  const code = normalizeLobbyCode(String(req.query.code ?? ''))
  const callerId = String(req.query.callerId ?? '')
  if (!isValidLobbyCode(code)) return res.status(400).json({ error: 'Bad table code' })
  if (!callerId) return res.status(400).json({ error: 'Missing player id' })

  let loaded = await load(code)
  if (!loaded) return res.status(404).json({ error: 'That table is gone' })

  const now = Date.now()
  loaded = (await settleTimeouts(code, loaded, now)) ?? loaded

  // The client sends the version it already has; nothing new means an empty 200.
  const since = Number(req.query.since ?? -1)
  if (Number.isFinite(since) && since === loaded.version) {
    return res.status(200).json({ unchanged: true, version: loaded.version })
  }
  return res.status(200).json({ view: viewOf(loaded.room, callerId, loaded.version) })
}

/**
 * Nobody runs a timer for a serverless room, so any client that happens to
 * poll (or send a command) while a deadline has passed enforces it on the
 * table's behalf. Cheap-checks first so an on-time table never pays for a
 * write it doesn't need.
 */
async function settleTimeouts(
  code: string,
  loaded: { room: RoomRecord; version: number },
  now: number,
): Promise<{ room: RoomRecord; version: number } | null> {
  if (!applyDueTimeouts(loaded.room, now)) return null
  return update(code, ({ room }) => applyDueTimeouts(room, now) ?? UNCHANGED)
}

async function command(req: VercelRequest, res: VercelResponse) {
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Body
  const callerId = typeof body?.callerId === 'string' ? body.callerId : ''
  const cmd = body?.command as WireCommand | undefined
  if (!callerId) return res.status(400).json({ error: 'Missing player id' })
  if (!cmd || typeof cmd.type !== 'string') return res.status(400).json({ error: 'Missing command' })

  const now = Date.now()

  if (cmd.type === 'create') {
    const seed: RoomRecord = emptyRoom('AAAAA', callerId, now)
    const room = await create(seed)
    const joined = applyCommand(room, { type: 'join', username: cmd.username }, { callerId, now })
    if (!joined.ok) return res.status(400).json({ error: joined.error })

    const saved = await update(room.code, () => joined.room)
    if (!saved) return res.status(500).json({ error: 'Could not open the table' })
    return res.status(200).json({ view: viewOf(saved.room, callerId, saved.version) })
  }

  const code = normalizeLobbyCode(String(body.code ?? ''))
  if (!isValidLobbyCode(code)) return res.status(400).json({ error: 'Bad table code' })

  const loaded = await load(code)
  if (loaded) await settleTimeouts(code, loaded, now)

  const refusals: string[] = []
  const saved = await update(code, ({ room }) => {
    refusals.length = 0
    const outcome = applyCommand(room, cmd, { callerId, now })
    if (!outcome.ok) {
      refusals.push(outcome.error)
      return UNCHANGED
    }
    return outcome.room
  })

  if (refusals.length > 0) return res.status(400).json({ error: refusals[0] })
  if (!saved) {
    // Either the room never existed, or that command emptied it.
    return cmd.type === 'leave'
      ? res.status(200).json({ left: true })
      : res.status(404).json({ error: 'That table is gone' })
  }
  return res.status(200).json({ view: viewOf(saved.room, callerId, saved.version) })
}
