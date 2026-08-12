import type { RacerSnapshot, StrokeJudgment } from '../types'

/**
 * Multiplayer lives behind this boundary. The Phaser scene never needs to know
 * whether snapshots came from local simulation or a realtime WebSocket room.
 */
export interface RaceAdapter {
  readonly kind: 'solo' | 'multiplayer-preview'
  start(durationMs: number): void
  recordStroke(judgment: StrokeJudgment): void
  update(elapsedMs: number, localProgress: number): RacerSnapshot[]
  destroy(): void
}
