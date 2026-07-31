import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const AIM_ROOT = 'amy-sweepgame/aim'
const TEST_ROOT = 'tests'

function walk(dir, match) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...walk(path, match))
    else if (match.test(entry)) out.push(path)
  }
  return out
}

function requirementLabels() {
  const labels = new Map()
  for (const file of walk(AIM_ROOT, /\.aim$/)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    let inRequirements = false
    for (const line of lines) {
      if (line.startsWith('## ')) inRequirements = line.trim() === '## Requirements'
      if (!inRequirements) continue
      const match = line.match(/^- \*\*([A-Z][A-Z0-9_]*)\*\*/)
      if (match) labels.set(match[1], file)
    }
  }
  return labels
}

const tests = walk(TEST_ROOT, /\.test\.ts$/)
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

const labels = requirementLabels()
const missing = []
for (const [label, file] of labels) {
  const hits = tests.match(new RegExp(`\\b${label}\\b`, 'g'))
  if (!hits) missing.push(`${label}  (${file})`)
}

const covered = labels.size - missing.length
console.log(`Requirement labels: ${covered}/${labels.size} covered by a named test.`)
if (missing.length > 0) {
  console.error('\nNo test names these requirements:')
  for (const entry of missing) console.error(`  - ${entry}`)
  process.exit(1)
}
