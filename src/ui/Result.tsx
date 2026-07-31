import type { GameState } from '@/engine'
import { ordinal } from './format'

export function Result({ game, onDone }: { game: GameState; onDone: () => void }) {
  const nameOf = (id: string) => game.players.find((p) => p.playerId === id)?.name ?? 'Someone'
  const loser = game.players.find((p) => !p.isFinished)

  return (
    <div className="overlay">
      <section className="overlay__panel">
        <span className="eyebrow">Final</span>
        <h2 className="headline">{loser ? `${loser.name} is left holding the cards` : 'Table cleared'}</h2>
        <ol className="places">
          {game.finishOrder.map((id, index) => (
            <li key={id}>
              <span className="places__rank">{ordinal(index + 1)}</span>
              <span>{nameOf(id)}</span>
            </li>
          ))}
          {loser && (
            <li className="places__last">
              <span className="places__rank">{ordinal(game.players.length)}</span>
              <span>{loser.name}</span>
            </li>
          )}
        </ol>
        <button type="button" className="btn btn--primary btn--wide" onClick={onDone}>
          Back to the table
        </button>
      </section>
    </div>
  )
}
