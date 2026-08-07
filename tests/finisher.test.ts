import { describe, expect, it } from 'vitest'
import { applyAction } from '@/engine/game'
import {
  GREAT_BAND,
  PERFECT_BAND,
  SWEEP_MS,
  endingFor,
  finisherFor,
  gradeAt,
  missLine,
  sweepAt,
} from '@/ui/finisher'
import { ids, seat, stateOf } from './helpers'

describe('the finisher gesture', () => {
  it('is offered for the throw that empties your last zone', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['9h', '9s'] }, { id: 'b', hand: ['4c'] }],
      pile: ['3c'],
      deck: [],
    })

    const finisher = finisherFor(state, seat(state, 'a'))
    expect(finisher).not.toBeNull()
    expect(finisher!.zone).toBe('hand')
    expect(finisher!.value).toBe(9)
    expect(ids(finisher!.cards)).toEqual(['h9', 's9'])
  })

  it('really does take the player out — the predicate matches the engine', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['9h', '9s'] }, { id: 'b', hand: ['4c'] }],
      pile: ['3c'],
      deck: [],
    })
    const finisher = finisherFor(state, seat(state, 'a'))!

    const result = applyAction(state, { type: 'playCards', playerId: 'a', cardIds: ids(finisher.cards) })

    expect(result.error).toBeNull()
    expect(seat(result.state, 'a').isFinished).toBe(true)
  })

  it('falls back to the face-up row once the hand is empty', () => {
    const state = stateOf({
      seats: [{ id: 'a', faceUp: ['Kh', 'Ks'] }, { id: 'b', hand: ['4c'] }],
      pile: ['3c'],
      deck: [],
    })

    expect(finisherFor(state, seat(state, 'a'))?.zone).toBe('faceUp')
  })

  it('stays hidden whenever the throw would leave something behind', () => {
    const holdsBack = (spec: Parameters<typeof stateOf>[0]) => finisherFor(stateOf(spec), seat(stateOf(spec), 'a'))

    // Cards still to draw — the hand refills the moment it empties.
    expect(holdsBack({ seats: [{ id: 'a', hand: ['9h'] }, { id: 'b' }], pile: ['3c'], deck: ['2c'] })).toBeNull()
    // A blind card is still on the table, and it might not even beat the pile.
    expect(
      holdsBack({ seats: [{ id: 'a', hand: ['9h'], faceDown: ['2c'] }, { id: 'b' }], pile: ['3c'], deck: [] }),
    ).toBeNull()
    // The face-up row outlives the hand, so emptying the hand ends nothing.
    expect(
      holdsBack({ seats: [{ id: 'a', hand: ['9h'], faceUp: ['2c'] }, { id: 'b' }], pile: ['3c'], deck: [] }),
    ).toBeNull()
    // Two values can't leave in one throw.
    expect(holdsBack({ seats: [{ id: 'a', hand: ['9h', '8s'] }, { id: 'b' }], pile: ['3c'], deck: [] })).toBeNull()
    // Legal for the zone, but not against this pile.
    expect(holdsBack({ seats: [{ id: 'a', hand: ['3h'] }, { id: 'b' }], pile: ['Ks'], deck: [] })).toBeNull()
  })

  it('is never offered off-turn', () => {
    const state = stateOf({
      seats: [{ id: 'a', hand: ['4c'] }, { id: 'b', hand: ['9h'] }],
      pile: ['3c'],
      deck: [],
      activePlayerId: 'a',
    })

    expect(finisherFor(state, seat(state, 'b'))).toBeNull()
  })

  it('splits into two endings at the edge of the green', () => {
    // Both bands are green, so both throw the party; only falling off the
    // track entirely gets roasted.
    expect(endingFor('perfect')).toBe('hit')
    expect(endingFor('great')).toBe('hit')
    expect(endingFor('clean')).toBe('miss')

    // Which means the ending flips exactly at the outer band's edge.
    expect(endingFor(gradeAt(0.5 - GREAT_BAND / 2 + 0.001))).toBe('hit')
    expect(endingFor(gradeAt(0.5 - GREAT_BAND / 2 - 0.001))).toBe('miss')
  })

  it('picks a stable roast for a given strike', () => {
    // Ids are negative in the UI (they sit below the log's), so it has to cope.
    for (const seed of [-1, -2, -37, 0, 5]) {
      expect(missLine(seed)).toBe(missLine(seed))
      expect(missLine(seed).length).toBeGreaterThan(0)
    }
    // Not one line for everything.
    expect(new Set([-1, -2, -3, -4, -5, -6, -7, -8].map(missLine)).size).toBeGreaterThan(1)
  })

  it('sweeps the marker wall to wall and grades off the middle', () => {
    expect(sweepAt(0)).toBeCloseTo(0)
    expect(sweepAt(SWEEP_MS / 4)).toBeCloseTo(0.5)
    expect(sweepAt(SWEEP_MS / 2)).toBeCloseTo(1)
    expect(sweepAt(SWEEP_MS * 0.75)).toBeCloseTo(0.5)
    // It loops, so a slow player still gets another pass at the sweet spot.
    expect(sweepAt(SWEEP_MS * 1.25)).toBeCloseTo(0.5)

    expect(gradeAt(0.5)).toBe('perfect')
    // Bands are widths of the whole track, so they reach half that far each way.
    expect(gradeAt(0.5 + PERFECT_BAND / 2 - 0.001)).toBe('perfect')
    expect(gradeAt(0.5 + PERFECT_BAND / 2 + 0.001)).toBe('great')
    expect(gradeAt(0.5 - GREAT_BAND / 2 + 0.001)).toBe('great')
    expect(gradeAt(0.5 - GREAT_BAND / 2 - 0.001)).toBe('clean')
    expect(gradeAt(0)).toBe('clean')
    expect(gradeAt(1)).toBe('clean')
  })
})
