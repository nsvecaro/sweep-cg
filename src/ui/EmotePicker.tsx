import { useEffect, useRef, useState } from 'react'
import { EMOTES, EMOTE_COOLDOWN_MS } from '@/lobby'
import type { SweepTransport } from '@/net/transport'
import { EmoteGlyph, emoteKind, TriggerGlyph } from './emoteGlyphs'

/**
 * Degrees swept by the fan. The trigger sits near the panel's right edge, so
 * the arc opens up-and-left instead of straight up — a symmetric fan would
 * clip its rightmost slots past the viewport.
 */
const FAN_SPAN_DEG = 160
const FAN_START_DEG = -165

/**
 * A player-triggered reaction fan, built the same way the blast FX radiates
 * shards: each button is rotated about the trigger, then pushed out along its
 * own translateY, then counter-rotated so its glyph stays upright.
 */
export function EmotePicker({
  transport,
  playerId,
  onError,
}: {
  transport: SweepTransport
  playerId: string
  onError: (message: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState({ x: 0, y: 0 })
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [onCooldown, setOnCooldown] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      setOnCooldown(false)
      return
    }
    setOnCooldown(true)
    const id = window.setTimeout(() => setOnCooldown(false), cooldownUntil - Date.now())
    return () => window.clearTimeout(id)
  }, [cooldownUntil])

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('pointerdown', onOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  const send = (id: string) => {
    if (onCooldown) return
    setCooldownUntil(Date.now() + EMOTE_COOLDOWN_MS)
    void transport.sendEmote(playerId, id).then((result) => {
      if (!result.ok) onError(result.error)
    })
  }

  const step = EMOTES.length > 1 ? FAN_SPAN_DEG / (EMOTES.length - 1) : 0

  const toggle = () => {
    if (!open && triggerRef.current) {
      const box = triggerRef.current.getBoundingClientRect()
      setOrigin({ x: box.left + box.width / 2, y: box.top + box.height / 2 })
    }
    setOpen((v) => !v)
  }

  return (
    <div className="emoteFan" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`emoteFan__trigger ${open ? 'emoteFan__trigger--open' : ''}`}
        aria-expanded={open}
        aria-label={open ? 'Close emotes' : 'Send an emote'}
        onClick={toggle}
      >
        <TriggerGlyph className="emoteFan__triggerGlyph" />
      </button>

      {open && (
        <div
          className="emoteFan__ring"
          role="group"
          aria-label="Emotes"
          style={{ left: `${origin.x}px`, top: `${origin.y}px` }}
        >
          {EMOTES.map((e, i) => {
            const angle = FAN_START_DEG + step * i
            return (
              <div
                key={e.id}
                className="emoteFan__slot"
                style={{ '--angle': `${angle}deg`, '--i': i } as React.CSSProperties}
              >
                <button
                  type="button"
                  className={`emoteFan__btn emoteFan__btn--${e.id} emoteFan__btn--${emoteKind(e.id)}`}
                  disabled={onCooldown}
                  title={e.label}
                  aria-label={e.label}
                  onClick={() => send(e.id)}
                >
                  <EmoteGlyph emote={e.id} className="emoteFan__glyph" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
