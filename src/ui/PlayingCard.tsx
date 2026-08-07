import { RANK_LABEL, type Card, type Suit } from '@/engine'

type State = 'playable' | 'dead' | 'plain'

/** Hand-authored bitmaps — crisp 1-unit rects, no anti-aliasing at any size. */
const SUIT_BITMAP: Record<Suit, string[]> = {
  spades: ['...#...', '..###..', '.#####.', '#######', '#######', '.#####.', '...#...', '...#...', '..###..'],
  hearts: ['.##.##.', '#######', '#######', '#######', '#######', '.#####.', '..###..', '...#...', '...#...'],
  diamonds: ['...#...', '..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
  clubs: ['..###..', '.#####.', '#######', '#######', '##.#.##', '.#####.', '...#...', '...#...', '..###..'],
}

/**
 * Suits are decoration in Sweep — nothing in the rules reads them. The value is
 * the entire card, so the value is what the face shows, big. These are drawn
 * rather than set in a pixel font because the card scales fluidly, and a bitmap
 * font only stays sharp at exact multiples of its design grid.
 */
const RANK_BITMAP: Record<number, string[]> = {
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['#...#', '#...#', '#...#', '#####', '....#', '....#', '....#'],
  5: ['#####', '#....', '#....', '####.', '....#', '#...#', '.###.'],
  6: ['.###.', '#...#', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
  10: ['.#...###.', '##..#...#', '.#..#..##', '.#..#.#.#', '.#..##..#', '.#..#...#', '###..###.'],
  11: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  12: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  13: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  14: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
}

/**
 * The same grid, for counts. Every number the table shows — deck size, seconds
 * left, cards eaten — is drawn rather than set, so nothing on screen falls out
 * of the bitmap world the cards establish.
 */
const DIGIT_BITMAP: Record<string, string[]> = {
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: RANK_BITMAP[2],
  3: RANK_BITMAP[3],
  4: RANK_BITMAP[4],
  5: RANK_BITMAP[5],
  6: RANK_BITMAP[6],
  7: RANK_BITMAP[7],
  8: RANK_BITMAP[8],
  9: RANK_BITMAP[9],
}

const DIGIT_ROWS = 7

/**
 * `label` is for the places where a bitmap is the *only* content — counts and
 * clocks. Left unset the glyph is decoration, and whatever wraps it (a card's
 * own aria-label, a list item's) does the talking.
 */
export function Bitmap({ grid, className, label }: { grid: string[]; className?: string; label?: string }) {
  const height = grid.length
  const width = grid[0].length
  const cells = grid.flatMap((row, y) =>
    [...row].flatMap((cell, x) =>
      cell === '#' ? [<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />] : [],
    ),
  )
  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      fill="currentColor"
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {cells}
    </svg>
  )
}

export function SuitGlyph({ suit, className }: { suit: Suit; className?: string }) {
  return <Bitmap grid={SUIT_BITMAP[suit]} className={className} />
}

export function RankGlyph({
  value,
  className,
  label,
}: {
  value: number
  className?: string
  label?: string
}) {
  return <Bitmap grid={RANK_BITMAP[value]} className={className} label={label} />
}

export function Digits({
  value,
  className,
  label,
}: {
  value: number
  className?: string
  label?: string
}) {
  const glyphs = [...String(value)].map((ch) => DIGIT_BITMAP[ch] ?? DIGIT_BITMAP[0])
  // A blank column between glyphs is the whole of the letter-spacing here.
  const grid = Array.from({ length: DIGIT_ROWS }, (_, y) => glyphs.map((g) => g[y]).join('.'))
  return <Bitmap grid={grid} className={className} label={label} />
}

export function isRedSuit(suit: Suit) {
  return suit === 'hearts' || suit === 'diamonds'
}

interface Props {
  card: Card
  state?: State
  selected?: boolean
  /** Marks a card that does something beyond beating the pile, in this ruleset. */
  special?: boolean
  scale?: number
  onClick?: () => void
  innerRef?: (el: HTMLElement | null) => void
}

/** Left unset, cards inherit --scale from whichever zone they sit in. */
const scaleStyle = (scale?: number) =>
  scale === undefined ? undefined : ({ '--scale': scale } as React.CSSProperties)

export function PlayingCard({
  card,
  state = 'plain',
  selected = false,
  special = false,
  scale,
  onClick,
  innerRef,
}: Props) {
  const className = [
    'card',
    'card--face',
    `card--${state}`,
    selected ? 'card--selected' : '',
    isRedSuit(card.suit) ? 'card--red' : '',
    special ? 'card--special' : '',
    onClick ? 'card--tappable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const label = `${RANK_LABEL[card.value]} of ${card.suit}`
  const style = scaleStyle(scale)

  if (!onClick) {
    return (
      <div className={className} style={style} aria-label={label} ref={innerRef}>
        <CardFace card={card} />
      </div>
    )
  }
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      ref={innerRef}
    >
      <CardFace card={card} />
    </button>
  )
}

function CardFace({ card }: { card: Card }) {
  return (
    <>
      {/* A fanned hand covers every card's right side, so the corner index goes
          top-left and carries the value — the only thing the rules read. */}
      <RankGlyph value={card.value} className="card__index" />
      <RankGlyph value={card.value} className="card__rank" />
      <SuitGlyph suit={card.suit} className="card__pip" />
    </>
  )
}

/** The silver ball: the mark on every hidden card, and the game's own emblem. */
export function SteelBall({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
      <g fill="currentColor">
        <rect x="2" y="0" width="5" height="9" />
        <rect x="1" y="1" width="7" height="7" />
        <rect x="0" y="2" width="9" height="5" />
      </g>
      <rect x="2" y="2" width="2" height="2" fill="var(--bone)" opacity="0.85" />
    </svg>
  )
}

export function CardBack({ scale, count }: { scale?: number; count?: number }) {
  return (
    <div className="card card--back" style={scaleStyle(scale)} aria-hidden={count === undefined}>
      {count !== undefined ? (
        <span className="card__count">
          <Digits value={count} label={String(count)} />
        </span>
      ) : (
        <SteelBall className="card__ball" />
      )}
    </div>
  )
}

export function EmptySlot({ label }: { label: string }) {
  return <div className="card card--empty">{label}</div>
}
