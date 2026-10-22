import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RaceRoomMember } from '../multiplayer/roomProtocol'
import { RACER_COLORS } from '../ui/theme'
import type { HostedPlayerState, HostedRaceSession } from './HostedRaceSession'
import { SupabaseRaceAdapter } from './SupabaseRaceAdapter'

class FakeSession implements HostedRaceSession {
  readonly startsAtUnixMs = 12_000
  readonly localPlayerId = 'local-id'
  readonly sent: HostedPlayerState[] = []
  readonly states = new Map<string, HostedPlayerState>()
  destroyed = false
  members: RaceRoomMember[] = [
    { playerId: 'local-id', name: 'River Rat', colorIndex: 0 },
    { playerId: 'remote-id', name: 'Maya', colorIndex: 1 },
  ]
  connected = new Set(['local-id', 'remote-id'])

  getCountdownMs(): number {
    return Math.max(0, this.startsAtUnixMs - Date.now())
  }

  getMembers(): readonly RaceRoomMember[] {
    return this.members
  }

  isConnected(playerId: string): boolean {
    return this.connected.has(playerId)
  }

  getPlayerState(playerId: string): HostedPlayerState | undefined {
    return this.states.get(playerId)
  }

  sendPlayerState(state: HostedPlayerState): void {
    this.sent.push(state)
  }

  destroy(): void {
    this.destroyed = true
  }
}

afterEach(() => vi.restoreAllMocks())

