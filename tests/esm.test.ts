import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * package.json declares "type": "module", so Vercel runs api/room.ts as real
 * ESM — and Node's ESM loader will not resolve an extensionless relative
 * import. Dropping a `.js` here does not fail the build or any other test; it
 * fails at runtime, in production, as FUNCTION_INVOCATION_FAILED on every
 * request. Hence this guard.
 */
const SERVER_DIRS = ['api', 'src/engine', 'src/lobby', 'src/server']

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (path.endsWith('.ts')) out.push(path)
  }
  return out
}

describe('ESM packaging', () => {
  it('ESM_EXTENSIONS — every relative import the server bundles names a .js file', () => {
    const offenders: string[] = []

    for (const dir of SERVER_DIRS) {
      for (const file of walk(dir)) {
        const source = readFileSync(file, 'utf8')
        for (const match of source.matchAll(/from\s+['"](\.\.?\/[^'"]*)['"]/g)) {
          const specifier = match[1]
          if (!specifier.endsWith('.js') && !specifier.endsWith('.json')) {
            offenders.push(`${file} → ${specifier}`)
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
