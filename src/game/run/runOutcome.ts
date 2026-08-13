/**
 * Why a run ended, or that it has not.
 *
 * `finished` means the raft reached the take-out: accumulated progress hit 1.
 * `timed-out` means the river ran out first — the clock passed the level's
 * authored duration while progress was still short. Both end the run; they read
 * differently to the player, so the scene keeps them apart.
 */
export type RunOutcome = 'running' | 'finished' | 'timed-out'

/**
 * Decide whether a run is over.
 *
 * Progress is elapsed time (capped below 1) plus timing rewards, so a player
 * who cannot earn the remaining gain would otherwise paddle forever. The
 * duration check is the terminal condition that does not depend on skill.
 * Reaching the take-out wins the tie: a run that completes on its final stroke
 * has finished, not timed out.
 */
export function runOutcome(
  progress: number,
  elapsedMs: number,
  durationMs: number,
): RunOutcome {
  if (progress >= 1) return 'finished'
  if (elapsedMs >= durationMs) return 'timed-out'
  return 'running'
}