describe('SupabaseRaceAdapter', () => {
  it('uses the server-scheduled start for the local countdown', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_500)
    const adapter = new SupabaseRaceAdapter(new FakeSession())
    expect(adapter.start(38_000)).toEqual({ countdownMs: 1_500 })
  })

  it('projects connected racers from the shared elapsed time', () => {
    vi.spyOn(Date, 'now').mockReturnValue(14_000)
    const adapter = new SupabaseRaceAdapter(new FakeSession())
    adapter.start(40_000)

    expect(adapter.update(9_000, 0.1)).toMatchObject([
      { id: 'local-id', name: 'YOU', progress: 0.1, isLocal: true, connected: true },
      { id: 'remote-id', name: 'MAYA', progress: 0.1, isLocal: false, connected: true },
    ])
  })

  it('freezes a disconnected racer at their last heartbeat', () => {
    vi.spyOn(Date, 'now').mockReturnValue(14_000)
    const session = new FakeSession()
    session.connected.delete('remote-id')
    session.states.set('remote-id', { survivalMs: 7_500, eliminated: false })
    const adapter = new SupabaseRaceAdapter(session)
    adapter.start(40_000)

    expect(adapter.update(9_000, 0.1)[1]).toMatchObject({
      survivalMs: 7_500,
      connected: false,
      eliminated: false,
    })
  })

  it('broadcasts heartbeats sparingly and sends elimination immediately', () => {
    vi.spyOn(Date, 'now').mockReturnValue(14_000)
    const session = new FakeSession()
    const adapter = new SupabaseRaceAdapter(session)
    adapter.start(40_000)

    adapter.update(0, 0)
    adapter.update(1_000, 0.01)
    adapter.update(2_000, 0.02)
    adapter.update(2_100, 0.021, true)
    adapter.update(2_200, 0.022, true)

    expect(session.sent).toEqual([
      { survivalMs: 0, eliminated: false },
      { survivalMs: 2_000, eliminated: false },
      { survivalMs: 2_100, eliminated: true },
    ])
  })

  it('identifies itself as the hosted multiplayer backend', () => {
    expect(new SupabaseRaceAdapter(new FakeSession()).kind).toBe('multiplayer')
  })

  it('sends no heartbeat while the countdown is still running', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const session = new FakeSession()
    const adapter = new SupabaseRaceAdapter(session)
    adapter.start(40_000)

    adapter.update(0, 0)
    adapter.update(3_000, 0, true)

    expect(session.sent).toEqual([])
  })

  it('keeps heartbeating on the interval after elimination without resending it at once', () => {
    vi.spyOn(Date, 'now').mockReturnValue(14_000)
    const session = new FakeSession()
    const adapter = new SupabaseRaceAdapter(session)
    adapter.start(40_000)

    adapter.update(1_000, 0.01, true)
    adapter.update(1_100, 0.01, true)
    adapter.update(3_000, 0.01, true)

    expect(session.sent).toEqual([
      { survivalMs: 1_000, eliminated: true },
      { survivalMs: 3_000, eliminated: true },
    ])
  })

  it('freezes a connected racer at the survival time they were eliminated with', () => {
    vi.spyOn(Date, 'now').mockReturnValue(14_000)
    const session = new FakeSession()
    session.states.set('remote-id', { survivalMs: 6_300, eliminated: true })
    const adapter = new SupabaseRaceAdapter(session)
    adapter.start(40_000)

    expect(adapter.update(9_000, 0.1)[1]).toMatchObject({
      survivalMs: 6_300,
      connected: true,
      eliminated: true,
    })
  })

  it('places a disconnected racer with no heartbeat at the put-in', () => {
    vi.spyOn(Date, 'now').mockReturnValue(14_000)
    const session = new FakeSession()
    session.connected.delete('remote-id')
    const adapter = new SupabaseRaceAdapter(session)
    adapter.start(40_000)

    expect(adapter.update(9_000, 0.1)[1]).toMatchObject({
      survivalMs: 0,
      progress: 0,
      connected: false,
      eliminated: false,
    })
  })

  it('keeps a connected racer with no heartbeat active on the shared clock', () => {
    vi.spyOn(Date, 'now').mockReturnValue(14_000)
    const adapter = new SupabaseRaceAdapter(new FakeSession())
    adapter.start(40_000)

    expect(adapter.update(9_000, 0.1)[1]).toMatchObject({
      survivalMs: 9_000,
      connected: true,
      eliminated: false,
    })
  })

  it('reports the local racer from its own arguments, never from session state', () => {
    vi.spyOn(Date, 'now').mockReturnValue(14_000)
    const session = new FakeSession()
    session.states.set('local-id', { survivalMs: 1, eliminated: false })
    session.connected.delete('local-id')
    const adapter = new SupabaseRaceAdapter(session)
    adapter.start(40_000)

    expect(adapter.update(9_000, 0.42, true)[0]).toMatchObject({
      survivalMs: 9_000,
      progress: 0.42,
      eliminated: true,
      connected: true,
    })
  })

  it('caps a remote racer at the end of the rail', () => {
    vi.spyOn(Date, 'now').mockReturnValue(14_000)
    const adapter = new SupabaseRaceAdapter(new FakeSession())
    adapter.start(40_000)

    expect(adapter.update(200_000, 0)[1].progress).toBe(1)
  })

  it('runs on the default 38 s rail until start() supplies a duration', () => {
    vi.spyOn(Date, 'now').mockReturnValue(14_000)
    const adapter = new SupabaseRaceAdapter(new FakeSession())

    // The rail spans 2.25 × the baseline, so half of 38 s × 2.25 is the midpoint.
    expect(adapter.update(42_750, 0)[1].progress).toBeCloseTo(0.5, 6)
  })

  it('maps negative, fractional and out-of-range colour indexes into the palette', () => {
    vi.spyOn(Date, 'now').mockReturnValue(14_000)
    const session = new FakeSession()
    session.members = [
      { playerId: 'negative', name: 'A', colorIndex: -1 },
      { playerId: 'fractional', name: 'B', colorIndex: 1.9 },
      { playerId: 'wrapped', name: 'C', colorIndex: RACER_COLORS.length + 2 },
    ]
    const adapter = new SupabaseRaceAdapter(session)

    expect(adapter.update(0, 0).map((racer) => racer.color)).toEqual([
      RACER_COLORS[1],
      RACER_COLORS[1],
      RACER_COLORS[2],
    ])
  })

  it('treats recorded strokes as a no-op', () => {
    vi.spyOn(Date, 'now').mockReturnValue(14_000)
    const session = new FakeSession()
    const adapter = new SupabaseRaceAdapter(session)
    adapter.start(40_000)
    const before = adapter.update(5_000, 0.2)

    adapter.recordStroke({ target: null, rating: 'perfect', offsetMs: 0, points: 100 })

    expect(adapter.update(5_000, 0.2)).toEqual(before)
    expect(session.sent).toHaveLength(1)
  })

  it('hands teardown to the hosted session', () => {
    const session = new FakeSession()
    new SupabaseRaceAdapter(session).destroy()
    expect(session.destroyed).toBe(true)
  })
})
