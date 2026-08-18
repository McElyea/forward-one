import { describe, expect, it } from 'vitest'
import { LEVELS, getLevel } from './levels'

describe('getLevel', () => {
  it('returns the level carrying the requested id', () => {
    expect(getLevel('class-iv')).toBe(LEVELS[2])
    expect(getLevel('class-iv').name).toBe('The Narrows')
  })

  it('resolves every authored level by its own id', () => {
    for (const level of LEVELS) {
      expect(getLevel(level.id)).toBe(level)
    }
  })

  it('falls back to the warm-up run for an unrecognized id', () => {
    // Load-bearing: RiverScene.init() passes `data.levelId ?? 'class-ii'`, so a
    // scene started without level data lands here rather than crashing.
    expect(getLevel('class-vi')).toBe(LEVELS[0])
    expect(getLevel('')).toBe(LEVELS[0])
    expect(LEVELS[0].id).toBe('class-ii')
  })
})

describe('LEVELS', () => {
  it('gives every level a unique id', () => {
    const ids = LEVELS.map((level) => level.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('orders every level\'s cues by ascending start time', () => {
    for (const level of LEVELS) {
      const times = level.cues.map((cue) => cue.at)

      expect(times).toEqual([...times].sort((a, b) => a - b))
    }
  })

  it('keeps every pattern cue inside the survival benchmark window', () => {
    for (const level of LEVELS) {
      for (const cue of level.cues) {
        expect(cue.at).toBeLessThan(level.survivalBenchmarkMs)
      }
    }
  })

  it('lands every pattern stroke inside the survival benchmark window', () => {
    // The benchmark scales simulated rival eliminations. Keeping the whole
    // authored pattern inside it makes every selected class start coherently.
    for (const level of LEVELS) {
      for (const cue of level.cues) {
        const interval = cue.interval ?? 560
        const lastStrokeAt = cue.at + (cue.strokes - 1) * interval

        expect(lastStrokeAt).toBeLessThan(level.survivalBenchmarkMs)
      }
    }
  })

  it('gives every level a six-digit hex accent', () => {
    for (const level of LEVELS) {
      expect(level.accent).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
