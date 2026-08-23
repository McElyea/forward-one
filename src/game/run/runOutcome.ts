import type { RaceMode, RacerSnapshot } from '../types'
import { timeLimitLeaders } from '../race/raceRules'

/**
 * What a finished run says to the player.
 *
 * The wording was assembled inline in `RiverScene.finishRace()`, where nothing
 * could check that a solo run never claims a place, that a race always names
 * one, or that the heading and the blurb agree with each other.
 */

const PLACE_NAMES = ['FIRST', 'SECOND', 'THIRD', 'FOURTH'] as const

export interface RunOutcome {
  /** 1-based finishing position; always 1 in a solo run. */
  place: number
  placeLabel: string
  heading: string
  blurb: string
}

/**
 * Where the local racer finished, counting from 1.
 *
 * A ranking without the local boat — nothing registered it before the run
 * ended — reads as the lead rather than as position zero.
 */
export function placeOfLocal(ranked: RacerSnapshot[]): number {
  return Math.max(1, ranked.findIndex((racer) => racer.isLocal) + 1)
}

/**
 * The place as the summary screen says it. The first four are spelled out to
 * preserve the original presentation; larger rooms use numeric ordinals.
 */
export function placeLabel(place: number): string {
  const namedPlace = PLACE_NAMES[place - 1]
  if (namedPlace) return namedPlace

  const lastTwo = place % 100
  const suffix = lastTwo >= 11 && lastTwo <= 13
    ? 'TH'
    : ({ 1: 'ST', 2: 'ND', 3: 'RD' } as Record<number, string>)[place % 10] ?? 'TH'
  return `${place}${suffix}`
}

export function runOutcome(
  mode: RaceMode,
  place: number,
  elapsedMs: number,
  levelName: string,
): RunOutcome {
  const label = placeLabel(place)
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1000)

  return {
    place,
    placeLabel: label,
    heading: mode === 'solo' ? 'SWEPT AWAY' : `${label} PLACE`,
    blurb: mode === 'solo'
      ? `You survived ${seconds} seconds on ${levelName}. Read each obstacle and hold the line longer next run.`
      : `${label} after ${seconds} seconds on ${levelName}. The last paddler in the water wins.`,
  }
}

export function timeLimitOutcome(
  racers: RacerSnapshot[],
  elapsedMs: number,
  levelName: string,
): RunOutcome {
  const leaders = timeLimitLeaders(racers)
  const localIsLeader = leaders.some((racer) => racer.isLocal)
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1000)

  if (localIsLeader && leaders.length > 1) {
    return {
      place: 1,
      placeLabel: 'TIED',
      heading: 'TIE FOR FIRST',
      blurb: `Time expired after ${seconds} seconds on ${levelName}. ${leaders.length} paddlers were still afloat, so the race is a tie.`,
    }
  }

  if (localIsLeader) {
    return {
      place: 1,
      placeLabel: 'FIRST',
      heading: 'YOU WIN',
      blurb: `Time expired after ${seconds} seconds on ${levelName}. You were the only paddler still afloat.`,
    }
  }

  const ranked = [...racers].sort((a, b) => b.survivalMs - a.survivalMs)
  return runOutcome('multiplayer', placeOfLocal(ranked), elapsedMs, levelName)
}
