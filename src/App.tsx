import { useEffect, useState } from 'react'
import { useRoom } from '@/hooks/useRoom'
import { LocalTransport } from '@/net/localTransport'
import type { RoomSnapshot, SweepTransport } from '@/net/transport'
import { GameTable } from '@/ui/GameTable'
import { LobbyRoom } from '@/ui/LobbyRoom'
import { MainMenu } from '@/ui/MainMenu'
import { SetupHand } from '@/ui/SetupHand'

export function App({ transport: injected }: { transport?: SweepTransport } = {}) {
  const [transport] = useState<SweepTransport>(() => injected ?? new LocalTransport())
  const room = useRoom(transport)
  const [error, setError] = useState<string | null>(null)
  const [passedTo, setPassedTo] = useState<string | null>(null)

  useEffect(() => {
    if (!room.game) setPassedTo(null)
  }, [room.game])

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 3600)
    return () => clearTimeout(timer)
  }, [error])

  const localSeats = room.members.filter((m) => !room.botIds.includes(m.playerId)).map((m) => m.playerId)
  const viewerId = viewerFor(room, localSeats)
  const needsHandover = localSeats.length > 1 && viewerId !== passedTo && viewerId !== null
  const viewerName = room.members.find((m) => m.playerId === viewerId)?.username ?? 'the next player'

  return (
    <>
      {error && (
        <div className="toast" role="status">
          {error}
        </div>
      )}

      {!room.lobby || !viewerId ? (
        <MainMenu transport={transport} onError={setError} />
      ) : !room.game ? (
        <LobbyRoom transport={transport} room={room} onError={setError} />
      ) : needsHandover ? (
        <Handover name={viewerName} onReady={() => setPassedTo(viewerId)} />
      ) : room.game.phase === 'setup' ? (
        <SetupHand transport={transport} game={room.game} viewerId={viewerId} onError={setError} />
      ) : (
        <GameTable transport={transport} room={room} game={room.game} viewerId={viewerId} onError={setError} />
      )}
    </>
  )
}

function viewerFor(room: RoomSnapshot, localSeats: string[]): string | null {
  if (!room.lobby) return null
  const game = room.game
  if (!game) return room.selfId
  if (game.phase === 'setup') {
    const waiting = game.players.find((p) => localSeats.includes(p.playerId) && p.faceUp.length === 0)
    return waiting?.playerId ?? room.selfId
  }
  if (game.activePlayerId && localSeats.includes(game.activePlayerId)) return game.activePlayerId
  return room.selfId
}

function Handover({ name, onReady }: { name: string; onReady: () => void }) {
  return (
    <main className="screen handover">
      <span className="eyebrow">Pass the device</span>
      <h2 className="headline">{name}, it’s your turn</h2>
      <p className="hint">Cards stay hidden until you say you’re looking.</p>
      <button type="button" className="btn btn--primary btn--wide" onClick={onReady}>
        I’m {name}
      </button>
    </main>
  )
}
