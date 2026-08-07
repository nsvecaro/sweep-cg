import type { Difficulty, GameEvent } from '@/engine'
import { RANK_LABEL, isSpecial } from '@/engine'

/**
 * The cabinet's running mouth. Every line is picked from the log entry's id, so
 * a play reads identically on every device at the table — nobody sees a
 * different joke about the same card.
 */
export interface Shout {
  /** Who the line is about. Small, above the shout. */
  who: string
  text: string
  tone: 'hit' | 'pair' | 'triple' | 'burn' | 'quad' | 'take' | 'skip' | 'time' | 'out'
  /** Drives how hard the screen reacts: 0 nothing, 3 everything. */
  force: 0 | 1 | 2 | 3
  /** Cards behind the effect — bigger stack, bigger and longer explosion. 1 by default. */
  scale: number
}

const BURN = ['SCORCHED EARTH', 'TEN. GOODNIGHT.', 'THE PILE IS ASH', 'INCINERATED', 'BURN IT ALL']
const QUAD = ['QUADZILLA', 'FOUR OF THEM. FOUR!', 'ALL FOUR. RUDE.', 'QUAD SQUAD ASSEMBLE']
const PAIR = ['DOUBLE TROUBLE', 'SEEING DOUBLE', 'TWO AT ONCE', 'PAIR BOMB']
const TRIPLE = ['TRIPLE THREAT', 'THREE?! GREEDY', 'HAT TRICK', 'A WHOLE TRIO']
const RESET = ['NOTHING MATTERS NOW', 'HARD RESET', 'TWO SAYS NO', 'BOARD WIPED CLEAN']
const MIRROR = ['COPYCAT', 'MIRROR MODE', 'FIVE STEALS ITS FACE', 'SAME THING. AGAIN.']
const LOW = ['EVERYBODY DUCK', 'SEVEN SAYS GO LOW', 'LIMBO TIME', 'UNDER SEVEN OR ELSE']
const SKIP = ['SKIPPED. NEXT.', 'EIGHT ATE YOUR TURN', 'SIT BACK DOWN', 'TURN? DENIED.']
const ACE = ['ACE. SIT DOWN.', 'NOTHING BEATS THAT', 'TOP OF THE FOOD CHAIN', 'DISCUSSION OVER']
const PLAIN = [
  'BOLD. WRONG, BUT BOLD.',
  'SURE. WHY NOT.',
  'A CARD WAS PLAYED',
  'COMMITTED',
  'NO NOTES',
  'BRAVE LITTLE CARD',
  'OKAY THEN',
  'THAT WILL DO NOTHING',
]
const TAKE = [
  'EATS THE WHOLE PILE',
  'HANDS FULL OF SHAME',
  'TAKES IT ALL HOME',
  'PILE: CONSUMED',
  'THAT IS YOURS NOW',
  'ENJOY THE PAPERWORK',
]
const BLIND_MISS = [
  (rank: string) => `FLIPPED A ${rank.toUpperCase()} AND EAT THE PILE`,
  (rank: string) => `${rank.toUpperCase()}?? EAT THE WHOLE PILE`,
  (rank: string) => `SHOULD HAVE LOOKED. ${rank.toUpperCase()} EATS THE PILE`,
  (rank: string) => `BLIND ${rank.toUpperCase()}. IT'S ALL YOURS NOW`,
  (rank: string) => `GAMBLED ON A ${rank.toUpperCase()}. LOST THE WHOLE PILE`,
]
const TIME = ['FELL ASLEEP', 'TOO SLOW', 'THE CLOCK WINS', 'TIME. UP.']
const DONE = ['OUT! CLEAN HANDS', 'GONE. LEGEND.', 'EMPTY HANDED, HAPPY']

/** Deterministic and stable: the same entry always yields the same line. */
function pick<T>(lines: T[], seed: number): T {
  const hash = (seed * 2654435761) >>> 0
  return lines[hash % lines.length]
}

export function shoutFor(
  event: GameEvent,
  seed: number,
  difficulty: Difficulty,
  nameOf: (id: string) => string,
): Shout | null {
  switch (event.type) {
    case 'CardsPlayed': {
      const who = nameOf(event.playerId)
      const value = event.cards[0].value
      const count = event.cards.length

      // A run of the same card is the loudest thing a play can be, short of a sweep.
      if (count === 3) return { who, text: pick(TRIPLE, seed), tone: 'triple', force: 2, scale: count }
      if (count === 2) return { who, text: pick(PAIR, seed), tone: 'pair', force: 2, scale: count }

      if (value === 14) return { who, text: pick(ACE, seed), tone: 'hit', force: 1, scale: 1 }
      if (value === 2) return { who, text: pick(RESET, seed), tone: 'hit', force: 1, scale: 1 }
      if (value === 5 && isSpecial(5, difficulty))
        return { who, text: pick(MIRROR, seed), tone: 'hit', force: 1, scale: 1 }
      if (value === 7 && isSpecial(7, difficulty))
        return { who, text: pick(LOW, seed), tone: 'hit', force: 1, scale: 1 }
      if (value === 8 && isSpecial(8, difficulty))
        return { who, text: pick(SKIP, seed), tone: 'skip', force: 1, scale: 1 }

      // Ordinary cards keep quiet most of the time. A cabinet that shouts at
      // every single throw stops being funny by the third hand.
      return seed % 3 === 0 ? { who, text: pick(PLAIN, seed), tone: 'hit', force: 0, scale: 1 } : null
    }
    case 'PileSwept': {
      // The bigger the pile it eats, the bigger the blast — capped so a huge
      // pile doesn't blow the effect past what the screen can sanely show.
      const scale = Math.min(event.cards.length, 10)
      return event.reason === 'quad'
        ? { who: nameOf(event.playerId), text: pick(QUAD, seed), tone: 'quad', force: 3, scale }
        : { who: nameOf(event.playerId), text: pick(BURN, seed), tone: 'burn', force: 3, scale }
    }
    case 'PileTaken':
      return {
        who: nameOf(event.playerId),
        text: `${pick(TAKE, seed)} (${event.count})`,
        tone: 'take',
        force: 2,
        scale: 1,
      }
    case 'BlindFlipMissed':
      // Also emits PileTaken right after. Outranking it keeps the funnier
      // half of the same moment — the one that names the card — on screen.
      return {
        who: nameOf(event.playerId),
        text: pick(BLIND_MISS, seed)(RANK_LABEL[event.card.value]),
        tone: 'take',
        force: 3,
        scale: 1,
      }
    case 'PlayerTimedOut':
      return { who: nameOf(event.playerId), text: pick(TIME, seed), tone: 'time', force: 2, scale: 1 }
    case 'PlayerFinished':
      return { who: nameOf(event.playerId), text: pick(DONE, seed), tone: 'out', force: 3, scale: 1 }
    default:
      return null
  }
}
