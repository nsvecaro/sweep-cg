import type { Card } from '@/engine'
import type { Shout } from './commentary'
import { CardBack, PlayingCard } from './PlayingCard'

/**
 * A card in transit. Every number is a measured viewport coordinate rather than
 * an estimate: the ghost leaves the exact pixel the real card occupied and
 * arrives on the exact pixel — rotation and scale included — where the pile
 * card is about to appear, so the handover between the two is invisible.
 */
export interface Flight {
  id: string
  card: Card | null
  special: boolean
  x0: number
  y0: number
  x1: number
  y1: number
  r0: number
  r1: number
  s0: number
  s1: number
  delay: number
  duration: number
}

export interface Blast {
  id: number
  tone: Shout['tone']
  x: number
  y: number
}

export interface Banner extends Shout {
  id: number
}

const SHARDS = Array.from({ length: 14 }, (_, i) => i)
const RINGS = [0, 1, 2]

export function ScreenFx({
  flights,
  blasts,
  banner,
  flash,
}: {
  flights: Flight[]
  blasts: Blast[]
  banner: Banner | null
  flash: { id: number; tone: Shout['tone'] } | null
}) {
  return (
    <div className="fx" aria-hidden="true">
      {flash && <div key={`flash${flash.id}`} className={`flash flash--${flash.tone}`} />}

      {blasts.map((blast) => (
        <div
          key={`blast${blast.id}`}
          className={`blast blast--${blast.tone}`}
          style={{ left: `${blast.x}px`, top: `${blast.y}px` }}
        >
          {RINGS.map((r) => (
            <i key={r} className="blast__ring" style={{ '--r': r } as React.CSSProperties} />
          ))}
          {SHARDS.map((s) => (
            <i key={s} className="blast__shard" style={{ '--s': s } as React.CSSProperties} />
          ))}
        </div>
      ))}

      {flights.map((flight) => (
        <div
          key={flight.id}
          className="flight"
          style={
            {
              '--x0': flight.x0,
              '--y0': flight.y0,
              '--x1': flight.x1,
              '--y1': flight.y1,
              '--r0': `${flight.r0}deg`,
              '--r1': `${flight.r1}deg`,
              '--s0': flight.s0,
              '--s1': flight.s1,
              '--delay': `${flight.delay}ms`,
              '--dur': `${flight.duration}ms`,
            } as React.CSSProperties
          }
        >
          {flight.card ? <PlayingCard card={flight.card} special={flight.special} /> : <CardBack />}
        </div>
      ))}

      {banner && (
        <div key={`taunt${banner.id}`} className={`taunt taunt--${banner.tone} taunt--f${banner.force}`}>
          <span className="taunt__who">{banner.who}</span>
          <strong className="taunt__text">{banner.text}</strong>
        </div>
      )}
    </div>
  )
}
