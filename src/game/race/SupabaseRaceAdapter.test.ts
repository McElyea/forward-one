import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RaceRoomMember } from '../multiplayer/roomProtocol'
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

  it('hands teardown to the hosted session', () => {
    const session = new FakeSession()
    new SupabaseRaceAdapter(session).destroy()
    expect(session.destroyed).toBe(true)
  })
})
