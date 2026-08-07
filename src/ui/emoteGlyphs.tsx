import { Bitmap } from './PlayingCard'

/**
 * Three drawing styles, picked per-reaction from a design review — see the
 * emote-redesign artifact. 'picto' is a single bold pictogram (the cabinet's
 * bitmap-icon language, same as suit pips). 'word' is a short dot-matrix
 * word, matching the cabinet's own commentary voice instead of miming a
 * face. 'combo' is a picto with its word underneath, for the one reaction
 * an icon alone still leaves ambiguous.
 */
type EmoteDesign =
  | { kind: 'picto'; grid: string[] }
  | { kind: 'word'; word: string }
  | { kind: 'combo'; grid: string[]; word: string }

/** 5x7 letterforms, same grid language as the digit/rank bitmaps. */
const LETTERS: Record<string, string[]> = {
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  G: ['.###.', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
}

function wordGrid(word: string): string[] {
  const glyphs = [...word].map((ch) => LETTERS[ch] ?? LETTERS.O)
  return Array.from({ length: 7 }, (_, y) => glyphs.map((g) => g[y]).join('.'))
}

const FIRE_PICTO = [
  '......#......',
  '.....###.....',
  '.....###.....',
  '....#####....',
  '....#####....',
  '...#######...',
  '..#########..',
  '.###########.',
  '.###########.',
  '..#########..',
  '..#########..',
  '...#######...',
  '....#####....',
]

const THINK_PICTO = [
  '...#####.....',
  '.##.....##...',
  '#.........#..',
  '..........#..',
  '.........##..',
  '........##...',
  '.......##....',
  '......##.....',
  '.....##......',
  '.............',
  '.....##......',
  '.....##......',
  '.............',
]

/**
 * Redesigned: the old skull read as a blob. This one leads with two solid
 * square eye sockets — the single feature that reads as "skull" at a glance
 * — instead of a face outline doing the identifying work.
 */
const SKULL_PICTO = [
  '....#####....',
  '..#########..',
  '.###########.',
  '#############',
  '##...###...##',
  '##...###...##',
  '#############',
  '.###########.',
  '..#########..',
  '..#.#.#.#.#..',
  '..#.#.#.#.#..',
  '..#########..',
  '.............',
]

/**
 * Finale-only, deliberately not in `lobby/emotes` — nobody can send this one,
 * it just rains down on you when you fumble the finisher. Square eyes and a
 * hard ∩ mouth, since a thin curved frown vanishes at this grid size.
 */
const SAD_PICTO = [
  '....#####....',
  '..##.....##..',
  '.#.........#.',
  '#...........#',
  '#..##...##..#',
  '#..##...##..#',
  '#...........#',
  '#...........#',
  '#....###....#',
  '#..##...##..#',
  '.##.......##.',
  '..##.....##..',
  '....#####....',
]

export function SadGlyph({ className }: { className?: string }) {
  return <Bitmap grid={SAD_PICTO} className={className} />
}

const EMOTE_DESIGN: Record<string, EmoteDesign> = {
  laugh: { kind: 'word', word: 'HA' },
  gg: { kind: 'word', word: 'GG' },
  fire: { kind: 'combo', grid: FIRE_PICTO, word: 'HOT' },
  angry: { kind: 'word', word: 'MAD' },
  think: { kind: 'picto', grid: THINK_PICTO },
  skull: { kind: 'picto', grid: SKULL_PICTO },
}

/** Speech-bubble trigger icon — opens the fan, closed state. */
const TRIGGER_BITMAP = [
  '#########',
  '#.......#',
  '#.......#',
  '#.......#',
  '#########',
  '...##....',
  '....#....',
  '.........',
  '.........',
]

/** Assigns each reaction the cabinet accent that fits its mood. */
export const EMOTE_TONE: Readonly<Record<string, string>> = {
  laugh: 'dmd',
  gg: 'volt',
  fire: 'flame',
  angry: 'flame',
  think: 'ice',
  skull: 'dust',
}

/** Drives shape/sizing — words and combos need more than a tight circle. */
export function emoteKind(emote: string): 'picto' | 'word' | 'combo' {
  return EMOTE_DESIGN[emote]?.kind ?? 'picto'
}

export function EmoteGlyph({ emote, className }: { emote: string; className?: string }) {
  const design = EMOTE_DESIGN[emote]
  if (!design) return null
  if (design.kind === 'word') return <Bitmap grid={wordGrid(design.word)} className={className} />
  if (design.kind === 'combo') {
    return (
      <span className={['emoteGlyphCombo', className].filter(Boolean).join(' ')}>
        <Bitmap grid={design.grid} className="emoteGlyphCombo__icon" />
        <Bitmap grid={wordGrid(design.word)} className="emoteGlyphCombo__word" />
      </span>
    )
  }
  return <Bitmap grid={design.grid} className={className} />
}

export function TriggerGlyph({ className }: { className?: string }) {
  return <Bitmap grid={TRIGGER_BITMAP} className={className} />
}
