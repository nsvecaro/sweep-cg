import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { RANK_LABEL, type Card } from '@/engine'
import { GREAT_BAND, PERFECT_BAND, gradeAt, sweepAt, type FinisherGrade } from './finisher'

/** How far the cards can be drawn back before the zone stops following. */
const DRAW_MAX = 44
/** Drag this far *downward* and the release reads as a change of mind, not a throw. */
const CANCEL_DROP = 24

interface Props {
  cards: Card[]
  /** No sweeping marker to read, so the grade can't be earned — everyone gets the middle one. */
  reduced: boolean
  onStrike: (grade: FinisherGrade) => void
  /**
   * The escape hatch (eating the pile) shares the meter's row rather than
   * keeping an actions row of its own, so the zone costs the console no height
   * at all. It must stop its own pointer events — otherwise reaching for it
   * would release over the zone and throw the cards instead.
   */
  aside?: ReactNode
  /** Your real table and hand. The zone wraps them so the swipe lands on the card itself. */
  children: ReactNode
}

/**
 * The finisher: the throw that ends it gets a gesture instead of a button.
 *
 * It wraps the cards you already have on screen rather than drawing its own
 * copies — an earlier version showed the last cards a second time inside a
 * panel, which pushed the console off the bottom of the viewport and made you
 * scroll to reach the one control that mattered. Swiping up anywhere over your
 * cards or the meter throws them; the meter's marker decides the grade, and the
 * grade only buys spectacle. A bad release still puts you out.
 */
export function FinisherZone({ cards, reduced, onStrike, aside, children }: Props) {
  const cardsRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLSpanElement>(null)
  const position = useRef(0.5)
  const struck = useRef(false)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    if (reduced) return
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const pos = sweepAt(t - t0)
      position.current = pos
      // Written straight to the element: a state update per frame would
      // re-render the whole table sixty times a second for one moving pixel.
      markerRef.current?.style.setProperty('--pos', String(pos))
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  const draw = (dy: number) => cardsRef.current?.style.setProperty('--draw', `${dy}px`)

  /** Pointer release and keyboard activation both land here; the ref keeps it to one. */
  const strike = useCallback(() => {
    if (struck.current) return
    struck.current = true
    draw(0)
    onStrike(reduced ? 'great' : gradeAt(position.current))
  }, [onStrike, reduced])

  const label =
    cards.length === 1
      ? `Swipe up to finish on the ${RANK_LABEL[cards[0].value]}`
      : `Swipe up to finish on ${cards.length}× ${RANK_LABEL[cards[0].value]}`

  return (
    <div
      className="finisherZone"
      onPointerDown={(e) => {
        startY.current = e.clientY
        // Without capture, a swipe that leaves the zone never delivers its
        // pointerup. It throws for a pointer the browser doesn't consider
        // active, and losing capture is far better than losing the gesture.
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // no capture available — the swipe still works while it stays inside
        }
      }}
      onPointerMove={(e) => {
        if (startY.current === null) return
        draw(Math.max(-DRAW_MAX, Math.min(0, e.clientY - startY.current)))
      }}
      onPointerUp={(e) => {
        const cancelled = startY.current !== null && e.clientY - startY.current > CANCEL_DROP
        startY.current = null
        draw(0)
        if (!cancelled) strike()
      }}
      onPointerCancel={() => {
        startY.current = null
        draw(0)
      }}
    >
      <div className="finisherZone__cards" ref={cardsRef}>
        {children}
      </div>

      <div className="finisherZone__bar">
        {/* A real button, so the gesture has a keyboard and screen-reader equivalent. */}
        <button type="button" className="finisher" onClick={strike} aria-label={label}>
          <span className="finisher__tag">Last {cards.length === 1 ? 'card' : cards.length}</span>
          {reduced ? (
            <span className="finisher__cue">Tap to finish</span>
          ) : (
            <>
              <span className="finisher__meter" aria-hidden="true">
                <span className="finisher__band" style={{ '--band': GREAT_BAND } as React.CSSProperties} />
                <span
                  className="finisher__band finisher__band--perfect"
                  style={{ '--band': PERFECT_BAND } as React.CSSProperties}
                />
                <span className="finisher__marker" ref={markerRef} />
              </span>
              <span className="finisher__cue">Swipe up</span>
            </>
          )}
        </button>
        {aside}
      </div>
    </div>
  )
}
