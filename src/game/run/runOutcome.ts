import type { RaceMode, RacerSnapshot } from '../types'

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
 * The place as the summary screen says it. Only four boats ever race, so the
 * numeric fallback is a backstop rather than a display path.
 */
export function placeLabel(place: number): string {
  return PLACE_NAMES[place - 1] ?? `${place}TH`
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
