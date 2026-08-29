import { describe, expect, it } from 'vitest'
import type { RaceRoomMember } from '../multiplayer/roomProtocol'
import { createRaceAdapter } from './createRaceAdapter'
import type { HostedPlayerState, HostedRaceSession } from './HostedRaceSession'
import { SimulatedRaceAdapter } from './SimulatedRaceAdapter'
import { SoloRaceAdapter } from './SoloRaceAdapter'
import { SupabaseRaceAdapter } from './SupabaseRaceAdapter'

/** The narrowest session the multiplayer branch will accept. */
class StubSession implements HostedRaceSession {
  readonly startsAtUnixMs = 0
  readonly localPlayerId = 'local-id'

  getCountdownMs(): number {
    return 0
  }

  getMembers(): readonly RaceRoomMember[] {
    return []
  }

  isConnected(): boolean {
    return false
  }

  getPlayerState(): HostedPlayerState | undefined {
    return undefined
  }

  sendPlayerState(): void {}

  destroy(): void {}
}

describe('createRaceAdapter', () => {
  it('races alone in solo mode', () => {
    expect(createRaceAdapter('solo')).toBeInstanceOf(SoloRaceAdapter)
  })

  it('races against the scripted rivals in the preview mode', () => {
    expect(createRaceAdapter('multiplayer-preview')).toBeInstanceOf(SimulatedRaceAdapter)
  })

  it('races against a hosted room when one is supplied', () => {
    expect(createRaceAdapter('multiplayer', new StubSession())).toBeInstanceOf(SupabaseRaceAdapter)
  })

  it('refuses a multiplayer race with no room to race in', () => {
    expect(() => createRaceAdapter('multiplayer')).toThrow(
      'A multiplayer race needs a hosted room session',
    )
  })

  it('does not quietly hand a solo race the scripted rivals', () => {
    // The two zero-argument modes both return a RaceAdapter, so swapping their
    // bodies compiles cleanly and every adapter's own test stays green.
    expect(createRaceAdapter('solo')).not.toBeInstanceOf(SimulatedRaceAdapter)
    expect(createRaceAdapter('multiplayer-preview')).not.toBeInstanceOf(SoloRaceAdapter)
  })
})
