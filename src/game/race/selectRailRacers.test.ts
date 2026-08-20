import { describe, expect, it } from 'vitest'
import type { RacerSnapshot } from '../types'
import { selectRailRacers } from './selectRailRacers'

const racer = (rank: number, local = false): RacerSnapshot => ({
  id: local ? 'local' : `racer-${rank}`,
  name: local ? 'YOU' : `RACER ${rank}`,
  color: rank,
  progress: (65 - rank) / 64,
  survivalMs: 65_000 - rank * 1_000,
  eliminated: false,
  isLocal: local,
  connected: true,
})

describe('selectRailRacers', () => {
  it('does not trim a normal eight-player room', () => {
    const racers = Array.from({ length: 8 }, (_, index) => racer(index + 1, index === 4))
    expect(selectRailRacers(racers, 8)).toHaveLength(8)
  })

  it('shows the leader, local paddler, and nearby ranks in a 64-player room', () => {
    const racers = Array.from({ length: 64 }, (_, index) => racer(index + 1, index === 31))
    const visible = selectRailRacers(racers, 8)

    expect(visible).toHaveLength(8)
    expect(visible[0].name).toBe('RACER 1')
    expect(visible.some((entry) => entry.isLocal)).toBe(true)
    expect(visible.map((entry) => entry.name)).toEqual([
      'RACER 1',
      'RACER 29',
      'RACER 30',
      'RACER 31',
      'YOU',
      'RACER 33',
      'RACER 34',
      'RACER 35',
    ])
  })

  it('falls back to the leaders if the local racer is absent', () => {
    const racers = Array.from({ length: 12 }, (_, index) => racer(index + 1))
    expect(selectRailRacers(racers, 4).map((entry) => entry.name)).toEqual([
      'RACER 1',
      'RACER 2',
      'RACER 3',
      'RACER 4',
    ])
  })
})
