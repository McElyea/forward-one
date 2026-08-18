import type { ObstacleKind, RiverState } from '../survival/SurvivalEngine'
import type { PaddleDirection } from '../types'

/**
 * What the banner over the river says.
 *
 * The wording was assembled inline in `RiverScene.updateCue()` across four
 * branches — call or no call, aboard or overboard — where the one thing worth
 * checking could not be: that a swimmer is always told to swim, and a paddler
 * is always told what is coming.
 */

const OBSTACLE_LABEL: Record<ObstacleKind, string> = {
  rock: 'ROCK',
  strainer: 'STRAINER',
  current: 'CROSS-CURRENT',
  rapid: 'WAVE TRAIN',
}

const DIRECTION_LABEL: Record<PaddleDirection, string> = {
  forward: 'FORWARD',
  backward: 'BACKWARDS',
}

/** Which of the two paddle colours the headline takes, or neither. */
export type BannerTone = PaddleDirection | 'waiting'

export interface CallBanner {
  headline: string
  subtext: string
  tone: BannerTone
}

/** The call being made, as far as the banner is concerned. */
export interface BannerCall {
  direction: PaddleDirection
  strokes: number
  obstacle: ObstacleKind
}

export function obstacleLabel(obstacle: ObstacleKind): string {
  return OBSTACLE_LABEL[obstacle]
}

export function callBanner(state: RiverState, call: BannerCall | undefined): CallBanner {
  const overboard = state === 'overboard'

  if (!call) {
    return {
      headline: overboard ? 'FIND THE RAFT' : 'READ THE WATER',
      subtext: overboard ? 'THE CURRENT IS PULLING YOU AWAY' : 'THE RAPIDS KEEP BUILDING',
      tone: 'waiting',
    }
  }

  const direction = DIRECTION_LABEL[call.direction]
  const strokes = `${call.strokes} ${call.strokes === 1 ? 'STROKE' : 'STROKES'}`

  return {
    headline: `${direction} ${call.strokes}!`,
    subtext: overboard
      ? `SWIM TO THE RAFT  /  ${strokes}`
      : `${obstacleLabel(call.obstacle)} AHEAD  /  ${direction} ONLY`,
    tone: call.direction,
  }
}
