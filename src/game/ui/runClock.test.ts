import { describe, expect, it } from 'vitest'
import { formatRunClock } from './runClock'

describe('formatRunClock', () => {
  it('starts at zero in the shape it will keep', () => {
    expect(formatRunClock(0)).toBe('0:00.00')
  })

  it('keeps centiseconds under a second', () => {
    expect(formatRunClock(990)).toBe('0:00.99')
    expect(formatRunClock(5_990)).toBe('0:05.99')
  })

  it('rolls into minutes rather than counting past 59 seconds', () => {
    expect(formatRunClock(59_990)).toBe('0:59.99')
    expect(formatRunClock(60_000)).toBe('1:00.00')
    expect(formatRunClock(127_430)).toBe('2:07.43')
  })

  it('lets a long survival run keep counting in minutes', () => {
    expect(formatRunClock(600_000)).toBe('10:00.00')
    expect(formatRunClock(3_723_450)).toBe('62:03.45')
  })

  it('never shows a seconds field a clock could not', () => {
    for (let elapsed = 0; elapsed <= 240_000; elapsed += 137) {
      const seconds = Number(formatRunClock(elapsed).split(':')[1]?.split('.')[0])

      expect(seconds, `seconds field out of range at ${elapsed}ms`).toBeLessThan(60)
    }
  })

  it('truncates rather than rounds, so the clock never shows time not yet elapsed', () => {
    expect(formatRunClock(59_999)).toBe('0:59.99')
    expect(formatRunClock(9)).toBe('0:00.00')
  })

  it('reads a pre-start offset as zero instead of a negative clock', () => {
    expect(formatRunClock(-2_400)).toBe('0:00.00')
    expect(formatRunClock(Number.NaN)).toBe('0:00.00')
  })
})
