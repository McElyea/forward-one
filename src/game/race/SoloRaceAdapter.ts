import type { RacerSnapshot, StrokeJudgment } from '../types'
import { RACER_COLORS } from '../ui/theme'
import type { RaceAdapter } from './RaceAdapter'

export class SoloRaceAdapter implements RaceAdapter {
  readonly kind = 'solo' as const

  start(): { countdownMs: number } {
    return { countdownMs: 2_400 }
  }

  recordStroke(_judgment: StrokeJudgment): void {}

  update(
    elapsedMs: number,
    localProgress: number,
    localEliminated = false,
  ): RacerSnapshot[] {
    return [
      {
        id: 'local',
        name: 'YOU',
        color: RACER_COLORS[0],
        progress: localProgress,
        survivalMs: elapsedMs,
        eliminated: localEliminated,
        isLocal: true,
        connected: true,
      },
    ]
  }

  destroy(): void {}
}
