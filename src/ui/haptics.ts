/** Vibration API wrapper — Android Chrome only; iOS Safari has never implemented it. */
export function vibrate(pattern: number | number[]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    // unsupported device, or called outside a context the browser allows
  }
}
