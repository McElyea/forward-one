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
