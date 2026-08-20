import type { RacerSnapshot } from '../types'
import { rankRacers } from './rankRacers'

/**
 * Keep a crowded rail useful: always retain the leader and local paddler,
 * then fill the remaining slots with the racers nearest the local rank.
 */
export function selectRailRacers(
  racers: RacerSnapshot[],
  maximumVisible: number,
): RacerSnapshot[] {
  if (!Number.isInteger(maximumVisible) || maximumVisible < 2) {
    throw new Error('A race rail needs room for at least two racers')
  }

  const ranked = rankRacers(racers)
  if (ranked.length <= maximumVisible) return ranked

  const localIndex = ranked.findIndex((racer) => racer.isLocal)
  if (localIndex < 0) return ranked.slice(0, maximumVisible)

  const visibleIndices = new Set<number>([0, localIndex])
  for (let distance = 1; visibleIndices.size < maximumVisible; distance += 1) {
    const ahead = localIndex - distance
    const behind = localIndex + distance
    if (ahead >= 0) visibleIndices.add(ahead)
    if (visibleIndices.size < maximumVisible && behind < ranked.length) {
      visibleIndices.add(behind)
    }
    if (ahead < 0 && behind >= ranked.length) break
  }

  for (let index = 0; visibleIndices.size < maximumVisible; index += 1) {
    visibleIndices.add(index)
  }

  return ranked.filter((_racer, index) => visibleIndices.has(index))
}
