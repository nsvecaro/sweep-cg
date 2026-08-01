import { useState } from 'react'
import type { SweepTransport } from '@/net/transport'

interface Props {
  transport: SweepTransport
  /** Players still at the table besides you — a single one wins outright. */
  rivals: number
}

export function LeaveGame({ transport, rivals }: Props) {
  const [asking, setAsking] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const consequence =
    rivals === 1
      ? 'Your opponent wins by default and the game ends right there.'
      : 'Your cards go out of play and the others carry on without you.'

  return (
    <>
      <button type="button" className="btn btn--tiny" onClick={() => setAsking(true)}>
        Leave game
      </button>

      {asking && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="leave-title">
          <section className="overlay__panel">
            <span className="eyebrow">Leave game</span>
            <h2 className="headline" id="leave-title">
              Are you sure?
            </h2>
            <p className="hint">{consequence}</p>
            <div className="overlay__actions">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={leaving}
                onClick={() => setAsking(false)}
              >
                Keep playing
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={leaving}
                onClick={() => {
                  setLeaving(true)
                  void transport.leave()
                }}
              >
                {leaving ? 'Leaving…' : 'Leave game'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
