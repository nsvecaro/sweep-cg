import { useEffect, useRef } from 'react'
import type { GameState } from '@/engine'
import type { RoomSnapshot } from '@/net/transport'
import { describeEvent } from './format'

function linesOf(room: RoomSnapshot, game: GameState) {
  const nameOf = (id: string) => game.players.find((p) => p.playerId === id)?.name ?? 'Someone'
  return room.log
    .map((entry) => ({ id: entry.id, text: describeEvent(entry.event, nameOf) }))
    .filter((line): line is { id: number; text: string } => line.text !== null)
}

/**
 * The narrow-screen half of the log. A phone has no room for a side rail, but it
 * does have a stretch of empty playfield above the pile — better spent on what
 * just happened than on nothing.
 */
export function Ticker({ room, game }: { room: RoomSnapshot; game: GameState }) {
  const lines = linesOf(room, game).slice(-2)
  return (
    <ul className="ticker" aria-label="Recent plays">
      {lines.map((line, i) => (
        <li key={line.id} className={i === lines.length - 1 ? 'ticker__now' : ''}>
          {line.text}
        </li>
      ))}
    </ul>
  )
}

export function PlayLog({ room, game }: { room: RoomSnapshot; game: GameState }) {
  const scroller = useRef<HTMLOListElement>(null)
  const lines = linesOf(room, game)

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [lines.length])

  return (
    <aside className="log" aria-label="Play log">
      <span className="eyebrow">Play log</span>
      <ol className="log__list" ref={scroller}>
        {lines.slice(-40).map((line) => (
          <li key={line.id}>{line.text}</li>
        ))}
      </ol>
    </aside>
  )
}
