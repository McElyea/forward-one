import { HIT_WINDOW_MS } from '../rhythm/RhythmEngine'
import type {
  LevelConfig,
  PaddleCue,
  RapidClass,
  StrokeJudgment,
  StrokeRating,
} from '../types'

export type ObstacleKind = 'rock' | 'strainer' | 'current' | 'rapid'

export type RiverState = 'aboard' | 'overboard' | 'swept-away'

export type SurvivalTransitionType =
  | 'impact'
  | 'ejected'
  | 'recovery-progress'
  | 'drifted'
  | 'recovered'
  | 'swept-away'

export interface ObstacleEvent {
  cueIndex: number
  cue: PaddleCue
  obstacle: ObstacleKind
  resolveAt: number
}

export interface SurvivalTransition {
  type: SurvivalTransitionType
  event: ObstacleEvent
}

export interface SurvivalSnapshot {
  state: RiverState
  stability: number
  recovery: number
  drift: number
  intensity: number
}

const MAX_STABILITY = 3
const RECOVERY_CALLS = 2
const MAX_DRIFT = 2
const DEFAULT_INTERVAL_MS = 560
const MIN_INTERVAL_MS = 280
const MIN_RECOVERY_GAP_MS = 620

const OBSTACLE_SEQUENCE: ObstacleKind[] = [
  'rock',
  'current',
  'strainer',
  'rapid',
]

const SUCCESS_RATINGS = new Set<StrokeRating>([
  'perfect',
  'good',
  'early',
  'late',
])

const round = (value: number): number => Math.round(value)

export function survivalIntensity(rapidClass: RapidClass, elapsedMs: number): number {
  const startingIntensity = 1 + (rapidClass - 2) * 0.14
  const timePressure = Math.max(0, elapsedMs) * (0.65 / 75_000)
  return Math.min(3.2, startingIntensity + timePressure)
}

/**
 * Owns the endless, framework-independent part of a river run.
 *
 * The selected level's calls are treated as a pattern instead of a finite
 * course. Each pass tightens the gaps and stroke intervals as survival time
 * rises. Missing an obstacle call costs raft stability; after ejection, two
 * successful calls reach the raft while two failed calls sweep the player away.
 */
export class SurvivalEngine {
  readonly events: ObstacleEvent[] = []

  private readonly rapidClass: RapidClass
  private readonly templates: PaddleCue[]
  private readonly averageAuthoredGap: number
  private readonly ratingsByCue = new Map<number, Map<number, StrokeRating>>()
  private readonly resolvedCues = new Set<number>()
  private nextTemplateIndex = 0
  private nextEventAt: number
  private state: RiverState = 'aboard'
  private stability = MAX_STABILITY
  private recovery = 0
  private drift = 0

  constructor(level: Pick<LevelConfig, 'rapidClass' | 'cues'>) {
    if (level.cues.length === 0) {
      throw new Error('A survival run needs at least one guide call')
    }

    this.rapidClass = level.rapidClass
    this.templates = level.cues
    this.averageAuthoredGap = this.getAverageAuthoredGap()
    this.nextEventAt = Math.max(
      1_800,
      round(this.templates[0].at / survivalIntensity(this.rapidClass, 0)),
    )
  }

  ensureScheduledThrough(elapsedMs: number): ObstacleEvent[] {
    const added: ObstacleEvent[] = []

    while (this.nextEventAt <= elapsedMs) {
      const template = this.templates[this.nextTemplateIndex]
      const cueIndex = this.events.length
      const intensity = survivalIntensity(this.rapidClass, this.nextEventAt)
      const interval = Math.max(
        MIN_INTERVAL_MS,
        round((template.interval ?? DEFAULT_INTERVAL_MS) / Math.sqrt(intensity)),
      )
      const cue: PaddleCue = {
        at: round(this.nextEventAt),
        direction: template.direction,
        strokes: template.strokes,
        interval,
      }
      const resolveAt = cue.at + (cue.strokes - 1) * interval + HIT_WINDOW_MS
      const event: ObstacleEvent = {
        cueIndex,
        cue,
        obstacle: OBSTACLE_SEQUENCE[(cueIndex + this.rapidClass) % OBSTACLE_SEQUENCE.length],
        resolveAt,
      }

      this.events.push(event)
      added.push(event)

      const nextTemplateIndex = (this.nextTemplateIndex + 1) % this.templates.length
      const authoredGap = nextTemplateIndex === 0
        ? this.averageAuthoredGap
        : this.templates[nextTemplateIndex].at - template.at
      const callDuration = (cue.strokes - 1) * interval
      const cadence = Math.max(
        callDuration + MIN_RECOVERY_GAP_MS,
        round(authoredGap / intensity),
      )

      this.nextEventAt += cadence
      this.nextTemplateIndex = nextTemplateIndex
    }

    return added
  }

