import type { StrokeJudgment } from '../types'

export type RaftLane = -1 | -0.5 | 0 | 0.5 | 1

const MIN_LANE_TRAVEL_PX = 48
const MAX_LANE_TRAVEL_PX = 150
const LANE_TRAVEL_RATIO = 0.14
const FIVE_LANE_ROUTE: readonly RaftLane[] = [-1, 0, 1, -0.5, 0.5]

/** A repeatable five-lane route that returns through the centre regularly. */
export function raftLaneTarget(cueIndex: number): RaftLane {
  const routeIndex = Math.abs(Math.trunc(cueIndex)) % FIVE_LANE_ROUTE.length
  return FIVE_LANE_ROUTE[routeIndex]
}

/** The obstacle occupies the lane the raft is leaving. */
export function obstacleLaneTarget(cueIndex: number): RaftLane {
  return cueIndex <= 0 ? 0 : raftLaneTarget(cueIndex - 1)
}

/** Longer lane changes get more time, keeping full-width crossings smooth. */
export function raftLaneCrossingDuration(from: number, to: RaftLane): number {
  const distance = Math.min(2, Math.abs(to - from))
  return 380 + distance * 190
}

/** The raft dodges once, on the first successful stroke the player lands. */
export function raftDodgeCueIndex(
  judgment: Pick<StrokeJudgment, 'target' | 'points'>,
  lastCueIndex: number,
): number | undefined {
  const cueIndex = judgment.target?.cueIndex
  if (cueIndex === undefined || judgment.points <= 0 || cueIndex === lastCueIndex) {
    return undefined
  }
  return cueIndex
}

/** A meaningful crossing on desktop that still stays inside a phone-width river. */
export function raftLaneTravel(riverWidth: number): number {
  return Math.min(
    MAX_LANE_TRAVEL_PX,
    Math.max(MIN_LANE_TRAVEL_PX, riverWidth * LANE_TRAVEL_RATIO),
  )
}
