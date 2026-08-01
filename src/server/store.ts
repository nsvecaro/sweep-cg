import { Redis } from '@upstash/redis'
import { generateLobbyCode } from '../lobby/codes'
import type { RoomRecord } from './room'

/** Rooms are disposable: a table nobody has touched for a day is gone. */
const TTL_SECONDS = 60 * 60 * 24
const CAS_ATTEMPTS = 6

/**
 * Sets both keys only if the version key still holds what the caller read.
 * Two players acting in the same instant can't overwrite each other — the
 * loser is told to re-read and retry.
 */
const CAS = `
local current = redis.call('GET', KEYS[1])
if current == false then
  if ARGV[1] ~= '0' then return 0 end
elseif current ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
return 1
`

const DELETE_BOTH = `
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
return 1
`

/** The subset of the client this module needs, so dev and tests can stand in. */
export interface RedisLike {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: string, options?: { nx?: boolean; ex?: number }): Promise<unknown>
  eval(script: string, keys: string[], args: string[]): Promise<unknown>
}

let client: RedisLike | null = null

/** Used by the dev server and the tests to run without a real Upstash instance. */
export function setClient(replacement: RedisLike | null): void {
  client = replacement
}

export function redis(): RedisLike {
  if (client) return client
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error(
      'No Redis connection. Add the Upstash integration in the Vercel dashboard, ' +
        'or set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN locally.',
    )
  }
  client = new Redis({ url, token }) as unknown as RedisLike
  return client
}

const dataKey = (code: string) => `sweep:room:${code}`
const versionKey = (code: string) => `sweep:room:${code}:v`

export interface Loaded {
  room: RoomRecord
  version: number
}

export async function load(code: string): Promise<Loaded | null> {
  const db = redis()
  const [raw, version] = await Promise.all([
    db.get<RoomRecord | string>(dataKey(code)),
    db.get<string | number>(versionKey(code)),
  ])
  if (raw === null || raw === undefined || version === null || version === undefined) return null
  const room = typeof raw === 'string' ? (JSON.parse(raw) as RoomRecord) : raw
  return { room, version: Number(version) }
}

/** Returns false when someone else wrote first; the caller should re-read. */
async function compareAndSet(room: RoomRecord, expected: number): Promise<boolean> {
  const stored = await redis().eval(
    CAS,
    [versionKey(room.code), dataKey(room.code)],
    [String(expected), String(expected + 1), JSON.stringify(room), String(TTL_SECONDS)],
  )
  return Number(stored) === 1
}

export async function remove(code: string): Promise<void> {
  await redis().eval(DELETE_BOTH, [versionKey(code), dataKey(code)], [])
}

export class Contended extends Error {
  constructor() {
    super('The table is busy — try that again')
  }
}

/** Returned by a change function that decided nothing should be written. */
export const UNCHANGED = Symbol('unchanged')

/**
 * Reads the room, runs `change`, and writes it back if nothing moved underneath.
 * Retries a few times before giving up, which is what keeps two players picking
 * their face-up cards at the same moment from clobbering each other.
 */
export async function update(
  code: string,
  change: (loaded: Loaded) => Promise<RoomRecord | null | typeof UNCHANGED> | RoomRecord | null | typeof UNCHANGED,
): Promise<Loaded | null> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const loaded = await load(code)
    if (!loaded) return null

    const next = await change(loaded)
    if (next === UNCHANGED) return loaded
    if (next === null) {
      await remove(code)
      return null
    }
    if (await compareAndSet(next, loaded.version)) {
      return { room: next, version: loaded.version + 1 }
    }
  }
  throw new Contended()
}

export async function create(seed: RoomRecord): Promise<RoomRecord> {
  const db = redis()
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateLobbyCode(() => false)
    const claimed = await db.set(versionKey(code), '0', { nx: true, ex: TTL_SECONDS })
    if (claimed === null) continue
    const room = { ...seed, code }
    await db.set(dataKey(code), JSON.stringify(room), { ex: TTL_SECONDS })
    return room
  }
  throw new Error('Could not find a free table code')
}
