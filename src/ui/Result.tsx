import type { GameState } from '@/engine'
import { ordinal } from './format'

export function Result({ game, onDone }: { game: GameState; onDone: () => void }) {
  const nameOf = (id: string) => game.players.find((p) => p.playerId === id)?.name ?? 'Someone'
  const walkedOut = game.players.filter((p) => p.hasLeft)
  const loser = game.players.find((p) => !p.isFinished && !p.hasLeft)
  const winner = game.finishOrder[0]

  const headline =
    walkedOut.length > 0 && !loser
      ? `${walkedOut.map((p) => p.name).join(', ')} left — ${nameOf(winner)} wins`
      : loser
        ? `${loser.name} is left holding the cards`
        : 'Table cleared'

  // Anyone who walked out ranks below every player who saw the game through.
  const tail = [...(loser ? [loser] : []), ...walkedOut]

  return (
    <div className="overlay">
      <section className="overlay__panel">
        <span className="eyebrow">Final</span>
        <h2 className="headline">{headline}</h2>
        <ol className="places">
          {game.finishOrder.map((id, index) => (
            <li key={id}>
              <span className="places__rank">{ordinal(index + 1)}</span>
              <span>{nameOf(id)}</span>
            </li>
          ))}
          {tail.map((player, index) => (
            <li key={player.playerId} className="places__last">
              <span className="places__rank">{ordinal(game.finishOrder.length + index + 1)}</span>
              <span>
                {player.name}
                {player.hasLeft && <em className="tag">Left</em>}
              </span>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn--primary btn--wide" onClick={onDone}>
          Back to the table
        </button>
      </section>
    </div>
  )
}
