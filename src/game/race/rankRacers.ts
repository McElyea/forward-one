import type { RacerSnapshot } from '../types'

/** Active racers lead ties; eliminated racers rank by the time they survived. */
export function rankRacers(racers: RacerSnapshot[]): RacerSnapshot[] {
  return [...racers].sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1
    return b.survivalMs - a.survivalMs
  })
}
