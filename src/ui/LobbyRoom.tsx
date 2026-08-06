import { useEffect, useState } from 'react'
import { MAX_LOBBY_PLAYERS } from '@/lobby'
import type { RoomSnapshot, SweepTransport } from '@/net/transport'
import { DIFFICULTY_MODES } from './format'
import { SteelBall } from './PlayingCard'

interface Props {
  transport: SweepTransport
  room: RoomSnapshot
  onError: (message: string | null) => void
}

export function LobbyRoom({ transport, room, onError }: Props) {
  const [copied, setCopied] = useState(false)
  const lobby = room.lobby!
  const isHost = lobby.hostId === room.selfId
  const full = room.members.length >= MAX_LOBBY_PLAYERS
  const online = transport.kind === 'remote'
  const countingDown = lobby.countdownEndsAt !== null

  // Only ticks while a countdown is actually running — the lobby otherwise sits idle.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!countingDown) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [countingDown])
  const secondsLeft = lobby.countdownEndsAt === null ? null : Math.max(0, Math.ceil((lobby.countdownEndsAt - now) / 1000))

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
                  disabled={countingDown}
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
                disabled={full || countingDown}
                onClick={() => void run(transport.addBot())}
              >
                Add a bot
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost"
              disabled={full || countingDown}
              onClick={() => void run(transport.addLocalPlayer(''))}
            >
              Add a seat on this device
            </button>
          </div>
        )}
      </section>

      <section className="panel">
        <span className="eyebrow">Rules</span>
        <div className="modes">
          {DIFFICULTY_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`mode ${lobby.difficulty === mode.id ? 'mode--on' : ''}`}
              disabled={!isHost || countingDown}
              onClick={isHost ? () => void run(transport.setDifficulty(mode.id)) : undefined}
              aria-pressed={lobby.difficulty === mode.id}
            >
              <span className="mode__name">{mode.name}</span>
              <span className="mode__blurb">{mode.blurb}</span>
            </button>
          ))}
        </div>

        {isHost ? (
          countingDown ? (
            <p className="headline headline--countdown">Dealing in {secondsLeft}…</p>
          ) : (
            <button
              type="button"
              className="btn btn--go btn--wide"
              disabled={room.members.length < 2}
              onClick={() => void run(transport.startCountdown())}
            >
              {room.members.length < 2
                ? online
                  ? 'Waiting for a friend to join'
                  : 'Add another player to start'
                : 'Deal'}
            </button>
          )
        ) : (
          <p className="hint hint--center">
            {countingDown ? `Dealing in ${secondsLeft}…` : 'Waiting for the host to deal.'}
          </p>
        )}
      </section>
    </main>
  )
}
