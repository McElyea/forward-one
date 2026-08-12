import type { RacerSnapshot, StrokeJudgment } from '../types'
import type { RaceAdapter } from './RaceAdapter'

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

/**
 * Stand-in for the future Supabase adapter. It exercises the exact snapshots
 * and progress rail that live multiplayer will use, without needing credentials.
 */
export class SimulatedRaceAdapter implements RaceAdapter {
  readonly kind = 'multiplayer-preview' as const
  private durationMs = 38_000

  start(durationMs: number): void {
    this.durationMs = durationMs
  }

  recordStroke(_judgment: StrokeJudgment): void {}

  update(elapsedMs: number, localProgress: number): RacerSnapshot[] {
    const raceTime = elapsedMs / this.durationMs
    const surge = Math.sin(elapsedMs / 2_600) * 0.016

    return [
      {
        id: 'local',
        name: 'YOU',
        color: 0xffc857,
        progress: localProgress,
        isLocal: true,
        connected: true,
      },
      {
        id: 'maya',
        name: 'MAYA',
        color: 0x56d6c9,
        progress: clamp(raceTime * 0.93 + surge),
        isLocal: false,
        connected: true,
      },
      {
        id: 'eli',
        name: 'ELI',
        color: 0xef6f9f,
        progress: clamp(raceTime * 0.86 - surge * 0.6),
        isLocal: false,
        connected: true,
      },
      {
        id: 'jo',
        name: 'JO',
        color: 0xb695ff,
        progress: clamp(raceTime * 0.8 + Math.sin(elapsedMs / 1_900) * 0.01),
        isLocal: false,
        connected: true,
      },
    ]
  }

  destroy(): void {}
}
