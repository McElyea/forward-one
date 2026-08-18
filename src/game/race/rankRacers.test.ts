import { describe, expect, it } from 'vitest'
import type { RacerSnapshot } from '../types'
import { rankRacers } from './rankRacers'

const racer = (
  id: string,
  survivalMs: number,
  eliminated: boolean,
): RacerSnapshot => ({
  id,
  name: id.toUpperCase(),
  color: 0xffffff,
  progress: 0,
  survivalMs,
  eliminated,
  isLocal: id === 'local',
  connected: true,
})

describe('rankRacers', () => {
  it('puts active racers ahead of a player eliminated at the same instant', () => {
    const ranked = rankRacers([
      racer('local', 30_000, true),
      racer('maya', 30_000, false),
    ])

    expect(ranked.map(({ id }) => id)).toEqual(['maya', 'local'])
  })

  it('ranks eliminated racers by longest survival time', () => {
    const ranked = rankRacers([
      racer('jo', 18_000, true),
      racer('eli', 24_000, true),
      racer('maya', 32_000, true),
    ])

    expect(ranked.map(({ id }) => id)).toEqual(['maya', 'eli', 'jo'])
  })

  it('does not reorder the adapter snapshot array in place', () => {
    const snapshots = [racer('local', 12_000, true), racer('maya', 12_000, false)]

    rankRacers(snapshots)

    expect(snapshots.map(({ id }) => id)).toEqual(['local', 'maya'])
  })
})
