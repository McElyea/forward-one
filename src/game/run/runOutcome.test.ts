import { describe, expect, it } from 'vitest'
import { placeLabel, placeOfLocal, runOutcome, timeLimitOutcome } from './runOutcome'
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

  it('takes the suffix from the last two digits past a hundred', () => {
    expect([101, 102, 103, 104, 111, 112, 113, 121].map(placeLabel)).toEqual([
      '101ST',
      '102ND',
      '103RD',
      '104TH',
      '111TH',
      '112TH',
      '113TH',
      '121ST',
    ])
  })

  it('falls back to a numeric ordinal below the named places', () => {
    expect(placeLabel(0)).toBe('0TH')
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

  it('ends a race blurb with the last-paddler rule', () => {
    expect(runOutcome('multiplayer', 3, 25_400, 'The Narrows').blurb).toBe(
      'THIRD after 25 seconds on The Narrows. The last paddler in the water wins.',
    )
  })

  it('uses the numeric ordinal in both race lines past fourth place', () => {
    const outcome = runOutcome('multiplayer', 5, 12_000, 'Broken Water')

    expect(outcome.heading).toBe('5TH PLACE')
    expect(outcome.blurb.startsWith('5TH after 12 seconds')).toBe(true)
  })

  it('passes the place through unchanged, even in a solo run', () => {
    expect(runOutcome('solo', 3, 1_000, 'Warm-up Run')).toMatchObject({
      place: 3,
      placeLabel: 'THIRD',
      heading: 'SWEPT AWAY',
    })
  })
})

describe('timeLimitOutcome', () => {
  it('declares the only connected survivor the winner', () => {
    const local = racer('you', true)
    const maya = { ...racer('maya', false), eliminated: true, survivalMs: 42_000 }

    expect(timeLimitOutcome([local, maya], 60_000, 'Broken Water')).toMatchObject({
      place: 1,
      placeLabel: 'FIRST',
      heading: 'YOU WIN',
    })
  })

  it('declares a tie when multiple connected paddlers survive the minute', () => {
    const outcome = timeLimitOutcome(
      [racer('you', true), racer('maya', false), racer('eli', false)],
      60_000,
      'The Narrows',
    )

    expect(outcome).toMatchObject({
      place: 1,
      placeLabel: 'TIED',
      heading: 'TIE FOR FIRST',
    })
    expect(outcome.blurb).toContain('3 paddlers were still afloat')
  })

  it('does not let a disconnected paddler turn a win into a tie', () => {
    const disconnected = { ...racer('maya', false), connected: false }

    expect(timeLimitOutcome(
      [racer('you', true), disconnected],
      60_000,
      'Warm-up Run',
    ).heading).toBe('YOU WIN')
  })

  it('tells the sole survivor they were the only paddler afloat', () => {
    expect(timeLimitOutcome([racer('you', true)], 60_900, 'Broken Water').blurb).toBe(
      'Time expired after 60 seconds on Broken Water. You were the only paddler still afloat.',
    )
  })

  it('reports no time at all rather than a negative one when time expires', () => {
    const outcome = timeLimitOutcome(
      [racer('you', true), racer('maya', false)],
      -1_000,
      'The Narrows',
    )

    expect(outcome.blurb).toContain('after 0 seconds')
  })

  it('ranks an eliminated local paddler by survival time behind the survivors', () => {
    const local = { ...racer('you', true), eliminated: true, survivalMs: 30_000 }
    const maya = { ...racer('maya', false), survivalMs: 60_000 }
    const eli = { ...racer('eli', false), eliminated: true, survivalMs: 20_000 }

    expect(timeLimitOutcome([eli, local, maya], 60_000, 'Broken Water')).toEqual({
      place: 2,
      placeLabel: 'SECOND',
      heading: 'SECOND PLACE',
      blurb: 'SECOND after 60 seconds on Broken Water. The last paddler in the water wins.',
    })
  })

  it('does not count a disconnected local paddler as a leader', () => {
    const local = { ...racer('you', true), connected: false, survivalMs: 10_000 }
    const maya = { ...racer('maya', false), survivalMs: 60_000 }

    expect(timeLimitOutcome([local, maya], 60_000, 'Warm-up Run')).toMatchObject({
      place: 2,
      heading: 'SECOND PLACE',
    })
  })

  it('places by survival time when nobody is left afloat', () => {
    const local = { ...racer('you', true), eliminated: true, survivalMs: 50_000 }
    const maya = { ...racer('maya', false), eliminated: true, survivalMs: 45_000 }

    expect(timeLimitOutcome([maya, local], 60_000, 'The Narrows')).toMatchObject({
      place: 1,
      placeLabel: 'FIRST',
      heading: 'FIRST PLACE',
    })
  })

  it('leaves the racers it was given in their original order', () => {
    const local = { ...racer('you', true), eliminated: true, survivalMs: 30_000 }
    const maya = { ...racer('maya', false), survivalMs: 60_000 }
    const racers = [local, maya]

    timeLimitOutcome(racers, 60_000, 'Broken Water')

    expect(racers.map((entry) => entry.id)).toEqual(['you', 'maya'])
  })
})
