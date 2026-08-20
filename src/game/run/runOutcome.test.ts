import { describe, expect, it } from 'vitest'
import { placeLabel, placeOfLocal, runOutcome } from './runOutcome'
import type { RacerSnapshot } from '../types'

const racer = (id: string, isLocal: boolean): RacerSnapshot => ({
  id,
  name: id.toUpperCase(),
  color: 0xffffff,
  progress: 0,
  survivalMs: 0,
  eliminated: false,
  isLocal,
  connected: true,
})

describe('placeOfLocal', () => {
  it('counts from one, not from zero', () => {
    expect(placeOfLocal([racer('you', true), racer('maya', false)])).toBe(1)
  })

  it('finds the local racer wherever the ranking puts them', () => {
    const ranked = [racer('maya', false), racer('eli', false), racer('you', true)]

    expect(placeOfLocal(ranked)).toBe(3)
  })

  it('reads a ranking without the local racer as the lead', () => {
    expect(placeOfLocal([racer('maya', false)])).toBe(1)
    expect(placeOfLocal([])).toBe(1)
  })
})

describe('placeLabel', () => {
  it('spells out the original four places', () => {
    expect([1, 2, 3, 4].map(placeLabel)).toEqual(['FIRST', 'SECOND', 'THIRD', 'FOURTH'])
  })

  it('formats numeric ordinals for larger rooms', () => {
    expect([5, 8, 11, 12, 13, 21, 32, 63, 64].map(placeLabel)).toEqual([
      '5TH',
      '8TH',
      '11TH',
      '12TH',
      '13TH',
      '21ST',
      '32ND',
      '63RD',
      '64TH',
    ])
  })
})

describe('runOutcome', () => {
  it('tells a solo paddler they were swept away, and never a place', () => {
    const outcome = runOutcome('solo', 1, 19_340, 'Warm-up Run')

    expect(outcome.heading).toBe('SWEPT AWAY')
    expect(outcome.blurb).toBe(
      'You survived 19 seconds on Warm-up Run. Read each obstacle and hold the line longer next run.',
    )
  })

  it('names the place in a race, in both lines', () => {
    const outcome = runOutcome('multiplayer-preview', 2, 40_000, 'Broken Water')

    expect(outcome.heading).toBe('SECOND PLACE')
    expect(outcome.blurb).toContain('SECOND after 40 seconds on Broken Water')
    expect(outcome.placeLabel).toBe('SECOND')
  })

  it('truncates the seconds it reports rather than rounding up', () => {
    expect(runOutcome('solo', 1, 19_999, 'Warm-up Run').blurb).toContain('19 seconds')
  })

  it('reports no time at all rather than a negative one', () => {
    expect(runOutcome('solo', 1, -500, 'The Narrows').blurb).toContain('0 seconds')
  })

  it('names the level the run was actually on', () => {
    expect(runOutcome('solo', 1, 1_000, 'No Mistakes').blurb).toContain('on No Mistakes')
  })
})
