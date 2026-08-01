import { useEffect, useMemo, useState } from 'react'
import {
  RANK_LABEL,
  getLegalMoves,
  playableZone,
  type Card,
  type GameState,
  type PlayerState,
} from '@/engine'
import type { RoomSnapshot, SweepTransport } from '@/net/transport'
import { LeaveGame } from './LeaveGame'
import { CardBack, EmptySlot, PlayingCard } from './PlayingCard'
import { PlayLog } from './PlayLog'
import { Result } from './Result'
import { demandOf } from './format'

interface Props {
  transport: SweepTransport
  room: RoomSnapshot
  game: GameState
  viewerId: string
  onError: (message: string | null) => void
}

export function GameTable({ transport, room, game, viewerId, onError }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [flash, setFlash] = useState(false)

  const viewer = game.players.find((p) => p.playerId === viewerId)!
  const opponents = game.players.filter((p) => p.playerId !== viewerId)
  const isMyTurn = game.activePlayerId === viewerId
  const moves = useMemo(() => getLegalMoves(game, viewerId), [game, viewerId])
  const zone = playableZone(viewer)

  const playableValues = new Set(moves.filter((m) => m.kind === 'play').map((m) => m.value))
  const canTakePile = moves.some((m) => m.kind === 'pickUp')
  const mustFlip = zone === 'faceDown' && isMyTurn
  const demand = demandOf(game)

  useEffect(() => setSelected([]), [game.turn, game.activePlayerId, viewerId])

  useEffect(() => {
    if (game.graveyard.length === 0) return
    setFlash(true)
    const timer = setTimeout(() => setFlash(false), 320)
    return () => clearTimeout(timer)
  }, [game.graveyard.length])

  const owned = [...viewer.hand, ...viewer.faceUp]
  const chosen = selected.filter((id) => owned.some((c) => c.id === id))

  const toggle = (card: Card) => {
    if (!isMyTurn || !playableValues.has(card.value)) return
    setSelected(() => {
      if (chosen.includes(card.id)) return chosen.filter((id) => id !== card.id)
      const sameValue = chosen.every((id) => owned.find((c) => c.id === id)?.value === card.value)
      return sameValue ? [...chosen, card.id] : [card.id]
    })
  }

  const send = async (command: Promise<{ ok: true } | { ok: false; error: string }>) => {
    const result = await command
    onError(result.ok ? null : result.error)
  }

  const throwCards = () => {
    if (chosen.length === 0) return
    void send(transport.dispatch({ type: 'playCards', playerId: viewerId, cardIds: chosen }))
  }

  const chosenValue = chosen.length > 0 ? owned.find((c) => c.id === chosen[0])?.value : undefined

  return (
    <main className={`screen table ${flash ? 'table--flash' : ''}`}>
      <header className="table__rail">
        <span className="wordmark wordmark--tiny">Sweep</span>
        <span className="rail__meta">
          <span className="rail__code">{room.lobby?.code}</span>
          <span className="rail__mode">{game.difficulty}</span>
        </span>
        <LeaveGame transport={transport} rivals={game.players.filter((p) => !p.isFinished && !p.hasLeft && p.playerId !== viewerId).length} />
      </header>

      <section className="opponents" aria-label="Other players">
        {opponents.map((player) => (
          <OpponentSeat key={player.playerId} player={player} active={game.activePlayerId === player.playerId} />
        ))}
      </section>

      <section className="board">
        <div className="demand" aria-live="polite">
          <p className="demand__headline">{demand.headline}</p>
          <p className="demand__escapes">{demand.escapes}</p>
        </div>

        <div className="board__row">
          <Stack label="Deck" count={game.deck.length} />
          <div className="pile">
            {game.pile.length === 0 ? (
              <EmptySlot label="Empty" />
            ) : (
              game.pile.slice(-4).map((card, index, shown) => (
                <div
                  key={card.id}
                  className="pile__card"
                  style={{ '--depth': shown.length - 1 - index } as React.CSSProperties}
                >
                  <PlayingCard card={card} />
                </div>
              ))
            )}
            {game.pile.length > 0 && <span className="pile__count">{game.pile.length}</span>}
          </div>
          <Stack label="Burned" count={game.graveyard.length} muted />
        </div>
      </section>

      <section className={`you ${isMyTurn ? 'you--active' : ''}`}>
        <div className="you__head">
          <span className="you__name">{viewer.name}</span>
          <span className="you__turn">{isMyTurn ? 'You’re up' : `${nameOf(game, game.activePlayerId)} is thinking`}</span>
        </div>

        <div className="tableau">
          <div className="tableau__group">
            <span className="eyebrow">Face down</span>
            <div className="tableau__cards">
              {viewer.faceDown.length === 0 && <EmptySlot label="Clear" />}
              {viewer.faceDown.map((card) =>
                mustFlip ? (
                  <button
                    key={card.id}
                    type="button"
                    className="card card--back card--tappable"
                    onClick={() => void send(transport.dispatch({ type: 'playFaceDownCard', playerId: viewerId, cardId: card.id }))}
                  >
                    <span className="card__count">Flip</span>
                  </button>
                ) : (
                  <CardBack key={card.id} />
                ),
              )}
            </div>
          </div>

          <div className="tableau__group">
            <span className="eyebrow">Face up</span>
            <div className="tableau__cards">
              {viewer.faceUp.length === 0 && <EmptySlot label="Clear" />}
              {viewer.faceUp.map((card) => (
                <PlayingCard
                  key={card.id}
                  card={card}
                  state={cardState(zone === 'faceUp' && isMyTurn, playableValues.has(card.value))}
                  selected={chosen.includes(card.id)}
                  onClick={zone === 'faceUp' ? () => toggle(card) : undefined}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="hand" aria-label="Your hand">
          {viewer.hand.map((card) => (
            <PlayingCard
              key={card.id}
              card={card}
              state={cardState(isMyTurn, playableValues.has(card.value))}
              selected={chosen.includes(card.id)}
              onClick={() => toggle(card)}
            />
          ))}
          {viewer.hand.length === 0 && <EmptySlot label="Empty" />}
        </div>

        <div className="actions">
          <button type="button" className="btn btn--primary" disabled={chosen.length === 0} onClick={throwCards}>
            {chosen.length === 0
              ? 'Choose a card'
              : `Throw ${chosen.length > 1 ? `${chosen.length} × ` : ''}${RANK_LABEL[chosenValue ?? 0]}`}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={!canTakePile}
            onClick={() => void send(transport.dispatch({ type: 'pickUpPile', playerId: viewerId }))}
          >
            Take the pile{game.pile.length > 0 ? ` (${game.pile.length})` : ''}
          </button>
        </div>
        {mustFlip && <p className="hint hint--center">Nothing left but the blind cards. Flip one and hope.</p>}
      </section>

      <PlayLog room={room} game={game} />
      {game.phase === 'finished' && <Result game={game} onDone={() => void send(transport.returnToLobby())} />}
    </main>
  )
}

function cardState(interactive: boolean, playable: boolean) {
  if (!interactive) return 'plain' as const
  return playable ? ('playable' as const) : ('dead' as const)
}

function nameOf(game: GameState, playerId: string | null): string {
  return game.players.find((p) => p.playerId === playerId)?.name ?? 'Someone'
}

function Stack({ label, count, muted = false }: { label: string; count: number; muted?: boolean }) {
  return (
    <div className={`stack ${muted ? 'stack--muted' : ''}`}>
      {count > 0 ? <CardBack count={count} /> : <EmptySlot label="—" />}
      <span className="stack__label">{label}</span>
    </div>
  )
}

function OpponentSeat({ player, active }: { player: PlayerState; active: boolean }) {
  return (
    <article className={`seat ${active ? 'seat--active' : ''} ${player.isFinished ? 'seat--out' : ''}`}>
      <header className="seat__head">
        <span className="seat__name">{player.name}</span>
        {player.isFinished ? <span className="tag">Out</span> : <span className="seat__hand">{player.hand.length}</span>}
      </header>
      <div className="seat__cards">
        {player.faceUp.map((card) => (
          <PlayingCard key={card.id} card={card} />
        ))}
        {player.faceDown.map((card) => (
          <CardBack key={card.id} />
        ))}
        {player.faceUp.length === 0 && player.faceDown.length === 0 && !player.isFinished && (
          <span className="seat__empty">table clear</span>
        )}
      </div>
    </article>
  )
}
