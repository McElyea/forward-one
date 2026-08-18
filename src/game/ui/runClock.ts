/**
 * The run clock.
 *
 * A run has no finish line — `SurvivalEngine` keeps going until the river wins
 * — so elapsed time routinely passes a minute, and the clock has to stay
 * readable when it does. The HUD used to print seconds and centiseconds into a
 * two-field slot, which read as minutes and seconds: a two-minute run showed as
 * `127:43`, which looks like two hours and inverts what the player is watching
 * climb.
 */

const CENTISECONDS_PER_SECOND = 100
const SECONDS_PER_MINUTE = 60

const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * `M:SS.CC` — minutes unbounded, seconds never above 59.
 *
 * Anything before the start of the run (a negative offset while the countdown
 * is still running) reads as zero rather than as a negative clock.
 */
export function formatRunClock(elapsedMs: number): string {
  const safeMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  const totalCentiseconds = Math.floor(safeMs / 10)
  const totalSeconds = Math.floor(totalCentiseconds / CENTISECONDS_PER_SECOND)

  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
  const seconds = totalSeconds % SECONDS_PER_MINUTE
  const centiseconds = totalCentiseconds % CENTISECONDS_PER_SECOND

  return `${minutes}:${pad(seconds)}.${pad(centiseconds)}`
}
