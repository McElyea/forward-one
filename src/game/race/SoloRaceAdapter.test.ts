import { describe, expect, it } from 'vitest'
import type { RaceAdapter } from './RaceAdapter'
import { SoloRaceAdapter } from './SoloRaceAdapter'

describe('SoloRaceAdapter', () => {
  it('identifies itself as the solo backend', () => {
    expect(new SoloRaceAdapter().kind).toBe('solo')
  })

  it('starts after the standard local countdown', () => {
    expect(new SoloRaceAdapter().start()).toEqual({ countdownMs: 2_400 })
  })

  it('reports the local paddler and nobody else', () => {
    const adapter = new SoloRaceAdapter()

    const snapshots = adapter.update(12_000, 0.4)

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].id).toBe('local')
    expect(snapshots[0].isLocal).toBe(true)
    expect(snapshots[0].connected).toBe(true)
    expect(snapshots[0].survivalMs).toBe(12_000)
    expect(snapshots[0].eliminated).toBe(false)
  })

  it('passes local progress through untouched', () => {
    const adapter = new SoloRaceAdapter()

    // Including values outside [0, 1] — the solo adapter does not clamp, and
    // RiverScene is the one that keeps progress in range.
    expect(adapter.update(0, 0).map((snapshot) => snapshot.progress)).toEqual([0])
    expect(adapter.update(5_000, 0.63).map((snapshot) => snapshot.progress)).toEqual([0.63])
    expect(adapter.update(9_000, 1.4).map((snapshot) => snapshot.progress)).toEqual([1.4])
  })

  it('reports survival time and whether the local paddler was eliminated', () => {
    const adapter = new SoloRaceAdapter()

    expect(adapter.update(240_000, 0.25, true)[0]).toMatchObject({
      survivalMs: 240_000,
      eliminated: true,
    })
  })

  it('reports the same paddler whether or not start() ran', () => {
    // Through the RaceAdapter interface, which is how RiverScene holds it —
    // the concrete class narrows start() to zero parameters.
    const started: RaceAdapter = new SoloRaceAdapter()
    started.start(38_000)

    expect(started.update(6_000, 0.5)).toEqual(new SoloRaceAdapter().update(6_000, 0.5))
  })

  it('treats recorded strokes as a no-op', () => {
    const adapter = new SoloRaceAdapter()

    adapter.recordStroke({ target: null, rating: 'perfect', offsetMs: 0, points: 100 })

    expect(adapter.update(6_000, 0.5)).toEqual(new SoloRaceAdapter().update(6_000, 0.5))
  })
})
