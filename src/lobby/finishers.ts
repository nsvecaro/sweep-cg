/**
 * Shared between client and server, exactly like the emote list: the server
 * validates against it so a tampered request can't broadcast a grade the UI
 * has no animation for.
 *
 * A finisher grade is pure spectacle — it never reaches the engine and never
 * changes a card. It rides its own side channel for one reason: the grade is
 * only known on the device that made the gesture, and a finisher nobody else
 * at the table sees is half a feature.
 */
export const FINISHER_GRADES = ['perfect', 'great', 'clean'] as const

export type FinisherGrade = (typeof FINISHER_GRADES)[number]

export const FINISHER_GRADE_IDS: ReadonlySet<string> = new Set(FINISHER_GRADES)

/** One per game per seat, so this only has to stop outright spam. */
export const FINISHER_COOLDOWN_MS = 400
