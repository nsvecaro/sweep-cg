import { useEffect, useLayoutEffect, useState } from 'react'
import { useRoom } from '@/hooks/useRoom'
import { RemoteTransport } from '@/net/remoteTransport'
import type { RoomSnapshot, SweepTransport } from '@/net/transport'
import { GameTable } from '@/ui/GameTable'
import { LobbyRoom } from '@/ui/LobbyRoom'
import { MainMenu } from '@/ui/MainMenu'
import { SetupHand } from '@/ui/SetupHand'

/** How long the board stays up, showing the throw/pickup animation, before the pass-device cover appears. */
const HANDOVER_HOLD_MS = 900

export function App({ transport: injected }: { transport?: SweepTransport } = {}) {
  const [transport] = useState<SweepTransport>(() => injected ?? new RemoteTransport())
  const room = useRoom(transport)
  const [error, setError] = useState<string | null>(null)
  const [passedTo, setPassedTo] = useState<string | null>(null)
  const [holding, setHolding] = useState(false)
  const [replayLogId, setReplayLogId] = useState<number | null>(null)

  useEffect(() => {
    if (!room.game) {
      setPassedTo(null)
      setHolding(false)
      setReplayLogId(null)
    }
  }, [room.game])

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 3600)
    return () => clearTimeout(timer)
  }, [error])

  const localSeats = room.ownedIds
  const viewerId = viewerFor(room, localSeats)
  const instantHandover = localSeats.length > 1 && viewerId !== passedTo && viewerId !== null
  const viewerName = room.members.find((m) => m.playerId === viewerId)?.username ?? 'the next player'

  // A genuine "pass to the next local player" moment — not the first-ever handover, and not a
  // fallback to room.selfId while a remote player takes their turn. Worth holding the board on so
  // the outgoing player's throw/pickup animation finishes before the pass-device cover appears.
  const isLocalHandoff =
    room.game?.phase === 'playing' && passedTo !== null && localSeats.includes(passedTo) && viewerId !== null && localSeats.includes(viewerId)

  useLayoutEffect(() => {
    if (!instantHandover || !isLocalHandoff) return
    setHolding(true)
    // The play that triggered this handoff may not be the log's last entry — a throw can also
    // emit a trailing CardsDrawn/PlayerSkipped/PileSwept. Replay the throw/pickup itself, not
    // whatever happened to land last.
    let capturedLogId: number | null = null
    for (let i = room.log.length - 1; i >= 0; i--) {
      const type = room.log[i].event.type
      if (type === 'CardsPlayed' || type === 'PileTaken') {
        capturedLogId = room.log[i].id
        break
      }
    }
    const timer = setTimeout(() => {
      setHolding(false)
      setReplayLogId(capturedLogId)
    }, HANDOVER_HOLD_MS)
    return () => clearTimeout(timer)
    // Keyed on the handoff itself; re-firing on every log tick would restart the hold mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerId, isLocalHandoff])

  const needsHandover = instantHandover && !holding
  const displayViewerId = holding ? passedTo : viewerId

  return (
    <>
      {room.connection === 'offline' && (
        <div className="toast toast--warn" role="status">
          Lost the connection — trying again…
        </div>
      )}
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
        <GameTable
          transport={transport}
          room={room}
          game={room.game}
          viewerId={displayViewerId!}
          onError={setError}
          replayLogId={holding ? null : replayLogId}
          onReplayConsumed={() => setReplayLogId(null)}
        />
      )}
    </>
  )
}

function viewerFor(room: RoomSnapshot, localSeats: string[]): string | null {
  if (!room.lobby) return null
  const game = room.game
  if (!game) return room.selfId
  if (game.phase === 'setup') {
    const waiting = game.players.find(
      (p) => localSeats.includes(p.playerId) && !p.hasLeft && p.faceUp.length === 0,
    )
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
