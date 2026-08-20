import type { RacerSnapshot, StrokeJudgment } from '../types'

/**
 * Multiplayer lives behind this boundary. The Phaser scene never needs to know
 * whether snapshots came from local simulation or a realtime WebSocket room.
 */
export interface RaceAdapter {
  readonly kind: 'solo' | 'multiplayer-preview' | 'multiplayer'
  /** Returns how long the scene should count down before local elapsed time begins. */
  start(survivalBaselineMs: number): { countdownMs: number }
  recordStroke(judgment: StrokeJudgment): void
  update(
    elapsedMs: number,
    localProgress: number,
    localEliminated?: boolean,
  ): RacerSnapshot[]
  destroy(): void
}
