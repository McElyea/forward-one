import { describe, expect, it } from 'vitest'
import { HIT_WINDOW_MS, RhythmEngine } from './RhythmEngine'

describe('RhythmEngine', () => {
  it('expands a guide call into individual stroke targets', () => {
    const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 3, interval: 500 }])

    expect(rhythm.targets.map((target) => target.targetTime)).toEqual([1_000, 1_500, 2_000])
    expect(rhythm.targets.every((target) => target.direction === 'forward')).toBe(true)
  })

  it('grades strokes by their timing offset', () => {
    const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 2 }])

    expect(rhythm.judge(1_045, 'forward').rating).toBe('perfect')
    expect(rhythm.judge(1_680, 'forward').rating).toBe('good')
  })

  it('expires targets outside the hit window', () => {
    const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 1 }])

    const missed = rhythm.expire(1_000 + HIT_WINDOW_MS + 1)

    expect(missed).toHaveLength(1)
    expect(rhythm.getAccuracy()).toBe(0)
  })

  it('does not consume a target for an input outside the timing window', () => {
    const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 1 }])

    expect(rhythm.judge(100, 'forward').target).toBeNull()
    expect(rhythm.targets[0].status).toBe('pending')
  })

  it('consumes a stroke when the player paddles the wrong direction', () => {
    const rhythm = new RhythmEngine([{ at: 1_000, direction: 'backward', strokes: 1 }])

    expect(rhythm.judge(1_000, 'forward').rating).toBe('wrong')
    expect(rhythm.targets[0].status).toBe('wrong')
  })
})
