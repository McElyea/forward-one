import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { RaceRoom } from './roomProtocol'
import { type IntervalScheduler, SupabaseRoomConnection } from './SupabaseRoomConnection'

const HOST_ID = 'host-id'
const LOCAL_ID = 'local-id'

const room = (overrides: Partial<RaceRoom> = {}): RaceRoom => ({
  id: 'room-id',
  code: 'RAFT23',
  levelId: 'class-ii',
  maxPlayers: 8,
  hostPlayerId: HOST_ID,
  matchmaking: false,
  state: 'lobby',
  serverNowUnixMs: Date.parse('2026-08-29T12:00:00.000Z'),
  members: [
    { playerId: HOST_ID, name: 'HOST', colorIndex: 0 },
    { playerId: LOCAL_ID, name: 'RIVER RAT', colorIndex: 1 },
  ],
  ...overrides,
})

/** Presence as Supabase reports it: one array of entries per tracked key. */
const presence = (...paddlers: { playerId: string; name: string; ready: boolean }[]) =>
  Object.fromEntries(
    paddlers.map((paddler, index) => [
      paddler.playerId,
      [{ ...paddler, colorIndex: index }],
    ]),
  )

/**
 * A channel that behaves the way a subscribed realtime channel does: it hands
 * back the handlers it was given, reports SUBSCRIBED, and holds presence.
 */
class FakeChannel {
  private handlers = new Map<string, (payload: unknown) => void>()
  present: Record<string, unknown[]> = {}

  on(type: string, filter: { event: string }, handler: (payload: unknown) => void): this {
    this.handlers.set(`${type}:${filter.event}`, handler)
    return this
  }

  subscribe(notify: (status: string) => void): this {
    notify('SUBSCRIBED')
    return this
  }

  async track(): Promise<void> {}
  async untrack(): Promise<void> {}
  async send(): Promise<void> {}

  presenceState(): Record<string, unknown[]> {
    return this.present
  }

  /** Deliver a presence sync the way the server would. */
  syncPresence(state: Record<string, unknown[]>): void {
    this.present = state
    this.handlers.get('presence:sync')?.(undefined)
  }
}

/** Records what was scheduled instead of asking the DOM for a timer. */
const fakeIntervals = (): IntervalScheduler & { running: number } => {
  const scheduler = {
    running: 0,
    setInterval: () => {
      scheduler.running += 1
      return scheduler.running
    },
    clearInterval: () => {
      scheduler.running -= 1
    },
  }
  return scheduler
}

const connectTo = async (
  localPlayerId: string,
  raceRoom: RaceRoom = room(),
): Promise<{ connection: SupabaseRoomConnection; channel: FakeChannel }> => {
  const channel = new FakeChannel()
  // A test double for a third-party client interface; only `channel` is reached.
  const client = { channel: () => channel } as unknown as SupabaseClient
  const connection = new SupabaseRoomConnection(
    client,
    raceRoom,
    localPlayerId,
    'RIVER RAT',
    0,
    fakeIntervals(),
  )
  await connection.connect()
  return { connection, channel }
}

describe('the lobby seam', () => {
  it('reports every member, and which of them are connected and ready', async () => {
    const { connection, channel } = await connectTo(LOCAL_ID)
    channel.syncPresence(presence({ playerId: LOCAL_ID, name: 'RIVER RAT', ready: true }))

    const snapshot = connection.lobbySnapshot

    expect(snapshot.room.code).toBe('RAFT23')
    expect(snapshot.members).toEqual([
      { playerId: HOST_ID, name: 'HOST', colorIndex: 0, ready: false, connected: false },
      { playerId: LOCAL_ID, name: 'RIVER RAT', colorIndex: 0, ready: true, connected: true },
    ])
  })

  it('offers the start to the host once everyone present is ready', async () => {
    const { connection, channel } = await connectTo(HOST_ID)
    channel.syncPresence(
      presence(
        { playerId: HOST_ID, name: 'HOST', ready: true },
        { playerId: LOCAL_ID, name: 'RIVER RAT', ready: true },
      ),
    )

    expect(connection.canStart).toBe(true)
  })

  it('offers it to nobody else, however ready the room is', async () => {
    // The seam, not the rule: `canStart` has to weigh the local paddler against
    // the host. Passing the host's own id here would light the button up for
    // everyone, and every test in lobbyState.test.ts would still pass.
    const { connection, channel } = await connectTo(LOCAL_ID)
    channel.syncPresence(
      presence(
        { playerId: HOST_ID, name: 'HOST', ready: true },
        { playerId: LOCAL_ID, name: 'RIVER RAT', ready: true },
      ),
    )

    expect(connection.canStart).toBe(false)
  })

  it('withholds the start while a paddler present is not ready', async () => {
    const { connection, channel } = await connectTo(HOST_ID)
    channel.syncPresence(
      presence(
        { playerId: HOST_ID, name: 'HOST', ready: true },
        { playerId: LOCAL_ID, name: 'RIVER RAT', ready: false },
      ),
    )

    expect(connection.canStart).toBe(false)
  })

  it('reads the room it currently holds, not the one it started with', async () => {
    const { connection } = await connectTo(LOCAL_ID, room({ code: 'OTHER1' }))

    expect(connection.lobbySnapshot.room.code).toBe('OTHER1')
  })
})
