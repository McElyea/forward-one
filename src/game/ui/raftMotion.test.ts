import { describe, expect, it } from 'vitest'
import {
  obstacleLaneTarget,
  raftDodgeCueIndex,
  raftLaneCrossingDuration,
  raftLaneTarget,
  raftLaneTravel,
} from './raftMotion'

describe('raft lanes', () => {
  it('uses five lanes and returns through the center', () => {
    expect([0, 1, 2, 3, 4].map(raftLaneTarget)).toEqual([-1, 0, 1, -0.5, 0.5])
    expect(raftLaneTarget(5)).toBe(-1)
  })

  it('puts each obstacle in the lane the raft is leaving', () => {
    expect(obstacleLaneTarget(0)).toBe(0)
    for (let cueIndex = 1; cueIndex < 8; cueIndex += 1) {
      expect(obstacleLaneTarget(cueIndex)).toBe(raftLaneTarget(cueIndex - 1))
    }
  })

  it('slows down longer crossings', () => {
    expect(raftLaneCrossingDuration(0, 0.5)).toBe(475)
    expect(raftLaneCrossingDuration(-1, 1)).toBe(760)
  })

  it('starts a dodge on the first successful stroke for a cue', () => {
    const successful = {
      target: {
        id: '3-0',
        cueIndex: 3,
        strokeIndex: 0,
        direction: 'forward' as const,
        targetTime: 2_000,
        status: 'good' as const,
      },
      points: 75,
    }

    expect(raftDodgeCueIndex(successful, 2)).toBe(3)
    expect(raftDodgeCueIndex(successful, 3)).toBeUndefined()
  })

  it('does not move lanes for a miss or wrong-direction stroke', () => {
    expect(raftDodgeCueIndex({ target: null, points: 0 }, 2)).toBeUndefined()
    expect(raftDodgeCueIndex({
      target: {
        id: '3-0',
        cueIndex: 3,
        strokeIndex: 0,
        direction: 'forward',
        targetTime: 2_000,
        status: 'wrong',
      },
      points: 0,
    }, 2)).toBeUndefined()
  })

  it('makes lane crossings visible without running off narrow or wide rivers', () => {
    expect(raftLaneTravel(200)).toBe(48)
    expect(raftLaneTravel(800)).toBeCloseTo(112)
    expect(raftLaneTravel(4_000)).toBe(150)
  })
})
