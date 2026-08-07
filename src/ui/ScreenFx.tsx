import type { Card } from '@/engine'
import type { Shout } from './commentary'
import type { FinisherEnding, FinisherGrade } from './finisher'
import { CardBack, PlayingCard } from './PlayingCard'
import { SadGlyph } from './emoteGlyphs'

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
  /** A finisher throw: short, accelerating, all cards landing as one hit. */
  slam?: boolean
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

/**
 * The small answer every single play gets, loud ones included. The blast is
 * reserved for moments worth interrupting you for; this is the one that fires
 * when an ordinary three lands on an ordinary two, so no throw ever feels
 * ignored.
 */
export interface Pulse {
  id: number
  tone: Shout['tone']
  x: number
  y: number
  /** Cards behind it — a pair pulses wider than a single. */
  scale: number
}

/** The finisher's freeze: one hard frame across the whole screen, graded. */
export interface Impact {
  id: number
  grade: FinisherGrade
}

/** The whole-screen ending. Two of them, and they share nothing but their timing. */
export interface Finale {
  id: number
  kind: FinisherEnding
  /** Whose ending this is. Everyone at the table sees it, so it has to say who. */
  who: string
  /** Drives the banner under the effect — the grade name, or the roast. */
  text: string
}

const RAINBOW_BURSTS = 14
const CONFETTI = 46
const SAD_FACES = 9

/**
 * Deterministic 0..1 from an index. Same reason `embersFor` does its own
 * arithmetic: CSS `calc()` has no modulo, so every scattered position has to
 * be worked out here and handed over as a plain number.
 *
 * The salt is mixed in, not added. An earlier version did `base + salt * k`,
 * which leaves `x - y` constant for every i — every burst landed on the same
 * diagonal line across the screen. Two avalanche rounds decorrelate the axes.
 */
function scatter(i: number, salt: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

interface Burst {
  key: number
  x: number
  y: number
  hue: number
  delay: number
  size: number
}

/** Explosions all over the screen, each one a different colour of the rainbow. */
function rainbowBursts(): Burst[] {
  return Array.from({ length: RAINBOW_BURSTS }, (_, i) => ({
    key: i,
    x: 8 + scatter(i, 1) * 84,
    y: 10 + scatter(i, 2) * 72,
    // Spread evenly round the wheel first, then jitter, so no two neighbours
    // land on the same colour however the scatter falls.
    hue: ((i * 360) / RAINBOW_BURSTS + scatter(i, 5) * 18) % 360,
    delay: scatter(i, 3) * 560,
    size: 0.65 + scatter(i, 4) * 1.15,
  }))
}

interface Confetto {
  key: number
  x: number
  hue: number
  delay: number
  drift: number
  spin: number
  fall: number
}

function confettiFall(): Confetto[] {
  return Array.from({ length: CONFETTI }, (_, i) => ({
    key: i,
    x: scatter(i, 11) * 100,
    hue: scatter(i, 12) * 360,
    delay: scatter(i, 13) * 700,
    drift: (scatter(i, 14) - 0.5) * 160,
    spin: 360 + scatter(i, 15) * 720,
    fall: 1500 + scatter(i, 16) * 900,
  }))
}

function sadFaces(): Burst[] {
  return Array.from({ length: SAD_FACES }, (_, i) => ({
    key: i,
    x: 10 + scatter(i, 21) * 80,
    y: 14 + scatter(i, 22) * 64,
    hue: 0,
    delay: scatter(i, 23) * 620,
    size: 0.7 + scatter(i, 24) * 0.8,
  }))
}

function FinaleBody({ finale }: { finale: Finale }) {
  if (finale.kind === 'hit') {
    return (
      <>
        <i className="finale__wash" />
        {rainbowBursts().map((b) => (
          <i
            key={b.key}
            className="finale__burst"
            style={
              {
                left: `${b.x}%`,
                top: `${b.y}%`,
                '--hue': b.hue,
                '--fdelay': `${b.delay}ms`,
                '--fsize': b.size,
              } as React.CSSProperties
            }
          >
            {[0, 1, 2].map((r) => (
              <i key={r} className="finale__ring" style={{ '--r': r } as React.CSSProperties} />
            ))}
            {Array.from({ length: 10 }, (_, s) => s).map((s) => (
              <i key={s} className="finale__shard" style={{ '--s': s } as React.CSSProperties} />
            ))}
          </i>
        ))}
      </>
    )
  }

  return (
    <>
      {confettiFall().map((c) => (
        <i
          key={c.key}
          className="finale__confetto"
          style={
            {
              left: `${c.x}%`,
              '--hue': c.hue,
              '--fdelay': `${c.delay}ms`,
              '--drift': `${c.drift}px`,
              '--spin': `${c.spin}deg`,
              '--fall': `${c.fall}ms`,
            } as React.CSSProperties
          }
        />
      ))}
      {sadFaces().map((f) => (
        <i
          key={f.key}
          className="finale__sad"
          style={
            { left: `${f.x}%`, top: `${f.y}%`, '--fdelay': `${f.delay}ms`, '--fsize': f.size } as React.CSSProperties
          }
        >
          <SadGlyph className="finale__sadGlyph" />
        </i>
      ))}
    </>
  )
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
  pulses,
  banner,
  flash,
  impact,
  finale,
}: {
  flights: Flight[]
  blasts: Blast[]
  pulses: Pulse[]
  banner: Banner | null
  flash: { id: number; tone: Shout['tone'] } | null
  impact: Impact | null
  finale: Finale | null
}) {
  return (
    <div className="fx" aria-hidden="true">
      {flash && <div key={`flash${flash.id}`} className={`flash flash--${flash.tone}`} />}

      {impact && <div key={`impact${impact.id}`} className={`impact impact--${impact.grade}`} />}

      {pulses.map((pulse) => (
        <i
          key={`pulse${pulse.id}`}
          className={`pulse pulse--${pulse.tone}`}
          style={{ left: `${pulse.x}px`, top: `${pulse.y}px`, '--pscale': pulse.scale } as React.CSSProperties}
        />
      ))}

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
          className={flight.slam ? 'flight flight--slam' : 'flight'}
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

      {/* Above the flights, below the banner: the cards have to land *into* it. */}
      {finale && (
        <div key={`finale${finale.id}`} className={`finale finale--${finale.kind}`}>
          <FinaleBody finale={finale} />
          {/* Stacked in flow rather than each absolutely positioned: the roast
              lines wrap to two rows, and anything offset by a fixed amount
              ends up underneath them. */}
          <div className="finale__say">
            <span className="finale__who">{finale.who}</span>
            <strong className="finale__text">{finale.text}</strong>
          </div>
        </div>
      )}

      {banner && (
        <div key={`taunt${banner.id}`} className={`taunt taunt--${banner.tone} taunt--f${banner.force}`}>
          <span className="taunt__who">{banner.who}</span>
          <strong className="taunt__text">{banner.text}</strong>
        </div>
      )}
    </div>
  )
}
