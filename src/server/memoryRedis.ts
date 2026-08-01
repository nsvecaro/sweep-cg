/**
 * The slice of the Upstash client the room store uses.
 *
 * `eval` mirrors the contract of the Lua in store.ts rather than running it,
 * which is enough to drive the retry loop in tests and in local development.
 * Only a real Upstash instance exercises the script itself.
 */
export class MemoryRedis {
  store = new Map<string, string>()
  /** Test hook: runs before each compare-and-set to simulate a competing write. */
  onBeforeCas: (() => void) | null = null

  async get<T>(key: string): Promise<T | null> {
    const value = this.store.get(key)
    if (value === undefined) return null
    try {
      return JSON.parse(value) as T
    } catch {
      return value as unknown as T
    }
  }

  async set(
    key: string,
    value: string,
    options?: { nx?: boolean; ex?: number },
  ): Promise<'OK' | null> {
    if (options?.nx && this.store.has(key)) return null
    this.store.set(key, value)
    return 'OK'
  }

  async eval(script: string, keys: string[], args: string[]): Promise<number> {
    if (script.includes('DEL')) {
      for (const key of keys) this.store.delete(key)
      return 1
    }

    this.onBeforeCas?.()

    const [versionKey, dataKey] = keys
    const [expected, nextVersion, payload] = args
    const current = this.store.get(versionKey)

    if (current === undefined) {
      if (expected !== '0') return 0
    } else if (current !== expected) {
      return 0
    }

    this.store.set(versionKey, nextVersion)
    this.store.set(dataKey, payload)
    return 1
  }
}
