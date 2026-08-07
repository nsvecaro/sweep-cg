import { EmoteGlyph, emoteKind, EMOTE_TONE } from './emoteGlyphs'

export interface EmoteBubble {
  id: string
  playerId: string
  emote: string
  x: number
  y: number
}

/** Floating reaction glyphs, positioned in viewport pixels below the seat they came from. */
export function EmoteBubbles({ bubbles }: { bubbles: EmoteBubble[] }) {
  return (
    <div className="emoteFx" aria-hidden="true">
      {bubbles.map((b) => (
        <span
          key={b.id}
          className={`emoteFx__bubble emoteFx__bubble--${EMOTE_TONE[b.emote] ?? 'bone'} emoteFx__bubble--${emoteKind(b.emote)}`}
          style={{ left: `${b.x}px`, top: `${b.y}px` }}
        >
          <EmoteGlyph emote={b.emote} className="emoteFx__glyph" />
        </span>
      ))}
    </div>
  )
}
