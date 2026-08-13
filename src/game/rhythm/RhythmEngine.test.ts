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

  describe('getVisible', () => {
    it('shows a target that is still one full hit window behind the playhead', () => {
      const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 1 }])

      expect(rhythm.getVisible(1_000 + HIT_WINDOW_MS)).toHaveLength(1)
      expect(rhythm.getVisible(1_000 + HIT_WINDOW_MS + 1)).toHaveLength(0)
    })

    it('shows a target sitting exactly on the look-ahead edge', () => {
      const rhythm = new RhythmEngine([{ at: 2_200, direction: 'forward', strokes: 1 }])

      expect(rhythm.getVisible(0)).toHaveLength(1)
      expect(rhythm.getVisible(-1)).toHaveLength(0)
    })

    it('honours a narrower look-ahead than the 2 200 ms default', () => {
      const rhythm = new RhythmEngine([{ at: 2_000, direction: 'forward', strokes: 1 }])

      expect(rhythm.getVisible(0)).toHaveLength(1)
      expect(rhythm.getVisible(0, 1_000)).toHaveLength(0)
    })

    it('drops a target as soon as it has been judged', () => {
      const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 1 }])
      expect(rhythm.getVisible(900)).toHaveLength(1)

      rhythm.judge(1_000, 'forward')

      expect(rhythm.getVisible(900)).toHaveLength(0)
    })

    it('drops a target that has already expired into a miss', () => {
      const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 1 }])

      rhythm.expire(1_000 + HIT_WINDOW_MS + 1)

      expect(rhythm.getVisible(1_000)).toHaveLength(0)
    })

    it('returns the targets inside the window in authored order', () => {
      const rhythm = new RhythmEngine([
        { at: 1_000, direction: 'forward', strokes: 3, interval: 500 },
        { at: 6_000, direction: 'backward', strokes: 1 },
      ])

      expect(rhythm.getVisible(1_200).map((target) => target.targetTime)).toEqual([
        1_000, 1_500, 2_000,
      ])
    })
  })
})
