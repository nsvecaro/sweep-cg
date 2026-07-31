import { RANK_LABEL, SUIT_SYMBOL, type Card } from '@/engine'

type State = 'playable' | 'dead' | 'plain'

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
  return (
    <>
      <span className="card__rank">{RANK_LABEL[card.value]}</span>
      <span className="card__pip">{SUIT_SYMBOL[card.suit]}</span>
    </>
  )
}

export function CardBack({ scale, count }: { scale?: number; count?: number }) {
  return (
    <div className="card card--back" style={scaleStyle(scale)} aria-hidden={count === undefined}>
      {count !== undefined && <span className="card__count">{count}</span>}
    </div>
  )
}

export function EmptySlot({ label }: { label: string }) {
  return <div className="card card--empty">{label}</div>
}
