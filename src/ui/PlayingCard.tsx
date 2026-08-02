import { RANK_LABEL, type Card, type Suit } from '@/engine'

type State = 'playable' | 'dead' | 'plain'

/** Hand-authored bitmaps — crisp 1-unit rects, no anti-aliasing. */
const SUIT_BITMAP: Record<Suit, string[]> = {
  spades: ['...#...', '..###..', '.#####.', '#######', '#######', '.#.#.#.', '..###..'],
  hearts: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
  diamonds: ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
  clubs: ['..###..', '.#####.', '.#####.', '##...##', '#######', '.#####.', '...#...', '..###..'],
}

function SuitGlyph({ suit, className }: { suit: Suit; className?: string }) {
  const grid = SUIT_BITMAP[suit]
  const size = grid.length
  const cells = grid.flatMap((row, y) =>
    [...row].flatMap((cell, x) => (cell === '#' ? [<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />] : [])),
  )
  return (
    <svg
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {cells}
    </svg>
  )
}

interface Props {
  card: Card
  state?: State
  selected?: boolean
  scale?: number
  onClick?: () => void
}

/** Left unset, cards inherit --scale from whichever zone they sit in. */
const scaleStyle = (scale?: number) =>
  scale === undefined ? undefined : ({ '--scale': scale } as React.CSSProperties)

export function PlayingCard({ card, state = 'plain', selected = false, scale, onClick }: Props) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds'
  const className = [
    'card',
    `card--${state}`,
    selected ? 'card--selected' : '',
    red ? 'card--red' : '',
    onClick ? 'card--tappable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const label = `${RANK_LABEL[card.value]} of ${card.suit}`
  const style = scaleStyle(scale)

  if (!onClick) {
    return (
      <div className={className} style={style} aria-label={label}>
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
    >
      <CardFace card={card} />
    </button>
  )
}

function CardFace({ card }: { card: Card }) {
  const rank = RANK_LABEL[card.value]
  return (
    <>
      <span className="card__index card__index--tl" aria-hidden="true">
        <span className="card__rank">{rank}</span>
        <SuitGlyph suit={card.suit} className="card__suit" />
      </span>
      <SuitGlyph suit={card.suit} className="card__pip" />
      <span className="card__index card__index--br" aria-hidden="true">
        <span className="card__rank">{rank}</span>
        <SuitGlyph suit={card.suit} className="card__suit" />
      </span>
    </>
  )
}

export function CardBack({ scale, count }: { scale?: number; count?: number }) {
  return (
    <div className="card card--back" style={scaleStyle(scale)} aria-hidden={count === undefined}>
      {count !== undefined ? <span className="card__count">{count}</span> : <SuitGlyph suit="diamonds" className="card__mark" />}
    </div>
  )
}

export function EmptySlot({ label }: { label: string }) {
  return <div className="card card--empty">{label}</div>
}
