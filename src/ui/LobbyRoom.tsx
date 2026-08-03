import { useState } from 'react'
import type { Difficulty } from '@/engine'
import { MAX_LOBBY_PLAYERS } from '@/lobby'
import type { RoomSnapshot, SweepTransport } from '@/net/transport'
import { SteelBall } from './PlayingCard'

const MODES: { id: Difficulty; name: string; blurb: string }[] = [
  { id: 'easy', name: 'Easy', blurb: 'Pick your own face-up cards. Only 2, 10 and A misbehave.' },
  { id: 'medium', name: 'Medium', blurb: 'Same setup, but 5, 7 and 8 wake up too.' },
  { id: 'hard', name: 'Hard', blurb: 'Face-up cards dealt blind. Everything misbehaves.' },
]

interface Props {
  transport: SweepTransport
  room: RoomSnapshot
  onError: (message: string | null) => void
}

export function LobbyRoom({ transport, room, onError }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [copied, setCopied] = useState(false)
  const lobby = room.lobby!
  const isHost = lobby.hostId === room.selfId
  const full = room.members.length >= MAX_LOBBY_PLAYERS
  const online = transport.kind === 'remote'

  const run = async (command: Promise<{ ok: true } | { ok: false; error: string }>) => {
    const result = await command
    onError(result.ok ? null : result.error)
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(lobby.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      onError('Copying is blocked here — read the code out loud instead')
    }
  }

  return (
    <main className="screen lobby">
      <header className="lobby__head">
        <h1 className="wordmark wordmark--small">
          <SteelBall className="wordmark__ball" />
          Sweep
        </h1>
        <button type="button" className="btn btn--ghost" onClick={() => void transport.leave()}>
          Leave table
        </button>
      </header>

      <section className="panel lobby__code">
        <span className="eyebrow">Table code</span>
        <button type="button" className="code" onClick={copyCode} title="Copy code">
          {lobby.code}
        </button>
        <p className="hint">{copied ? 'Copied.' : 'Friends join with this code.'}</p>
      </section>

      <section className="panel">
        <span className="eyebrow">
          Players {room.members.length}/{MAX_LOBBY_PLAYERS}
        </span>
        <ul className="seats-list">
          {room.members.map((member) => (
            <li key={member.playerId} className="seats__row">
              <span className="seats__name">{member.username}</span>
              <span className="seats__tags">
                {member.playerId === lobby.hostId && <em className="tag">Host</em>}
                {member.playerId === room.selfId && <em className="tag">You</em>}
                {room.botIds.includes(member.playerId) && <em className="tag">Bot</em>}
              </span>
              {isHost && member.playerId !== room.selfId && (
                <button
                  type="button"
                  className="btn btn--tiny"
                  onClick={() => void run(transport.removePlayer(member.playerId))}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {isHost && (
          <div className="lobby__fill">
            {!online && (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={full}
                onClick={() => void run(transport.addBot())}
              >
                Add a bot
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost"
              disabled={full}
              onClick={() => void run(transport.addLocalPlayer(''))}
            >
              Add a seat on this device
            </button>
          </div>
        )}
      </section>

      {isHost && (
        <section className="panel">
          <span className="eyebrow">Rules</span>
          <div className="modes">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`mode ${difficulty === mode.id ? 'mode--on' : ''}`}
                onClick={() => setDifficulty(mode.id)}
                aria-pressed={difficulty === mode.id}
              >
                <span className="mode__name">{mode.name}</span>
                <span className="mode__blurb">{mode.blurb}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn--go btn--wide"
            disabled={room.members.length < 2}
            onClick={() => void run(transport.startGame(difficulty))}
          >
            {room.members.length < 2
              ? online
                ? 'Waiting for a friend to join'
                : 'Add another player to start'
              : 'Deal'}
          </button>
        </section>
      )}

      {!isHost && <p className="hint hint--center">Waiting for the host to deal.</p>}
    </main>
  )
}
