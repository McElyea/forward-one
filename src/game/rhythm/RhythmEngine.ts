import type {
  PaddleDirection,
  PaddleCue,
  StrokeJudgment,
  StrokeRating,
  StrokeTarget,
} from '../types'

const PERFECT_WINDOW_MS = 70
const GOOD_WINDOW_MS = 145
export const HIT_WINDOW_MS = 280

const SCORE_BY_RATING: Record<StrokeRating, number> = {
  perfect: 100,
  good: 75,
  early: 35,
  late: 35,
  wrong: 0,
  miss: 0,
}

export class RhythmEngine {
  readonly targets: StrokeTarget[]

  constructor(cues: PaddleCue[]) {
    this.targets = cues.flatMap((cue, cueIndex) => {
      const interval = cue.interval ?? 560
      return Array.from({ length: cue.strokes }, (_, strokeIndex) => ({
        id: `${cueIndex}-${strokeIndex}`,
        cueIndex,
        strokeIndex,
        direction: cue.direction,
        targetTime: cue.at + strokeIndex * interval,
        status: 'pending' as const,
      }))
    })
  }

  judge(inputTime: number, direction: PaddleDirection): StrokeJudgment {
    const target = this.targets
      .filter((candidate) => candidate.status === 'pending')
      .map((candidate) => ({
        candidate,
        distance: Math.abs(candidate.targetTime - inputTime),
      }))
      .sort((a, b) => a.distance - b.distance)[0]

    if (!target || target.distance > HIT_WINDOW_MS) {
      return { target: null, rating: 'miss', offsetMs: null, points: 0 }
    }

    if (target.candidate.direction !== direction) {
      target.candidate.status = 'wrong'
      return {
        target: target.candidate,
        rating: 'wrong',
        offsetMs: inputTime - target.candidate.targetTime,
        points: 0,
      }
    }

    const offsetMs = inputTime - target.candidate.targetTime
    const absoluteOffset = Math.abs(offsetMs)
    let rating: Exclude<StrokeRating, 'miss'>

    if (absoluteOffset <= PERFECT_WINDOW_MS) {
      rating = 'perfect'
    } else if (absoluteOffset <= GOOD_WINDOW_MS) {
      rating = 'good'
    } else {
      rating = offsetMs < 0 ? 'early' : 'late'
    }

    target.candidate.status = rating
    return {
      target: target.candidate,
      rating,
      offsetMs,
      points: SCORE_BY_RATING[rating],
    }
  }

  expire(currentTime: number): StrokeTarget[] {
    const missed = this.targets.filter(
      (target) =>
        target.status === 'pending' &&
        currentTime > target.targetTime + HIT_WINDOW_MS,
    )

    for (const target of missed) {
      target.status = 'miss'
    }

    return missed
  }

  getVisible(currentTime: number, lookAheadMs = 2_200): StrokeTarget[] {
    return this.targets.filter(
      (target) =>
        target.status === 'pending' &&
        target.targetTime >= currentTime - HIT_WINDOW_MS &&
        target.targetTime <= currentTime + lookAheadMs,
    )
  }

  getAccuracy(): number {
    const judged = this.targets.filter((target) => target.status !== 'pending')
    if (judged.length === 0) return 100

    const earned = judged.reduce(
      (sum, target) => sum + SCORE_BY_RATING[target.status as StrokeRating],
      0,
    )
    return Math.round(earned / judged.length)
  }
}
