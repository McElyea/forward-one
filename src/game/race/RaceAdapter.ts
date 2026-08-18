import type { RacerSnapshot, StrokeJudgment } from '../types'

/**
 * Multiplayer lives behind this boundary. The Phaser scene never needs to know
 * whether snapshots came from local simulation or a realtime WebSocket room.
 */
export interface RaceAdapter {
  readonly kind: 'solo' | 'multiplayer-preview'
  start(survivalBaselineMs: number): void
  recordStroke(judgment: StrokeJudgment): void
  update(
    elapsedMs: number,
    localProgress: number,
    localEliminated?: boolean,
  ): RacerSnapshot[]
  destroy(): void
}
