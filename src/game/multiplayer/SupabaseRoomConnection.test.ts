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

  readonly sent: { event: string }[] = []
  async send(message: { event: string }): Promise<void> {
    this.sent.push(message)
  }

  presenceState(): Record<string, unknown[]> {
    return this.present
  }

  /** Deliver a presence sync the way the server would. */
  syncPresence(state: Record<string, unknown[]>): void {
    this.present = state
    this.handlers.get('presence:sync')?.(undefined)
  }

  /** Deliver a broadcast from another paddler. */
  broadcast(event: string, payload: unknown): void {
    this.handlers.get(`broadcast:${event}`)?.({ payload })
  }
}

/** Records what was scheduled instead of asking the DOM for a timer. */
const fakeIntervals = (): IntervalScheduler & { running: number; periods: number[] } => {
  const scheduler = {
    running: 0,
    periods: [] as number[],
    setInterval: (_handler: () => void, ms: number) => {
      scheduler.running += 1
      scheduler.periods.push(ms)
      return scheduler.running
    },
    clearInterval: () => {
      scheduler.running -= 1
    },
  }
  return scheduler
}

/** What `client.rpc` resolves with: the error half is how a refusal arrives. */
type RpcResponse = { data: unknown; error: { message: string } | null }

const refusingRpc = async (): Promise<RpcResponse> => ({
  data: null,
  error: { message: 'room service refused' },
})

/** Lets the handlers a broadcast fired without awaiting run to completion. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const connectTo = async (
  localPlayerId: string,
  raceRoom: RaceRoom = room(),
  rpc: () => Promise<RpcResponse> = refusingRpc,
) => {
  const channel = new FakeChannel()
  const intervals = fakeIntervals()
  // A test double for a third-party client interface; only `channel`, `rpc`
  // and `removeChannel` are reached.
  const client = {
    channel: () => channel,
    rpc,
    removeChannel: async () => 'ok',
  } as unknown as SupabaseClient
  const connection = new SupabaseRoomConnection(
    client,
    raceRoom,
    localPlayerId,
    'RIVER RAT',
    0,
    intervals,
  )
  await connection.connect()
  return { connection, channel, intervals }
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

const START = Date.parse('2026-08-29T12:00:05.000Z')
const SERVER_START = Date.parse('2026-08-29T12:00:06.000Z')

describe('the heartbeat', () => {
  it('polls quickly while a matchmaking room waits for its start', async () => {
    const { intervals } = await connectTo(LOCAL_ID, room({ matchmaking: true }))

    expect(intervals.periods).toEqual([2_000])
  })

  it('beats slowly once a matchmaking room has its start', async () => {
    const { intervals } = await connectTo(
      LOCAL_ID,
      room({ matchmaking: true, state: 'countdown', startsAtUnixMs: START }),
    )

    expect(intervals.periods).toEqual([20_000])
  })

  it('beats slowly in a room joined by code', async () => {
    const { intervals } = await connectTo(LOCAL_ID)

    expect(intervals.periods).toEqual([20_000])
  })
})

describe('the scheduled start', () => {
  it('refuses to report a start the room does not have', async () => {
    const { connection } = await connectTo(LOCAL_ID)

    expect(() => connection.startsAtUnixMs).toThrow('The room has no scheduled start')
  })

  it('tells a late listener about a start already scheduled', async () => {
    const { connection } = await connectTo(
      LOCAL_ID,
      room({ state: 'countdown', startsAtUnixMs: START }),
    )
    const starts: number[] = []

    connection.onStart((startsAtUnixMs) => starts.push(startsAtUnixMs))

    expect(starts).toEqual([START])
  })

  it('tells an early listener nothing until a start arrives', async () => {
    const { connection } = await connectTo(LOCAL_ID)
    const starts: number[] = []

    connection.onStart((startsAtUnixMs) => starts.push(startsAtUnixMs))

    expect(starts).toEqual([])
  })
})

describe('broadcasts from other paddlers', () => {
  it('keeps the latest state each paddler reports', async () => {
    const { connection, channel } = await connectTo(LOCAL_ID)

    channel.broadcast('player-state', { playerId: HOST_ID, survivalMs: 4_200, eliminated: false })

    expect(connection.getPlayerState(HOST_ID)).toEqual({ survivalMs: 4_200, eliminated: false })
  })

  it('drops a state report it cannot read', async () => {
    const { connection, channel } = await connectTo(LOCAL_ID)

    channel.broadcast('player-state', { playerId: HOST_ID, survivalMs: 'long' })

    expect(connection.getPlayerState(HOST_ID)).toBeUndefined()
  })

  it('ignores a race start without a numeric start time', async () => {
    const { connection, channel } = await connectTo(LOCAL_ID)
    const starts: number[] = []
    connection.onStart((startsAtUnixMs) => starts.push(startsAtUnixMs))

    channel.broadcast('race-start', { startsAtUnixMs: 'soon' })
    await settle()

    expect(starts).toEqual([])
    expect(connection.room.state).toBe('lobby')
  })

  it('still starts on the broadcast time when the room cannot be re-read', async () => {
    const { connection, channel } = await connectTo(LOCAL_ID)
    const starts: number[] = []
    connection.onStart((startsAtUnixMs) => starts.push(startsAtUnixMs))

    channel.broadcast('race-start', { startsAtUnixMs: START })
    await settle()

    expect(starts).toEqual([START])
    expect(connection.room.state).toBe('countdown')
  })

  it('prefers the start time the room service holds over the broadcast one', async () => {
    const reread = async (): Promise<RpcResponse> => ({
      data: {
        id: 'room-id',
        code: 'RAFT23',
        levelId: 'class-ii',
        maxPlayers: 8,
        hostPlayerId: HOST_ID,
        matchmaking: false,
        state: 'countdown',
        serverNow: '2026-08-29T12:00:00.000Z',
        startsAt: '2026-08-29T12:00:06.000Z',
        members: [],
      },
      error: null,
    })
    const { connection, channel } = await connectTo(LOCAL_ID, room(), reread)
    const starts: number[] = []
    connection.onStart((startsAtUnixMs) => starts.push(startsAtUnixMs))

    channel.broadcast('race-start', { startsAtUnixMs: START })
    await settle()

    expect(starts).toEqual([SERVER_START])
  })
})

describe('leaving', () => {
  it('stops the heartbeat even when the room service refuses the leave', async () => {
    const { connection, intervals } = await connectTo(LOCAL_ID)

    await expect(connection.leave()).rejects.toThrow('room service refused')
    expect(intervals.running).toBe(0)
  })

  it('does nothing the second time', async () => {
    const leaves: string[] = []
    const accepting = async (): Promise<RpcResponse> => {
      leaves.push('leave')
      return { data: null, error: null }
    }
    const { connection } = await connectTo(LOCAL_ID, room(), accepting)

    await connection.leave()
    await connection.leave()

    expect(leaves).toEqual(['leave'])
  })

  it('stops reporting this paddler once gone', async () => {
    const { connection, channel } = await connectTo(LOCAL_ID)
    await connection.leave().catch(() => undefined)
    const sentBefore = channel.sent.length

    connection.sendPlayerState({ survivalMs: 1_000, eliminated: false })

    expect(channel.sent.length).toBe(sentBefore)
  })
})
