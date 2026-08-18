import { describe, expect, it } from 'vitest'
import type { LevelConfig, StrokeRating } from '../types'
import { SurvivalEngine, survivalIntensity } from './SurvivalEngine'

const LEVEL: LevelConfig = {
  id: 'test-water',
  rapidClass: 2,
  name: 'Test Water',
  description: 'A deterministic test course.',
  accent: '#ffc857',
  survivalBenchmarkMs: 38_000,
  cues: [
    { at: 3_000, direction: 'forward', strokes: 1 },
    { at: 6_000, direction: 'backward', strokes: 2, interval: 500 },
  ],
}

const recordCue = (
  survival: SurvivalEngine,
  cueIndex: number,
  strokes: number,
  rating: StrokeRating,
): void => {
  for (let strokeIndex = 0; strokeIndex < strokes; strokeIndex += 1) {
    survival.recordJudgment({
      target: {
        id: `${cueIndex}-${strokeIndex}`,
        cueIndex,
        strokeIndex,
        direction: 'forward',
        targetTime: 0,
        status: rating,
      },
      rating,
      offsetMs: rating === 'miss' ? null : 0,
      points: rating === 'perfect' ? 100 : 0,
    })
  }
}

const resolveEvent = (
  survival: SurvivalEngine,
  cueIndex: number,
  rating?: StrokeRating,
) => {
  const event = survival.events[cueIndex]
  if (rating) recordCue(survival, cueIndex, event.cue.strokes, rating)
  return survival.resolveThrough(event.resolveAt + 1)
}

describe('SurvivalEngine', () => {
  it('repeats the authored call pattern into an endless obstacle schedule', () => {
    const survival = new SurvivalEngine(LEVEL)

    const events = survival.ensureScheduledThrough(20_000)

    expect(events.length).toBeGreaterThan(LEVEL.cues.length)
    expect(events.slice(0, 4).map((event) => event.cue.direction)).toEqual([
      'forward',
      'backward',
      'forward',
      'backward',
    ])
    expect(events.map((event) => event.cueIndex)).toEqual(
      events.map((_, index) => index),
    )
    expect(new Set(events.map((event) => event.obstacle)).size).toBeGreaterThan(1)
  })

  it('raises intensity with time and starts harder classes under more pressure', () => {
    expect(survivalIntensity(2, 0)).toBe(1)
    expect(survivalIntensity(5, 0)).toBeGreaterThan(survivalIntensity(2, 0))
    expect(survivalIntensity(2, 90_000)).toBeGreaterThan(survivalIntensity(2, 30_000))
    expect(survivalIntensity(5, 1_000_000)).toBe(3.2)
  })

  it('shortens later call gaps as the river intensifies', () => {
    const survival = new SurvivalEngine(LEVEL)
    survival.ensureScheduledThrough(180_000)

    const gaps = survival.events.slice(1).map((event, index) => (
      event.cue.at - survival.events[index].cue.at
    ))
    const earlyAverage = gaps.slice(0, 4).reduce((sum, gap) => sum + gap, 0) / 4
    const lateAverage = gaps.slice(-4).reduce((sum, gap) => sum + gap, 0) / 4

    expect(lateAverage).toBeLessThan(earlyAverage)
  })

  it('keeps the player aboard when every requested stroke lands', () => {
    const survival = new SurvivalEngine(LEVEL)
    survival.ensureScheduledThrough(10_000)

    expect(resolveEvent(survival, 0, 'good')).toEqual([])
    expect(resolveEvent(survival, 1, 'early')).toEqual([])
    expect(survival.getSnapshot(10_000).state).toBe('aboard')
    expect(survival.getSnapshot(10_000).stability).toBe(3)
  })

  it('clears a fully judged obstacle immediately instead of drawing it through the raft', () => {
    const survival = new SurvivalEngine(LEVEL)
    survival.ensureScheduledThrough(10_000)
    const first = survival.events[0]

    recordCue(survival, 0, first.cue.strokes, 'perfect')

    expect(survival.resolveThrough(first.cue.at)).toEqual([])
    expect(survival.getVisibleEvents(first.cue.at)).not.toContain(first)
  })

  it('counts a partly missed multi-stroke call as an obstacle impact', () => {
    const survival = new SurvivalEngine(LEVEL)
    survival.ensureScheduledThrough(10_000)
    const event = survival.events[1]

    resolveEvent(survival, 0, 'perfect')
    recordCue(survival, 1, 1, 'perfect')
    expect(survival.resolveThrough(event.resolveAt + 1).map(({ type }) => type)).toEqual([
      'impact',
    ])
    expect(survival.getSnapshot(event.resolveAt + 1).stability).toBe(2)
  })

  it('ejects after three failed calls, then allows two calls to reach the raft', () => {
    const survival = new SurvivalEngine(LEVEL)
    survival.ensureScheduledThrough(30_000)

    expect(resolveEvent(survival, 0)[0].type).toBe('impact')
    expect(resolveEvent(survival, 1)[0].type).toBe('impact')
    expect(resolveEvent(survival, 2)[0].type).toBe('ejected')
    expect(survival.getSnapshot(0).state).toBe('overboard')

    expect(resolveEvent(survival, 3, 'good')[0].type).toBe('recovery-progress')
    expect(resolveEvent(survival, 4, 'perfect')[0].type).toBe('recovered')
    expect(survival.getSnapshot(0)).toMatchObject({
      state: 'aboard',
      stability: 2,
      recovery: 0,
    })
  })

  it('ends the run after two consecutive failed recovery calls', () => {
    const survival = new SurvivalEngine(LEVEL)
    survival.ensureScheduledThrough(40_000)

    resolveEvent(survival, 0)
    resolveEvent(survival, 1)
    resolveEvent(survival, 2)
    expect(resolveEvent(survival, 3)[0].type).toBe('drifted')
    expect(resolveEvent(survival, 4)[0].type).toBe('swept-away')
    expect(survival.getSnapshot(0).state).toBe('swept-away')
  })

  it('surfaces only the active guide call and nearby visible obstacles', () => {
    const survival = new SurvivalEngine(LEVEL)
    survival.ensureScheduledThrough(10_000)
    const first = survival.events[0]

    expect(survival.getCurrentCall(first.cue.at - 1_500)).toBe(first)
    expect(survival.getCurrentCall(first.cue.at - 1_501)).toBeUndefined()
    expect(survival.getVisibleEvents(first.cue.at, 0, 0)).toEqual([first])
  })
})