  recordJudgment(judgment: StrokeJudgment): void {
    const target = judgment.target
    if (!target || this.resolvedCues.has(target.cueIndex)) return

    let ratings = this.ratingsByCue.get(target.cueIndex)
    if (!ratings) {
      ratings = new Map<number, StrokeRating>()
      this.ratingsByCue.set(target.cueIndex, ratings)
    }
    ratings.set(target.strokeIndex, judgment.rating)
  }

  resolveThrough(elapsedMs: number): SurvivalTransition[] {
    const transitions: SurvivalTransition[] = []

    for (const event of this.events) {
      const ratings = this.ratingsByCue.get(event.cueIndex)
      const cueRatings = Array.from(
        { length: event.cue.strokes },
        (_, strokeIndex) => ratings?.get(strokeIndex),
      )
      const fullyJudged = cueRatings.every((rating) => rating !== undefined)

      if (
        this.resolvedCues.has(event.cueIndex) ||
        (!fullyJudged && event.resolveAt >= elapsedMs)
      ) {
        continue
      }

      this.resolvedCues.add(event.cueIndex)
      const succeeded = cueRatings.every(
        (rating) => rating !== undefined && SUCCESS_RATINGS.has(rating),
      )

      const transition = this.applyOutcome(event, succeeded)
      if (transition) transitions.push(transition)
      if (this.state === 'swept-away') break
    }

    return transitions
  }

  getCurrentCall(elapsedMs: number, leadTimeMs = 1_500): ObstacleEvent | undefined {
    return this.events.find(
      (event) =>
        !this.resolvedCues.has(event.cueIndex) &&
        elapsedMs >= event.cue.at - leadTimeMs &&
        elapsedMs <= event.resolveAt,
    )
  }

  getVisibleEvents(
    elapsedMs: number,
    lookAheadMs = 2_800,
    passedWindowMs = 700,
  ): ObstacleEvent[] {
    return this.events.filter(
      (event) =>
        !this.resolvedCues.has(event.cueIndex) &&
        event.cue.at >= elapsedMs - passedWindowMs &&
        event.cue.at <= elapsedMs + lookAheadMs,
    )
  }

  getSnapshot(elapsedMs: number): SurvivalSnapshot {
    return {
      state: this.state,
      stability: this.stability,
      recovery: this.recovery,
      drift: this.drift,
      intensity: survivalIntensity(this.rapidClass, elapsedMs),
    }
  }

  private getAverageAuthoredGap(): number {
    if (this.templates.length === 1) return 3_000

    let total = 0
    for (let index = 1; index < this.templates.length; index += 1) {
      total += this.templates[index].at - this.templates[index - 1].at
    }
    return total / (this.templates.length - 1)
  }

  private applyOutcome(
    event: ObstacleEvent,
    succeeded: boolean,
  ): SurvivalTransition | undefined {
    if (this.state === 'swept-away') return undefined

    if (this.state === 'aboard') {
      if (succeeded) {
        this.stability = Math.min(MAX_STABILITY, this.stability + 1)
        return undefined
      }

      this.stability -= 1
      if (this.stability > 0) return { type: 'impact', event }

      this.state = 'overboard'
      this.recovery = 0
      this.drift = 0
      return { type: 'ejected', event }
    }

    if (succeeded) {
      this.recovery += 1
      this.drift = 0
      if (this.recovery < RECOVERY_CALLS) {
        return { type: 'recovery-progress', event }
      }

      this.state = 'aboard'
      this.stability = MAX_STABILITY - 1
      this.recovery = 0
      return { type: 'recovered', event }
    }

    this.recovery = 0
    this.drift += 1
    if (this.drift < MAX_DRIFT) return { type: 'drifted', event }

    this.state = 'swept-away'
    return { type: 'swept-away', event }
  }
}
