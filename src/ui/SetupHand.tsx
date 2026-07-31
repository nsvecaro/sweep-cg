import { useState } from 'react'
import type { GameState } from '@/engine'
import type { SweepTransport } from '@/net/transport'
import { PlayingCard } from './PlayingCard'
import { FACE_UP_COUNT } from '@/engine/game'

interface Props {
  transport: SweepTransport
  game: GameState
  viewerId: string
  onError: (message: string | null) => void
}

export function SetupHand({ transport, game, viewerId, onError }: Props) {
  const [picked, setPicked] = useState<string[]>([])
  const player = game.players.find((p) => p.playerId === viewerId)!
  const waiting = game.players.filter((p) => p.faceUp.length === 0 && p.playerId !== viewerId)

  const toggle = (id: string) => {
    setPicked((current) =>
      current.includes(id)
        ? current.filter((c) => c !== id)
        : current.length < FACE_UP_COUNT
          ? [...current, id]
          : current,
    )
  }

  const confirm = () => {
    const result = transport.dispatch({ type: 'setFaceUpCards', playerId: viewerId, cardIds: picked })
    if (!result.ok) return onError(result.error)
    onError(null)
    setPicked([])
  }

  return (
    <main className="screen setup">
      <header className="setup__head">
        <span className="eyebrow">{player.name}</span>
        <h2 className="headline">Show three cards</h2>
        <p className="hint">
          They sit face-up in front of you and are played once your hand runs dry. Everyone can see them.
        </p>
      </header>

      <div className="setup__hand">
        {player.hand.map((card) => (
          <PlayingCard
            key={card.id}
            card={card}
            state={picked.includes(card.id) ? 'playable' : 'plain'}
            selected={picked.includes(card.id)}
            onClick={() => toggle(card.id)}
          />
        ))}
      </div>

      <button type="button" className="btn btn--primary btn--wide" disabled={picked.length !== FACE_UP_COUNT} onClick={confirm}>
        {picked.length === FACE_UP_COUNT ? 'Lock them in' : `Pick ${FACE_UP_COUNT - picked.length} more`}
      </button>

      {waiting.length > 0 && (
        <p className="hint hint--center">Waiting on {waiting.map((p) => p.name).join(', ')}.</p>
      )}
    </main>
  )
}
