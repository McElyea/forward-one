import { describe, expect, it } from 'vitest'
import type { RacerSnapshot } from '../types'
import {
  RACE_TIME_LIMIT_MS,
  raceClockMs,
  raceElapsedMs,
  raceTimeExpired,
  timeLimitLeaders,
} from './raceRules'

const racer = (
  id: string,
  eliminated = false,
  connected = true,
): RacerSnapshot => ({
  id,
  name: id.toUpperCase(),
  color: 0xffffff,
  progress: 0,
  survivalMs: RACE_TIME_LIMIT_MS,
  eliminated,
  isLocal: id === 'local',
  connected,
})

describe('race timing', () => {
  it('caps preview and hosted races at one minute', () => {
    expect(raceElapsedMs('multiplayer-preview', 72_000)).toBe(RACE_TIME_LIMIT_MS)
    expect(raceElapsedMs('multiplayer', 72_000)).toBe(RACE_TIME_LIMIT_MS)
    expect(raceTimeExpired('multiplayer', 59_999)).toBe(false)
    expect(raceTimeExpired('multiplayer', 60_000)).toBe(true)
  })

  it('leaves solo survival open-ended', () => {
    expect(raceElapsedMs('solo', 72_000)).toBe(72_000)
    expect(raceClockMs('solo', 72_000)).toBe(72_000)
    expect(raceTimeExpired('solo', 600_000)).toBe(false)
  })

  it('counts down to zero in a race', () => {
    expect(raceClockMs('multiplayer', 0)).toBe(60_000)
    expect(raceClockMs('multiplayer', 45_250)).toBe(14_750)
    expect(raceClockMs('multiplayer', 72_000)).toBe(0)
  })

  it('treats connected survivors as the time-limit leaders', () => {
    expect(timeLimitLeaders([
      racer('local'),
      racer('maya'),
      racer('eli', true),
      racer('jo', false, false),
    ]).map(({ id }) => id)).toEqual(['local', 'maya'])
  })
})
