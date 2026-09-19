import { describe, expect, it } from 'vitest'
import {
  countdownBanner,
  nextStreak,
  runSummaryLine,
  statsLine,
  strokeFeedback,
  survivalStatusLine,
  transitionFeedback,
} from './runHud'
import {
  MAX_STABILITY,
  RECOVERY_CALLS,
  type ObstacleEvent,
  type SurvivalSnapshot,
  type SurvivalTransitionType,
} from '../survival/SurvivalEngine'
import type { StrokeJudgment, StrokeRating, StrokeTarget } from '../types'

const target: StrokeTarget = {
  id: 'cue-0-0',
  cueIndex: 0,
  strokeIndex: 0,
  direction: 'forward',
  targetTime: 2_000,
  status: 'pending',
}

const judgment = (overrides: Partial<StrokeJudgment> = {}): StrokeJudgment => ({
  target,
  rating: 'good',
  offsetMs: 40,
  points: 70,
  ...overrides,
})

const snapshot = (overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot => ({
  state: 'aboard',
  stability: 3,
  recovery: 0,
  drift: 0,
  intensity: 1,
  ...overrides,
})

const event: ObstacleEvent = {
  cueIndex: 4,
  cue: { at: 9_000, direction: 'backward', strokes: 2, interval: 500 },
  obstacle: 'strainer',
  resolveAt: 9_700,
  collisionAt: 10_500,
}

const transition = (type: SurvivalTransitionType) => ({ type, event })

describe('countdownBanner', () => {
  it('rounds the time left up, so the count never shows zero while the clock is still ahead', () => {
    expect(countdownBanner(2_001).headline).toBe('3')
    expect(countdownBanner(2_000).headline).toBe('2')
    expect(countdownBanner(1).headline).toBe('1')
  })

  it('says GO! once nothing is left to count', () => {
    expect(countdownBanner(0).headline).toBe('GO!')
    expect(countdownBanner(-250).headline).toBe('GO!')
  })

  it('keeps the shared-start caption under every count', () => {
    expect(countdownBanner(3_000).subtext).toBe('THE CLOCK STARTS TOGETHER')
    expect(countdownBanner(0).subtext).toBe('THE CLOCK STARTS TOGETHER')
  })
})

describe('statsLine', () => {
  it('spells the labels out where the top bar is wide enough', () => {
    expect(statsLine(97, 860, true)).toBe('ACCURACY 97%   SCORE 860')
  })

  it('drops to the two numbers and a slash on a narrow bar', () => {
    expect(statsLine(97, 860, false)).toBe('97%  /  860')
  })

  it('groups the thousands in the score either way', () => {
    const grouped = (12_345).toLocaleString()

    expect(statsLine(100, 12_345, true)).toBe(`ACCURACY 100%   SCORE ${grouped}`)
    expect(statsLine(100, 12_345, false)).toBe(`100%  /  ${grouped}`)
  })
})

describe('survivalStatusLine', () => {
  it('reports hit points against the raft maximum and the flow to one decimal', () => {
    expect(survivalStatusLine(snapshot({ stability: 2, intensity: 1.36 }), 0)).toBe(
      `RAFT HP 2/${MAX_STABILITY}  •  FLOW 1.4×`,
    )
  })

  it('quotes the same maximum the survival engine enforces', () => {
    expect(survivalStatusLine(snapshot(), 0)).toContain(`/${MAX_STABILITY}`)
  })

  it('adds the streak only once it is worth mentioning', () => {
    expect(survivalStatusLine(snapshot(), 1)).not.toContain('STREAK')
    expect(survivalStatusLine(snapshot(), 2)).toBe(
      `RAFT HP 3/${MAX_STABILITY}  •  FLOW 1.0×  •  STREAK ×2`,
    )
  })

  it('counts a swimmer toward the raft against the calls recovery takes', () => {
    expect(survivalStatusLine(snapshot({ state: 'overboard', recovery: 1 }), 5)).toBe(
      `OVERBOARD  /  1/${RECOVERY_CALLS} TO RAFT`,
    )
  })

  it('does not mention hit points or a streak to a swimmer', () => {
    const line = survivalStatusLine(snapshot({ state: 'overboard', stability: 0 }), 4)

    expect(line).not.toContain('HP')
    expect(line).not.toContain('STREAK')
  })

  it('says only that the river won once it has', () => {
    expect(survivalStatusLine(snapshot({ state: 'swept-away' }), 9)).toBe('SWEPT AWAY')
  })
})

describe('strokeFeedback', () => {
  it('shouts the rating in capitals and keeps it for the colour', () => {
    const ratings: StrokeRating[] = ['perfect', 'good', 'early', 'late', 'miss']

    for (const rating of ratings) {
      const feedback = strokeFeedback(judgment({ rating }))

      expect(feedback.label).toBe(rating.toUpperCase())
      expect(feedback.rating).toBe(rating)
    }
  })

  it('tells a paddler which way they went wrong', () => {
    expect(strokeFeedback(judgment({ rating: 'wrong', points: 0 }))).toEqual({
      label: 'WRONG WAY',
      rating: 'wrong',
    })
  })
})

describe('nextStreak', () => {
  it('extends the streak on any stroke that scored', () => {
    expect(nextStreak(3, judgment({ rating: 'late', points: 25 }))).toBe(4)
  })

  it('resets on a stroke that scored nothing', () => {
    expect(nextStreak(3, judgment({ rating: 'miss', points: 0 }))).toBe(0)
    expect(nextStreak(3, judgment({ rating: 'wrong', points: 0 }))).toBe(0)
  })

  it('resets on a stroke with no target, whatever it was worth', () => {
    expect(nextStreak(3, judgment({ target: null, points: 70 }))).toBe(0)
  })
})

describe('transitionFeedback', () => {
  it('names the obstacle that hit and the hit points left', () => {
    expect(transitionFeedback(transition('impact'), 2)).toEqual({
      label: `STRAINER HIT  •  HP 2/${MAX_STABILITY}`,
      rating: 'wrong',
    })
  })

  it('reports an ejection as zero hit points, whatever stability is passed', () => {
    expect(transitionFeedback(transition('ejected'), 0)).toEqual({
      label: `RAFT HP 0/${MAX_STABILITY}  •  OVERBOARD`,
      rating: 'wrong',
    })
  })

  it('grades the swim by how it is going', () => {
    expect(transitionFeedback(transition('recovery-progress'), 0)).toEqual({
      label: 'CLOSING ON THE RAFT',
      rating: 'good',
    })
    expect(transitionFeedback(transition('drifted'), 0)).toEqual({
      label: 'RAFT PULLING AWAY',
      rating: 'late',
    })
    expect(transitionFeedback(transition('recovered'), 2)).toEqual({
      label: 'BACK ABOARD',
      rating: 'perfect',
    })
  })

  it('has nothing to flash when the river wins, since the summary takes over', () => {
    expect(transitionFeedback(transition('swept-away'), 0)).toBeUndefined()
  })
})

describe('runSummaryLine', () => {
  it('lays the clock, accuracy and points out on one line', () => {
    expect(runSummaryLine(83_450, 91, 640)).toBe('1:23.45   •   91% ACCURACY   •   640 PTS')
  })

  it('groups the thousands in the points', () => {
    expect(runSummaryLine(0, 100, 12_345)).toBe(
      `0:00.00   •   100% ACCURACY   •   ${(12_345).toLocaleString()} PTS`,
    )
  })
})
