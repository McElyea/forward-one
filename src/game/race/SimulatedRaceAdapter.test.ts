import { describe, expect, it } from 'vitest'
import { SimulatedRaceAdapter } from './SimulatedRaceAdapter'

const DEFAULT_DURATION_MS = 38_000

describe('SimulatedRaceAdapter', () => {
  it('identifies itself as the multiplayer preview backend', () => {
    expect(new SimulatedRaceAdapter().kind).toBe('multiplayer-preview')
  })

  it('reports the local paddler plus three rivals, in a stable order', () => {
    const adapter = new SimulatedRaceAdapter()

    const snapshots = adapter.update(10_000, 0.3)

    expect(snapshots.map((snapshot) => snapshot.id)).toEqual(['local', 'maya', 'eli', 'jo'])
    expect(snapshots.map((snapshot) => snapshot.name)).toEqual(['YOU', 'MAYA', 'ELI', 'JO'])
    expect(snapshots.map((snapshot) => snapshot.isLocal)).toEqual([true, false, false, false])
    expect(snapshots.every((snapshot) => snapshot.connected)).toBe(true)
    expect(snapshots.every((snapshot) => !snapshot.eliminated)).toBe(true)
  })

  it('passes local progress through without simulating it', () => {
    const adapter = new SimulatedRaceAdapter()

    expect(adapter.update(10_000, 0.37)[0].progress).toBe(0.37)
    expect(adapter.update(30_000, 0.37)[0].progress).toBe(0.37)
  })

  it('keeps every rival within [0, 1] before, during and after the race', () => {
    const adapter = new SimulatedRaceAdapter()
    adapter.start(DEFAULT_DURATION_MS)

    for (const elapsedMs of [0, DEFAULT_DURATION_MS / 2, DEFAULT_DURATION_MS, DEFAULT_DURATION_MS * 2]) {
      for (const rival of adapter.update(elapsedMs, 0).slice(1)) {
        expect(rival.progress).toBeGreaterThanOrEqual(0)
        expect(rival.progress).toBeLessThanOrEqual(1)
      }
    }
  })

  it('starts every rival at the put-in', () => {
    const adapter = new SimulatedRaceAdapter()
    adapter.start(DEFAULT_DURATION_MS)

    // Survival time begins at zero for everyone.
    expect(adapter.update(0, 0).slice(1).map((rival) => rival.progress)).toEqual([0, 0, 0])
  })

  it('advances active rivals by survival time on a shared rail', () => {
    const adapter = new SimulatedRaceAdapter()
    adapter.start(DEFAULT_DURATION_MS)

    const [, maya, eli, jo] = adapter.update(DEFAULT_DURATION_MS / 2, 0)

    expect(maya.progress).toBeCloseTo(2 / 9, 6)
    expect(eli.progress).toBeCloseTo(2 / 9, 6)
    expect(jo.progress).toBeCloseTo(2 / 9, 6)
    expect(maya.survivalMs).toBe(DEFAULT_DURATION_MS / 2)
  })

  it('freezes rivals at distinct elimination times so the longest survivor wins', () => {
    const adapter = new SimulatedRaceAdapter()
    adapter.start(DEFAULT_DURATION_MS)

    const [, maya, eli, jo] = adapter.update(DEFAULT_DURATION_MS * 1.8, 0)

    expect(maya.eliminated).toBe(false)
    expect(eli.eliminated).toBe(true)
    expect(jo.eliminated).toBe(true)
    expect(maya.survivalMs).toBeGreaterThan(eli.survivalMs)
    expect(eli.survivalMs).toBeGreaterThan(jo.survivalMs)
  })

  it('scales the rails to the duration handed to start()', () => {
    const long = new SimulatedRaceAdapter()
    long.start(DEFAULT_DURATION_MS)
    const short = new SimulatedRaceAdapter()
    short.start(DEFAULT_DURATION_MS / 2)

    // Same wall-clock instant, half the race left to run: the short race is
    // further along. Only the race-time ratio differs — the surge is a function
    // of elapsed milliseconds and is identical in both.
    expect(short.update(19_000, 0)[1].progress).toBeGreaterThan(
      long.update(19_000, 0)[1].progress,
    )
  })

  it('runs on the default 38 s rail until start() supplies a duration', () => {
    const implicit = new SimulatedRaceAdapter()
    const explicit = new SimulatedRaceAdapter()
    explicit.start(DEFAULT_DURATION_MS)

    expect(implicit.update(12_000, 0.2)).toEqual(explicit.update(12_000, 0.2))
  })

  it('treats recorded strokes as a no-op', () => {
    const adapter = new SimulatedRaceAdapter()
    adapter.start(DEFAULT_DURATION_MS)
    const before = adapter.update(12_000, 0.2)

    adapter.recordStroke({ target: null, rating: 'perfect', offsetMs: 0, points: 100 })

    expect(adapter.update(12_000, 0.2)).toEqual(before)
  })
})
