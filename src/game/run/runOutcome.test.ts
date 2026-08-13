import { describe, expect, it } from 'vitest'
import { LEVELS } from '../levels'
import { runOutcome } from './runOutcome'

const DURATION_MS = 38_000

describe('runOutcome', () => {
  it('keeps a run going while there is progress left and river left', () => {
    expect(runOutcome(0, 0, DURATION_MS)).toBe('running')
    expect(runOutcome(0.5, DURATION_MS / 2, DURATION_MS)).toBe('running')
    expect(runOutcome(0.99, DURATION_MS - 1, DURATION_MS)).toBe('running')
  })

  it('finishes the moment progress reaches the take-out', () => {
    expect(runOutcome(1, 12_000, DURATION_MS)).toBe('finished')
    expect(runOutcome(1.2, 12_000, DURATION_MS)).toBe('finished')
  })

  it('ends a run that reaches the level duration short of the take-out', () => {
    expect(runOutcome(0.78, DURATION_MS, DURATION_MS)).toBe('timed-out')
    expect(runOutcome(0.78, DURATION_MS + 5_000, DURATION_MS)).toBe('timed-out')
  })

  it('ends a run in which the player never lands a stroke', () => {
    // The regression this exists for. Elapsed time alone asymptotes at 0.78
    // (RiverScene.updateProgress), so before the duration check this run had no
    // reachable end at all — the clock counted past the level forever.
    const noPaddleProgress = (elapsed: number): number =>
      Math.min(1, (elapsed / DURATION_MS) * 0.78)

    expect(runOutcome(noPaddleProgress(DURATION_MS - 1), DURATION_MS - 1, DURATION_MS)).toBe(
      'running',
    )
    expect(runOutcome(noPaddleProgress(DURATION_MS), DURATION_MS, DURATION_MS)).toBe('timed-out')
  })

  it('ends a run of nothing but early and late strokes on every authored level', () => {
    // 0.007 per early/late stroke: the band that could not reach the remaining
    // 0.22 on any level in the game, however many cues it hit.
    for (const level of LEVELS) {
      const strokes = level.cues.reduce((sum, cue) => sum + cue.strokes, 0)
      const bestSloppyProgress = Math.min(1, 0.78 + strokes * 0.007)

      expect(bestSloppyProgress).toBeLessThan(1)
      expect(runOutcome(bestSloppyProgress, level.durationMs, level.durationMs)).toBe('timed-out')
    }
  })

  it('prefers the take-out when progress and the clock land together', () => {
    expect(runOutcome(1, DURATION_MS, DURATION_MS)).toBe('finished')
  })
})
