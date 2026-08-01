import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLegalMoves, moveToAction } from '@/engine/game'
import type { RoomView } from '@/server/room'
import { FakeRedis } from './fakeRedis'

const fake = new FakeRedis()
vi.mock('@upstash/redis', () => ({ Redis: class {
  get = (...args: [string]) => fake.get(...args)
  set = (...args: [string, string, { nx?: boolean; ex?: number }?]) => fake.set(...args)
  eval = (...args: [string, string[], string[]]) => fake.eval(...args)
} }))

process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid'
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

const { default: handler } = await import('../api/room')
const store = await import('@/server/store')

interface Reply {
  status: number
  body: Record<string, unknown>
}

function res() {
  const reply: Reply = { status: 0, body: {} }
  const self = {
    setHeader: () => self,
    status(code: number) {
      reply.status = code
      return self
    },
    json(payload: Record<string, unknown>) {
      reply.body = payload
      return self
    },
    reply,
  }
  return self
}

const post = async (callerId: string, command: unknown, code?: string): Promise<Reply> => {
  const out = res()
  await handler({ method: 'POST', body: { callerId, code, command }, query: {} } as never, out as never)
  return out.reply
}

const get = async (callerId: string, code: string, since?: number): Promise<Reply> => {
  const out = res()
  const query: Record<string, string> = { callerId, code }
  if (since !== undefined) query.since = String(since)
  await handler({ method: 'GET', query } as never, out as never)
  return out.reply
}

const viewOf = (reply: Reply) => reply.body.view as RoomView

