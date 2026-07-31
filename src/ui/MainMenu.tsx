import { useState } from 'react'
import { LOBBY_CODE_LENGTH, randomUsername, type Result } from '@/lobby'
import type { SweepTransport } from '@/net/transport'

const SPECIALS: [string, string][] = [
  ['2', 'resets the pile'],
  ['5', 'mirrors the card below'],
  ['7', 'forces the next play low'],
  ['8', 'skips the next player'],
  ['10', 'burns the pile'],
  ['A', 'tops everything'],
]

interface Props {
  transport: SweepTransport
  onError: (message: string | null) => void
}

export function MainMenu({ transport, onError }: Props) {
  const [name, setName] = useState(() => randomUsername())
  const [code, setCode] = useState('')

  const withName = (then: () => Result<unknown>) => {
    const named = transport.setUsername(name, false)
    if (!named.ok) return onError(named.error)
    const result = then()
    onError(result.ok ? null : result.error)
  }

  return (
    <main className="screen menu">
      <header className="menu__head">
        <h1 className="wordmark">Sweep</h1>
        <p className="menu__thesis">Throw higher, or take the whole pile.</p>
      </header>

      <ol className="ranks" aria-label="Special cards">
        {SPECIALS.map(([rank, effect]) => (
          <li key={rank} className="ranks__item">
            <span className="ranks__rank">{rank}</span>
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
          <button type="button" className="btn btn--primary" onClick={() => withName(() => transport.createLobby())}>
            Host a table
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
              disabled={code.length < LOBBY_CODE_LENGTH}
              onClick={() => withName(() => transport.joinLobby(code))}
            >
              Join
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
