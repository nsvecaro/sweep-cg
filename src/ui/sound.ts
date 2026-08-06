/**
 * Retro chiptune SFX synthesized with the Web Audio API — no asset files,
 * just oscillators and gain envelopes, in keeping with the cabinet look.
 * The AudioContext is only created after a user gesture, since browsers
 * block audio before that regardless of mute state.
 */
import type { GameEvent } from '@/engine'
import type { Shout } from './commentary'

let ctx: AudioContext | null = null
const listeners = new Set<() => void>()
let muted = typeof localStorage !== 'undefined' && localStorage.getItem('sweep:muted') === '1'

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    const c = getCtx()
    if (c && c.state === 'suspended') void c.resume()
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })

  // Every clickable thing in this app is a real <button>, so one delegated,
  // capture-phase listener covers every button in the tree — card taps, menu
  // buttons, dialog buttons — without wiring a sound call into each of them.
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target instanceof Element ? e.target.closest('button') : null
      if (target && !target.disabled) clickCue()
    },
    true,
  )
}

export function isMuted() {
  return muted
}

export function setMuted(value: boolean) {
  muted = value
  try {
    localStorage.setItem('sweep:muted', value ? '1' : '0')
  } catch {
    // private browsing or disabled storage — the preference just won't persist
  }
  listeners.forEach((fn) => fn())
}

export function toggleMuted() {
  setMuted(!muted)
}

export function subscribeMuted(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

interface Tone {
  freq: number
  /** End frequency, for a rising/falling blip instead of a flat one. */
  to?: number
  duration: number
  type?: OscillatorType
  gain?: number
  delay?: number
}

function tone({ freq, to, duration, type = 'square', gain = 0.12, delay = 0 }: Tone) {
  if (muted) return
  const c = getCtx()
  if (!c) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const amp = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration)
  amp.gain.setValueAtTime(0, t0)
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.004)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(amp).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function notes(freqs: number[], step: number, opts: Partial<Tone> = {}) {
  freqs.forEach((freq, i) =>
    tone({ duration: step * 0.9, type: 'square', gain: 0.1, ...opts, freq, delay: (opts.delay ?? 0) + i * step }),
  )
}

/** Every button press — quiet and short so it never fights the game's own cues. */
const clickCue = () => tone({ freq: 1000, duration: 0.02, gain: 0.045 })

const playCue = () => tone({ freq: 520, duration: 0.05, gain: 0.09 })
const multiPlayCue = (count: number) => notes(Array.from({ length: Math.min(count, 3) }, () => 660), 0.06)
const specialCue = () => tone({ freq: 880, to: 1046, duration: 0.09, gain: 0.11 })
const burnCue = () => tone({ freq: 1200, to: 80, duration: 0.32, type: 'sawtooth', gain: 0.12 })
const skipCue = () => notes([220, 165], 0.09, { duration: 0.08 })
const pickupCue = () => tone({ freq: 180, to: 90, duration: 0.18, type: 'sine', gain: 0.14 })
const missCue = () => notes([440, 330], 0.1, { type: 'triangle' })
const timeoutCue = () => tone({ freq: 150, duration: 0.35, gain: 0.13 })
const finishCue = () => notes([523, 659, 784], 0.09)

/** Your turn just started — a gentle, distinct two-note chime. */
export function playYourTurnCue() {
  notes([784, 988], 0.1, { type: 'triangle' })
}

export function playSoundForEvent(event: GameEvent, shout: Shout | null) {
  switch (event.type) {
    case 'CardsPlayed':
      if (event.cards.length > 1) return multiPlayCue(event.cards.length)
      return shout?.force ? specialCue() : playCue()
    case 'PileSwept':
      return burnCue()
    case 'PlayerSkipped':
      return skipCue()
    case 'PileTaken':
      return pickupCue()
    case 'BlindFlipMissed':
      return missCue()
    case 'PlayerTimedOut':
      return timeoutCue()
    case 'PlayerFinished':
      return finishCue()
    default:
      return
  }
}