describe('ONLINE api', () => {
  beforeEach(() => {
    fake.store.clear()
    fake.onBeforeCas = null
  })

  it('API_CREATE — hosting a table returns a joinable code', async () => {
    const created = await post('host', { type: 'create', username: 'Ana' })

    expect(created.status).toBe(200)
    const view = viewOf(created)
    expect(view.code).toHaveLength(5)
    expect(view.members).toEqual([{ playerId: 'host', username: 'Ana' }])
    expect(view.ownedIds).toEqual(['host'])
  })

  it('API_JOIN — a second browser joins with the code and both see two seats', async () => {
    const code = viewOf(await post('host', { type: 'create', username: 'Ana' })).code

    const joined = await post('guest', { type: 'join', username: 'Bo' }, code)

    expect(joined.status).toBe(200)
    expect(viewOf(joined).members.map((m) => m.username)).toEqual(['Ana', 'Bo'])

    const hostSees = await get('host', code)
    expect(viewOf(hostSees).members).toHaveLength(2)
  })

  it('API_POLL — an unchanged room answers without resending the state', async () => {
    const code = viewOf(await post('host', { type: 'create', username: 'Ana' })).code
    const version = viewOf(await get('host', code)).version

    const again = await get('host', code, version)

    expect(again.body).toEqual({ unchanged: true, version })
  })

  it('API_POLL — a move by one player shows up in the other player’s poll', async () => {
    const code = viewOf(await post('host', { type: 'create', username: 'Ana' })).code
    await post('guest', { type: 'join', username: 'Bo' }, code)
    await post('host', { type: 'start', difficulty: 'hard' }, code)

    const watcher = viewOf(await get('guest', code))
    const active = watcher.game!.activePlayerId! as 'host' | 'guest'

    // The mover reads its own view, so it sees the cards it is allowed to play.
    const own = viewOf(await get(active, code)).game!
    const move = getLegalMoves(own, active)[0]
    expect(move).toBeDefined()

    const sent = await post(active, { type: 'action', action: moveToAction(move, active) }, code)
    expect(sent.status).toBe(200)

    const after = viewOf(await get('guest', code, watcher.version))
    expect(after.version).toBeGreaterThan(watcher.version)
    expect(after.log.map((e) => e.event.type)).toContain('CardsPlayed')
  })

  it('API_REFUSED — a rejected move is a 400 and does not bump the version', async () => {
    const code = viewOf(await post('host', { type: 'create', username: 'Ana' })).code
    await post('guest', { type: 'join', username: 'Bo' }, code)
    await post('host', { type: 'start', difficulty: 'hard' }, code)
    const before = viewOf(await get('host', code)).version

    const active = viewOf(await get('host', code)).game!.activePlayerId!
    const idle = active === 'host' ? 'guest' : 'host'
    const refused = await post(idle, { type: 'action', action: { type: 'pickUpPile', playerId: idle } }, code)

    expect(refused.status).toBe(400)
    expect(refused.body.error).toBe('Not your turn')
    expect(viewOf(await get('host', code)).version).toBe(before)
  })

  it('API_LEAVE — walking out ends the game and the other player is told', async () => {
    const code = viewOf(await post('host', { type: 'create', username: 'Ana' })).code
    await post('guest', { type: 'join', username: 'Bo' }, code)
    await post('host', { type: 'start', difficulty: 'hard' }, code)

    const left = await post('guest', { type: 'leave' }, code)
    expect(left.status).toBe(200)

    const view = viewOf(await get('host', code))
    expect(view.game!.phase).toBe('finished')
    expect(view.game!.finishOrder).toEqual(['host'])
    expect(view.members.map((m) => m.playerId)).toEqual(['host'])
  })

  it('API_GONE — polling a table that no longer exists is a 404', async () => {
    const code = viewOf(await post('host', { type: 'create', username: 'Ana' })).code
    await post('host', { type: 'leave' }, code)

    expect((await get('host', code)).status).toBe(404)
  })

  it('API_RACE — two players picking face-up cards at once both stick', async () => {
    const code = viewOf(await post('host', { type: 'create', username: 'Ana' })).code
    await post('guest', { type: 'join', username: 'Bo' }, code)
    await post('host', { type: 'start', difficulty: 'easy' }, code)

    const view = viewOf(await get('host', code))
    expect(view.game!.phase).toBe('setup')

    const pick = (id: 'host' | 'guest') => {
      const seen = view.game!.players.find((p) => p.playerId === id)!
      return seen.hand.slice(0, 3).map((c) => c.id)
    }

    // The guest's write lands in between the host's read and its compare-and-set,
    // exactly once — the host must notice, re-read and retry rather than clobber.
    let interfered = false
    fake.onBeforeCas = () => {
      if (interfered) return
      interfered = true
      fake.onBeforeCas = null
      const other = fake.store.get(`sweep:room:${code}:v`)
      fake.store.set(`sweep:room:${code}:v`, String(Number(other) + 1))
    }

    await post('host', { type: 'action', action: { type: 'setFaceUpCards', playerId: 'host', cardIds: pick('host') } }, code)

    const guestHand = viewOf(await get('guest', code)).game!.players.find((p) => p.playerId === 'guest')!
    await post(
      'guest',
      { type: 'action', action: { type: 'setFaceUpCards', playerId: 'guest', cardIds: guestHand.hand.slice(0, 3).map((c) => c.id) } },
      code,
    )

    const final = viewOf(await get('host', code)).game!
    expect(interfered).toBe(true)
    expect(final.players.find((p) => p.playerId === 'host')!.faceUp).toHaveLength(3)
    expect(final.players.find((p) => p.playerId === 'guest')!.faceUp).toHaveLength(3)
    expect(final.phase).toBe('playing')
  })

  it('API_BUSY — a room under permanent contention reports itself busy', async () => {
    const code = viewOf(await post('host', { type: 'create', username: 'Ana' })).code
    fake.onBeforeCas = () => {
      const key = `sweep:room:${code}:v`
      fake.store.set(key, String(Number(fake.store.get(key)) + 1))
    }

    const reply = await post('host', { type: 'setUsername', username: 'Ana2' }, code)

    expect(reply.status).toBe(409)
    expect(reply.body.error).toBe(new store.Contended().message)
  })

  it('API_METHOD — anything but GET or POST is refused', async () => {
    const out = res()
    await handler({ method: 'DELETE', query: {} } as never, out as never)
    expect(out.reply.status).toBe(405)
  })
})
