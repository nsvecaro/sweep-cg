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
  /** Cards behind the effect. Bigger stack -> bigger, longer, busier blast. */
  scale: number
}

export interface Banner extends Shout {
  id: number
}

const SHARD_BASE = 14
const RING_BASE = 3
const SPIKE_COUNT = 8
const EMBER_BASE = 10

/** More cards in the stack -> more rings and shards, up to a sane ceiling. */
function shardsFor(scale: number): number[] {
  return Array.from({ length: Math.min(SHARD_BASE + (scale - 1) * 4, 34) }, (_, i) => i)
}
function ringsFor(scale: number): number[] {
  return Array.from({ length: Math.min(RING_BASE + Math.floor((scale - 1) / 2), 6) }, (_, i) => i)
}
interface Ember {
  key: number
  x0: number
  x1: number
  delay: number
}

/**
 * CSS `calc()` has no modulo operator, so the jitter has to be worked out
 * here in JS and handed to the CSS as plain numbers — an earlier version
 * tried `calc(... % ...)` for this, which is invalid CSS and silently drops
 * the whole declaration (embers all stacked at one spot, motionless).
 */
function embersFor(scale: number): Ember[] {
  const count = Math.min(EMBER_BASE + (scale - 1) * 3, 30)
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    x0: ((i * 37) % 80) - 40,
    x1: ((i * 53) % 40) - 20,
    delay: (i * 23) % 260,
  }))
}

/**
 * Each stack size gets a shape of its own, not just a bigger/slower version
 * of the same one: a pair pops two plain rings, a triple spins a pinwheel of
 * shards, a quad shatters into radiating spikes, and a ten's burn rises as
 * drifting embers instead of expanding outward at all.
 */
function BlastBody({ blast }: { blast: Blast }) {
  switch (blast.tone) {
    case 'pair':
      return (
        <>
          {[0, 1].map((r) => (
            <i key={r} className="blast__ring" style={{ '--r': r } as React.CSSProperties} />
          ))}
        </>
      )
    case 'triple':
      return (
        <>
          {ringsFor(blast.scale).map((r) => (
            <i key={r} className="blast__ring" style={{ '--r': r } as React.CSSProperties} />
          ))}
          <i className="blast__pinwheel">
            {shardsFor(blast.scale).map((s) => (
              <i key={s} className="blast__shard" style={{ '--s': s } as React.CSSProperties} />
            ))}
          </i>
        </>
      )
    case 'quad':
      return (
        <>
          {ringsFor(blast.scale).map((r) => (
            <i key={r} className="blast__ring" style={{ '--r': r } as React.CSSProperties} />
          ))}
          {Array.from({ length: SPIKE_COUNT }, (_, i) => i).map((i) => (
            <i key={i} className="blast__spike" style={{ '--i': i } as React.CSSProperties} />
          ))}
        </>
      )
    case 'burn':
      return (
        <>
          {embersFor(blast.scale).map((e) => (
            <i
              key={e.key}
              className="blast__ember"
              style={
                { '--ex0': `${e.x0}px`, '--ex1': `${e.x1}px`, '--edelay': `${e.delay}ms` } as React.CSSProperties
              }
            />
          ))}
        </>
      )
    default:
      return (
        <>
          {ringsFor(blast.scale).map((r) => (
            <i key={r} className="blast__ring" style={{ '--r': r } as React.CSSProperties} />
          ))}
          {shardsFor(blast.scale).map((s) => (
            <i key={s} className="blast__shard" style={{ '--s': s } as React.CSSProperties} />
          ))}
        </>
      )
  }
}

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
          style={{ left: `${blast.x}px`, top: `${blast.y}px`, '--bscale': blast.scale } as React.CSSProperties}
        >
          <BlastBody blast={blast} />
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
