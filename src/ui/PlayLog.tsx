import { useEffect, useRef } from 'react'
import type { GameState } from '@/engine'
import type { RoomSnapshot } from '@/net/transport'
import { describeEvent } from './format'

export function PlayLog({ room, game }: { room: RoomSnapshot; game: GameState }) {
  const scroller = useRef<HTMLOListElement>(null)
  const nameOf = (id: string) => game.players.find((p) => p.playerId === id)?.name ?? 'Someone'

  const lines = room.log
    .map((entry) => ({ id: entry.id, text: describeEvent(entry.event, nameOf) }))
    .filter((line): line is { id: number; text: string } => line.text !== null)

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