describe('SurvivalEngine, at its edges', () => {
  it('refuses a level with no guide calls, rather than scheduling nothing', () => {
    expect(() => new SurvivalEngine({ ...LEVEL, cues: [] })).toThrow(
      'A survival run needs at least one guide call',
    )
  })

  it('paces a single-call level from a standing gap, not from no gap at all', () => {
    // With one cue there is no authored gap to measure, so the engine supplies
    // one. Without it the schedule collapses onto the recovery floor and the
    // river calls roughly five times a second.
    const survival = new SurvivalEngine({ ...LEVEL, cues: [LEVEL.cues[0]] })
    survival.ensureScheduledThrough(30_000)

    expect(survival.events.length, 'a one-call level scheduled nothing').toBeGreaterThan(1)
    const firstGap = survival.events[1].cue.at - survival.events[0].cue.at

    expect(firstGap, 'a one-call level schedules calls on top of each other').toBeGreaterThan(
      2_000,
    )
  })

  it('ignores a stroke that belongs to no call', () => {
    const survival = new SurvivalEngine(LEVEL)
    survival.ensureScheduledThrough(10_000)

    survival.recordJudgment({ target: null, rating: 'perfect', offsetMs: 0, points: 100 })

    expect(resolveEvent(survival, 0)[0].type, 'a targetless stroke saved the raft').toBe(
      'impact',
    )
  })

  // Two things stop a late stroke: `recordJudgment` drops it, and
  // `resolveThrough` skips a cue it has already settled. Only the second is
  // load-bearing — removing the first changes nothing observable — so this
  // pins the behaviour rather than either guard.
  it('ignores a stroke that arrives after its call has been settled', () => {
    const survival = new SurvivalEngine(LEVEL)
    survival.ensureScheduledThrough(10_000)

    expect(resolveEvent(survival, 0)[0].type).toBe('impact')
    recordCue(survival, 0, survival.events[0].cue.strokes, 'perfect')

    expect(
      survival.resolveThrough(survival.events[0].resolveAt + 1),
      'a late stroke re-opened a settled call',
    ).toEqual([])
    expect(survival.getSnapshot(0).stability).toBe(2)
  })

  it('never repairs the raft past full, however many calls land', () => {
    const survival = new SurvivalEngine(LEVEL)
    survival.ensureScheduledThrough(30_000)

    for (const cueIndex of [0, 1, 2, 3]) {
      resolveEvent(survival, cueIndex, 'perfect')
    }

    expect(survival.getSnapshot(0).stability).toBe(3)
  })

  it('puts a recovered swimmer back on a raft that is already damaged', () => {
    const survival = new SurvivalEngine(LEVEL)
    survival.ensureScheduledThrough(40_000)

    for (const cueIndex of [0, 1, 2]) resolveEvent(survival, cueIndex)
    resolveEvent(survival, 3, 'good')
    resolveEvent(survival, 4, 'perfect')

    // One more miss must not cost the whole raft — but two more must.
    expect(survival.getSnapshot(0).stability).toBe(2)
    expect(resolveEvent(survival, 5)[0].type).toBe('impact')
    expect(resolveEvent(survival, 6)[0].type).toBe('ejected')
  })

  it('counts only consecutive misses toward being swept away', () => {
    const survival = new SurvivalEngine(LEVEL)
    survival.ensureScheduledThrough(60_000)

    for (const cueIndex of [0, 1, 2]) resolveEvent(survival, cueIndex)
    expect(resolveEvent(survival, 3)[0].type).toBe('drifted')
    // A landed call resets the count, so the next miss is a first miss again.
    expect(resolveEvent(survival, 4, 'good')[0].type).toBe('recovery-progress')
    expect(resolveEvent(survival, 5)[0].type).toBe('drifted')
    expect(survival.getSnapshot(0).state).toBe('overboard')
  })

  it('stops reporting once the river has won', () => {
    const survival = new SurvivalEngine(LEVEL)
    survival.ensureScheduledThrough(60_000)

    for (const cueIndex of [0, 1, 2, 3, 4]) resolveEvent(survival, cueIndex)
    expect(survival.getSnapshot(0).state).toBe('swept-away')

    expect(
      resolveEvent(survival, 5, 'perfect'),
      'a swept-away run kept judging calls',
    ).toEqual([])
    expect(survival.getSnapshot(0).state).toBe('swept-away')
  })

  it('caps how hard the river can ever get', () => {
    expect(survivalIntensity(5, 60 * 60_000)).toBe(3.2)
    expect(survivalIntensity(2, Number.MAX_SAFE_INTEGER)).toBe(3.2)
  })

  it('reads a clock before the start as the start', () => {
    expect(survivalIntensity(2, -10_000)).toBe(survivalIntensity(2, 0))
  })
})
