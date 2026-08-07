import type { GameState, PlayerState } from '@/engine'
import { Digits } from './PlayingCard'
import { ordinal } from './format'

const cardsLeft = (player: PlayerState) => player.hand.length + player.faceUp.length + player.faceDown.length

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

interface Props {
  game: GameState
  viewerId: string
  /** Only the host can deal, so only the host's rematch button starts the countdown. */
  isHost: boolean
  onRematch: () => void
  onDone: () => void
}

export function Result({ game, viewerId, isHost, onRematch, onDone }: Props) {
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

  // How close it actually was. Everyone who went out ended on zero, so the only
  // numbers worth showing are the ones still holding cards when it stopped.
  const holding = game.players.filter((p) => cardsLeft(p) > 0)
  const deepest = holding.reduce((max, p) => Math.max(max, cardsLeft(p)), 0)

  return (
    <div className="overlay">
      <section className="overlay__panel">
        <span className="eyebrow">Game over</span>
        <h2 className="headline">{headline}</h2>

        {holding.length > 0 && (
          <section className="close">
            <span className="eyebrow">How close it was</span>
            <ul className="close__list">
              {holding.map((player) => {
                const left = cardsLeft(player)
                return (
                  <li key={player.playerId} className={player.playerId === viewerId ? 'close__row close__row--you' : 'close__row'}>
                    <span className="close__name">{player.playerId === viewerId ? 'You' : player.name}</span>
                    <span
                      className="close__bar"
                      style={{ '--fill': deepest === 0 ? 0 : left / deepest } as React.CSSProperties}
                      aria-hidden="true"
                    />
                    <span className="close__count">
                      <Digits value={left} label={`${plural(left, 'card')} left`} />
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="hint">
              {loser
                ? loser.playerId === viewerId
                  ? `${plural(cardsLeft(loser), 'card')} short of walking away clean.`
                  : `${loser.name} ended ${plural(cardsLeft(loser), 'card')} from getting out.`
                : 'Everybody got out.'}
            </p>
          </section>
        )}

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

        {/* Only the host can deal, so only the host gets a one-tap rematch;
            for everyone else the rematch button would be the lobby button. */}
        {isHost && (
          <button type="button" className="btn btn--go btn--wide" onClick={onRematch}>
            Rematch
          </button>
        )}
        <button
          type="button"
          className={isHost ? 'btn btn--ghost btn--wide' : 'btn btn--go btn--wide'}
          onClick={onDone}
        >
          Back to the lobby
        </button>
      </section>
    </div>
  )
}
