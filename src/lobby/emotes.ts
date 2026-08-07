/**
 * Shared between client and server: the server validates against this list so
 * a tampered request can't broadcast arbitrary text to the whole table. The
 * pixel art each id draws to is a client-only concern — see `ui/emoteGlyphs`.
 */
export interface EmoteDef {
  id: string
  label: string
}

export const EMOTES: EmoteDef[] = [
  { id: 'laugh', label: 'Laughing' },
  { id: 'gg', label: 'GG' },
  { id: 'fire', label: 'On fire' },
  { id: 'angry', label: 'Tilted' },
  { id: 'think', label: 'Thinking' },
  { id: 'skull', label: 'Dead' },
]

export const EMOTE_IDS: ReadonlySet<string> = new Set(EMOTES.map((e) => e.id))

/**
 * Short on purpose — this is meant to be spammable. Server-enforced; the
 * client mirrors it to grey out buttons instead of eating a rejection.
 */
export const EMOTE_COOLDOWN_MS = 300
