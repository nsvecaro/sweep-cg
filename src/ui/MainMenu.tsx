import { useState } from 'react'
import { RANK_LABEL } from '@/engine'
import { LOBBY_CODE_LENGTH, randomUsername, type Result } from '@/lobby'
import type { SweepTransport } from '@/net/transport'
import { RankGlyph, SteelBall } from './PlayingCard'
import { Tutorial } from './Tutorial'

const SPECIALS: [number, string][] = [
  [2, 'wipes the demand'],
  [5, 'copies the card below'],
  [7, 'forces the next play low'],
  [8, 'skips the next player'],
  [10, 'burns the pile'],
  [14, 'tops everything'],
]

interface Props {
  transport: SweepTransport
  onError: (message: string | null) => void
}

export function MainMenu({ transport, onError }: Props) {
  const [name, setName] = useState(() => randomUsername())
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)

  const withName = async (then: () => Promise<Result<unknown>>) => {
    if (busy) return
    setBusy(true)
    try {
      const named = await transport.setUsername(name, false)
      if (!named.ok) return onError(named.error)
      const result = await then()
      onError(result.ok ? null : result.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen menu">
      <header className="menu__head">
        <div className="menu__title">
          <h1 className="wordmark">
            <SteelBall className="wordmark__ball" />
            Sweep
          </h1>
          <button
            type="button"
            className="btn btn--tiny btn--help"
            onClick={() => setShowTutorial(true)}
            aria-label="How to play"
          >
            ?
          </button>
        </div>
        <p className="menu__thesis">Throw higher than the pile, or eat the whole thing.</p>
      </header>

      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}

      <ol className="ranks" aria-label="Special cards">
        {SPECIALS.map(([value, effect]) => (
          <li key={value} className="ranks__item">
            <span className="ranks__rank">
              <RankGlyph value={value} label={RANK_LABEL[value]} />
            </span>
            <span className="ranks__effect">{effect}</span>
          </li>
        ))}
      </ol>

      <section className="panel menu__panel">
        <label className="field">
          <span className="field__label">Your name</span>
          <div className="field__row">
            <input
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pick a name"
              autoComplete="off"
            />
            <button type="button" className="btn btn--ghost" onClick={() => setName(randomUsername())}>
              Shuffle
            </button>
          </div>
        </label>

        <div className="menu__actions">
          <button
            type="button"
            className="btn btn--go"
            disabled={busy}
            onClick={() => void withName(() => transport.createLobby())}
          >
            {busy ? 'Just a moment…' : 'Host a table'}
          </button>

          <div className="menu__join">
            <input
              className="input--code"
              value={code}
              maxLength={LOBBY_CODE_LENGTH}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              aria-label="Table code"
              autoComplete="off"
            />
            <button
              type="button"
              className="btn"
              disabled={busy || code.length < LOBBY_CODE_LENGTH}
              onClick={() => void withName(() => transport.joinLobby(code))}
            >
              Join
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
