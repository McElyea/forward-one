import { describe, expect, it } from 'vitest'
import type { PaddleDirection } from '../types'
import { HIT_WINDOW_MS, RhythmEngine } from './RhythmEngine'

describe('RhythmEngine', () => {
  it('expands a guide call into individual stroke targets', () => {
    const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 3, interval: 500 }])

    expect(rhythm.targets.map((target) => target.targetTime)).toEqual([1_000, 1_500, 2_000])
    expect(rhythm.targets.every((target) => target.direction === 'forward')).toBe(true)
  })

  it('appends generated calls without reusing cue or target ids', () => {
    const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 1 }])

    expect(rhythm.addCue({ at: 2_000, direction: 'backward', strokes: 2 })).toBe(1)
    expect(rhythm.targets.map((target) => target.id)).toEqual(['0-0', '1-0', '1-1'])
    expect(rhythm.targets.map((target) => target.targetTime)).toEqual([1_000, 2_000, 2_560])
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

  describe('judge', () => {
    /** Judges one stroke against a fresh, single forward call at 1 000 ms. */
    const judgeSingle = (inputTime: number, direction: PaddleDirection = 'forward') =>
      new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 1 }]).judge(
        inputTime,
        direction,
      )

    it('keeps a stroke perfect up to and including 70 ms either side', () => {
      expect(judgeSingle(1_070).rating).toBe('perfect')
      expect(judgeSingle(930).rating).toBe('perfect')
      expect(judgeSingle(1_071).rating).toBe('good')
      expect(judgeSingle(929).rating).toBe('good')
    })

    it('keeps a stroke good up to and including 145 ms either side', () => {
      expect(judgeSingle(1_145).rating).toBe('good')
      expect(judgeSingle(855).rating).toBe('good')
      expect(judgeSingle(1_146).rating).toBe('late')
      expect(judgeSingle(854).rating).toBe('early')
    })

    it('rates a stroke beyond the good window by which side of the call it fell', () => {
      expect(judgeSingle(800)).toMatchObject({ rating: 'early', offsetMs: -200 })
      expect(judgeSingle(1_200)).toMatchObject({ rating: 'late', offsetMs: 200 })
    })

    it('still hits on the hit-window edge and misses one millisecond past it', () => {
      expect(judgeSingle(1_000 + HIT_WINDOW_MS).rating).toBe('late')
      expect(judgeSingle(1_000 - HIT_WINDOW_MS).rating).toBe('early')
      expect(judgeSingle(1_000 + HIT_WINDOW_MS + 1).rating).toBe('miss')
      expect(judgeSingle(1_000 - HIT_WINDOW_MS - 1).rating).toBe('miss')
    })

    it('scores each rating', () => {
      expect(judgeSingle(1_000).points, 'perfect').toBe(100)
      expect(judgeSingle(1_100).points, 'good').toBe(75)
      expect(judgeSingle(800).points, 'early').toBe(35)
      expect(judgeSingle(1_200).points, 'late').toBe(35)
      expect(judgeSingle(1_000, 'backward').points, 'wrong').toBe(0)
      expect(judgeSingle(5_000).points, 'miss').toBe(0)
    })

    it('reports the signed offset of a hit', () => {
      expect(judgeSingle(1_045).offsetMs).toBe(45)
      expect(judgeSingle(960).offsetMs).toBe(-40)
    })

    it('reports a miss with no target and no offset', () => {
      expect(judgeSingle(5_000)).toEqual({ target: null, rating: 'miss', offsetMs: null, points: 0 })
    })

    it('reports the offset of a wrong-direction stroke however close it landed', () => {
      expect(judgeSingle(1_010, 'backward')).toMatchObject({ rating: 'wrong', offsetMs: 10 })
    })

    it('treats a wrong-direction stroke outside the hit window as a miss and leaves the target', () => {
      const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 1 }])

      expect(rhythm.judge(1_000 + HIT_WINDOW_MS + 1, 'backward').rating).toBe('miss')
      expect(rhythm.targets[0].status).toBe('pending')
    })

    it('judges against the nearest pending target', () => {
      const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 2, interval: 400 }])

      expect(rhythm.judge(1_250, 'forward').target?.id).toBe('0-1')
      expect(rhythm.targets.map((target) => target.status)).toEqual(['pending', 'early'])
    })

    it('skips a target that has already been judged, even when it is nearer', () => {
      const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 2, interval: 400 }])
      rhythm.judge(1_000, 'forward')

      // 150 ms from the judged first stroke, 250 ms from the pending second one
      const second = rhythm.judge(1_150, 'forward')

      expect(second.target?.id).toBe('0-1')
      expect(second).toMatchObject({ rating: 'early', offsetMs: -250 })
    })

    it('records the rating on the target it consumed', () => {
      const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 1 }])

      rhythm.judge(1_100, 'forward')

      expect(rhythm.targets[0].status).toBe('good')
    })
  })

  describe('expire', () => {
    it('leaves a target still sitting exactly on the hit-window edge', () => {
      const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 1 }])

      expect(rhythm.expire(1_000 + HIT_WINDOW_MS)).toEqual([])
      expect(rhythm.targets[0].status).toBe('pending')
    })

    it('marks every newly passed target as missed and returns only those', () => {
      const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 3, interval: 500 }])

      const missed = rhythm.expire(1_500 + HIT_WINDOW_MS + 1)

      expect(missed.map((target) => target.id)).toEqual(['0-0', '0-1'])
      expect(rhythm.targets.map((target) => target.status)).toEqual(['miss', 'miss', 'pending'])
    })

    it('does not overwrite a judged target or report an expired one twice', () => {
      const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 2, interval: 500 }])
      rhythm.judge(1_000, 'forward')
      rhythm.expire(1_500 + HIT_WINDOW_MS + 1)

      expect(rhythm.expire(10_000)).toEqual([])
      expect(rhythm.targets.map((target) => target.status)).toEqual(['perfect', 'miss'])
    })
  })

  describe('getAccuracy', () => {
    it('reads 100 before anything has been judged', () => {
      expect(new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 2 }]).getAccuracy()).toBe(100)
      expect(new RhythmEngine([]).getAccuracy()).toBe(100)
    })

    it('averages only the judged targets, rounded to a whole number', () => {
      const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 3, interval: 1_000 }])
      rhythm.judge(1_000, 'forward')
      rhythm.judge(1_800, 'forward')

      // perfect (100) + early (35) over two judged targets; the third is still pending
      expect(rhythm.getAccuracy()).toBe(68)
    })

    it('counts a wrong-direction stroke as zero', () => {
      const rhythm = new RhythmEngine([{ at: 1_000, direction: 'forward', strokes: 2, interval: 1_000 }])
      rhythm.judge(1_000, 'forward')
      rhythm.judge(2_000, 'backward')

      expect(rhythm.getAccuracy()).toBe(50)
    })
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
