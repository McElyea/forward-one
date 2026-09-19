import {
  MAX_STABILITY,
  RECOVERY_CALLS,
  type SurvivalSnapshot,
  type SurvivalTransition,
} from '../survival/SurvivalEngine'
import type { StrokeJudgment, StrokeRating } from '../types'
import { formatRunClock } from '../ui/runClock'
import { obstacleLabel } from './callBanner'

/**
 * What the HUD says while a run is on.
 *
 * The wording was assembled inline across `RiverScene.updateHud()`,
 * `applyJudgment()`, `handleSurvivalTransition()` and `finishRace()`, where
 * nothing could check it — a test that constructs a `Phaser.Scene` fails at
 * import here. The raft's hit points and the swimmer's recovery count were also
 * quoted as bare `/3` and `/2`, separately from the constants `SurvivalEngine`
 * actually enforces.
 */

/** A line the feedback plate flashes, coloured by the rating it is given. */
export interface HudFeedback {
  label: string
  rating: StrokeRating
}

export interface CountdownBanner {
  headline: string
  subtext: string
}

/** The seconds left before the start, or the word that replaces zero. */
export function countdownBanner(msUntilStart: number): CountdownBanner {
  const seconds = Math.ceil(msUntilStart / 1000)

  return {
    headline: seconds > 0 ? `${seconds}` : 'GO!',
    subtext: 'THE CLOCK STARTS TOGETHER',
  }
}

/**
 * Accuracy and score in the top bar. Only a wide landscape bar has room for
 * the words; a phone gets the two numbers and a slash.
 */
export function statsLine(accuracy: number, points: number, wide: boolean): string {
  const score = points.toLocaleString()

  return wide
    ? `ACCURACY ${accuracy}%   SCORE ${score}`
    : `${accuracy}%  /  ${score}`
}

/** The raft, swimmer or swept-away line under the top bar. */
export function survivalStatusLine(
  snapshot: Pick<SurvivalSnapshot, 'state' | 'stability' | 'recovery' | 'intensity'>,
  streak: number,
): string {
  if (snapshot.state === 'aboard') {
    return (
      `RAFT HP ${snapshot.stability}/${MAX_STABILITY}  •  FLOW ${snapshot.intensity.toFixed(1)}×` +
      (streak > 1 ? `  •  STREAK ×${streak}` : '')
    )
  }
  if (snapshot.state === 'overboard') {
    return `OVERBOARD  /  ${snapshot.recovery}/${RECOVERY_CALLS} TO RAFT`
  }
  return 'SWEPT AWAY'
}

/** A stroke's rating as the plate flashes it; only the wrong way gets words. */
export function strokeFeedback(judgment: StrokeJudgment): HudFeedback {
  return {
    label: judgment.rating === 'wrong' ? 'WRONG WAY' : judgment.rating.toUpperCase(),
    rating: judgment.rating,
  }
}

/**
 * The streak after a stroke. Any scoring stroke on a real target extends it;
 * a miss, a wrong direction, or a stroke with no target to hit resets it.
 */
export function nextStreak(streak: number, judgment: StrokeJudgment): number {
  return judgment.target && judgment.points > 0 ? streak + 1 : 0
}

/**
 * What the plate says as the river changes the raft's state. `stability` is
 * the raft's hit points after the transition, which only an impact quotes.
 * Being swept away has no line of its own: the run ends on that frame and the
 * summary takes over.
 */
export function transitionFeedback(
  transition: SurvivalTransition,
  stability: number,
): HudFeedback | undefined {
  switch (transition.type) {
    case 'impact':
      return {
        label: `${obstacleLabel(transition.event.obstacle)} HIT  •  HP ${stability}/${MAX_STABILITY}`,
        rating: 'wrong',
      }
    case 'ejected':
      return { label: `RAFT HP 0/${MAX_STABILITY}  •  OVERBOARD`, rating: 'wrong' }
    case 'recovery-progress':
      return { label: 'CLOSING ON THE RAFT', rating: 'good' }
    case 'drifted':
      return { label: 'RAFT PULLING AWAY', rating: 'late' }
    case 'recovered':
      return { label: 'BACK ABOARD', rating: 'perfect' }
    case 'swept-away':
      return undefined
  }
}

/** The one-line tally on the summary screen: clock, accuracy, points. */
export function runSummaryLine(elapsedMs: number, accuracy: number, points: number): string {
  return `${formatRunClock(elapsedMs)}   •   ${accuracy}% ACCURACY   •   ${points.toLocaleString()} PTS`
}
