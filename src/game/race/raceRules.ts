import type { RaceMode, RacerSnapshot } from '../types'

export const RACE_TIME_LIMIT_MS = 60_000

export function raceElapsedMs(mode: RaceMode, elapsedMs: number): number {
  const safeElapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  return mode === 'solo' ? safeElapsed : Math.min(safeElapsed, RACE_TIME_LIMIT_MS)
}

export function raceClockMs(mode: RaceMode, elapsedMs: number): number {
  const runElapsed = raceElapsedMs(mode, elapsedMs)
  return mode === 'solo' ? runElapsed : RACE_TIME_LIMIT_MS - runElapsed
}

export function raceTimeExpired(mode: RaceMode, elapsedMs: number): boolean {
  return mode !== 'solo' && elapsedMs >= RACE_TIME_LIMIT_MS
}

/** Connected paddlers still afloat when time expires share the lead. */
export function timeLimitLeaders(racers: RacerSnapshot[]): RacerSnapshot[] {
  return racers.filter((racer) => racer.connected && !racer.eliminated)
}
