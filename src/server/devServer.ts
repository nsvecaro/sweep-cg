import type { Plugin } from 'vite'

/**
 * Runs the real api/room.ts handler inside `npm run dev`, backed by an
 * in-memory store, so the online game can be played on localhost without a
 * Redis account. Two browser windows are two players.
 *
 * Development only — `vite build` never sees this.
 */
export function devRoomApi(): Plugin {
  return {
    name: 'sweep-dev-room-api',
    apply: 'serve',
    async configureServer(server) {
      const [{ default: handler }, store, { MemoryRedis }] = await Promise.all([
        import('../../api/room'),
        import('./store'),
        import('./memoryRedis'),
      ])
      store.setClient(new MemoryRedis())

      server.middlewares.use('/api/room', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const query = Object.fromEntries(url.searchParams)

        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let body: unknown = undefined
          if (raw) {
            try {
              body = JSON.parse(raw)
            } catch {
              body = raw
            }
          }

          const reply = {
            setHeader: (key: string, value: string) => {
              res.setHeader(key, value)
              return reply
            },
            status: (code: number) => {
              res.statusCode = code
              return reply
            },
            json: (payload: unknown) => {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(payload))
              return reply
            },
          }

          void handler({ method: req.method, query, body } as never, reply as never)
        })
      })
    },
  }
}
