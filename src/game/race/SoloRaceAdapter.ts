import type { RacerSnapshot, StrokeJudgment } from '../types'
import type { RaceAdapter } from './RaceAdapter'

export class SoloRaceAdapter implements RaceAdapter {
  readonly kind = 'solo' as const

  start(): void {}

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
        color: 0xffc857,
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
