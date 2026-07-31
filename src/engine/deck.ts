import type { Card, Suit } from './types'

export const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades']
export const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

export const RANK_LABEL: Record<number, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
}

export const SUIT_SYMBOL: Record<Suit, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
}

export function nextRandom(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [value, t | 0]
}

export function buildDeck(): Card[] {
  const cards: Card[] = []
  for (const suit of SUITS) {
    for (const value of VALUES) {
      cards.push({ id: `${suit[0]}${value}`, suit, value })
    }
  }
  return cards
}

export function shuffle<T>(items: T[], seed: number): [T[], number] {
  const out = items.slice()
  let state = seed
  for (let i = out.length - 1; i > 0; i--) {
    const [r, next] = nextRandom(state)
    state = next
    const j = Math.floor(r * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return [out, state]
}

export function cardLabel(card: Card): string {
  return `${RANK_LABEL[card.value]}${SUIT_SYMBOL[card.suit]}`
}
