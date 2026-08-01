export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'

export interface Card {
  id: string
  suit: Suit
  value: number
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export type Zone = 'hand' | 'faceUp' | 'faceDown'

export type Phase = 'setup' | 'playing' | 'finished'

export interface PlayerState {
  playerId: string
  name: string
  isBot: boolean
  hand: Card[]
  faceUp: Card[]
  faceDown: Card[]
  isFinished: boolean
  /** Walked out mid-game. Holds no turn and ranks below everyone still playing. */
  hasLeft: boolean
}

export interface GameState {
  difficulty: Difficulty
  phase: Phase
  deck: Card[]
  pile: Card[]
  graveyard: Card[]
  activeValue: number | null
  forceLower: boolean
  players: PlayerState[]
  activePlayerId: string | null
  finishOrder: string[]
  turn: number
  rng: number
  lastReveal: Card | null
}

export type GameAction =
  | { type: 'setFaceUpCards'; playerId: string; cardIds: string[] }
  | { type: 'playCards'; playerId: string; cardIds: string[] }
  | { type: 'playFaceDownCard'; playerId: string; cardId: string }
  | { type: 'pickUpPile'; playerId: string }
  | { type: 'forfeit'; playerId: string }

export type GameEvent =
  | { type: 'PlayerReady'; playerId: string }
  | { type: 'CardsPlayed'; playerId: string; cards: Card[] }
  | { type: 'PileSwept'; playerId: string; cards: Card[]; reason: 'ten' | 'quad' }
  | { type: 'PlayRejected'; playerId: string; reason: string }
  | { type: 'PileTaken'; playerId: string; count: number }
  | { type: 'CardsDrawn'; playerId: string; count: number }
  | { type: 'PlayerSkipped'; playerId: string }
  | { type: 'PlayerFinished'; playerId: string; place: number }
  | { type: 'PlayerLeft'; playerId: string }
  | { type: 'GameOver'; loserId: string | null; finishOrder: string[] }

export interface ActionResult {
  state: GameState
  events: GameEvent[]
  error: string | null
}

export type LegalMove =
  | { kind: 'play'; zone: 'hand' | 'faceUp'; cardIds: string[]; value: number }
  | { kind: 'playFaceDown'; cardId: string }
  | { kind: 'pickUp' }
