import type { RacerSnapshot, StrokeJudgment } from '../types'
import type { RaceAdapter } from './RaceAdapter'

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

const RIVAL_SURVIVAL_MULTIPLIER = {
  maya: 2.15,
  eli: 1.65,
  jo: 1.3,
}

const RAIL_SPAN_MULTIPLIER = 2.25

/**
 * Stand-in for the future Supabase adapter. It exercises the exact snapshots
 * and survival rail that live multiplayer will use, without needing credentials.
 */
export class SimulatedRaceAdapter implements RaceAdapter {
  readonly kind = 'multiplayer-preview' as const
  private survivalBaselineMs = 38_000

  start(survivalBaselineMs: number): void {
    this.survivalBaselineMs = survivalBaselineMs
  }

  recordStroke(_judgment: StrokeJudgment): void {}

  update(
    elapsedMs: number,
    localProgress: number,
    localEliminated = false,
  ): RacerSnapshot[] {
    const railSpanMs = this.survivalBaselineMs * RAIL_SPAN_MULTIPLIER
    const rival = (
      id: keyof typeof RIVAL_SURVIVAL_MULTIPLIER,
      name: string,
      color: number,
    ): RacerSnapshot => {
      const survivalLimitMs = this.survivalBaselineMs * RIVAL_SURVIVAL_MULTIPLIER[id]
      const survivalMs = Math.min(elapsedMs, survivalLimitMs)
      return {
        id,
        name,
        color,
        progress: clamp(survivalMs / railSpanMs),
        survivalMs,
        eliminated: elapsedMs >= survivalLimitMs,
        isLocal: false,
        connected: true,
      }
    }

    return [
      {
        id: 'local',
        name: 'YOU',
        color: 0xffc857,
        progress: localProgress,
        survivalMs: elapsedMs,
        eliminated: localEliminated,
        isLocal: true,
        connected: true,
      },
      rival('maya', 'MAYA', 0x56d6c9),
      rival('eli', 'ELI', 0xef6f9f),
      rival('jo', 'JO', 0xb695ff),
    ]
  }

  destroy(): void {}
}
