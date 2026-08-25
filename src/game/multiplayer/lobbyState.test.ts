import { describe, expect, it } from 'vitest'
import {
  canStartRace,
  isNewlyScheduledStart,
  MIN_RACE_PADDLERS,
  mergeLobbyMembers,
  parsePlayerState,
  parsePresence,
  type PresentPaddler,
} from './lobbyState'
import type { LobbyMember, RaceRoom } from './roomProtocol'

const room = (overrides: Partial<RaceRoom> = {}): RaceRoom => ({
  id: 'room-id',
  code: 'RAFT23',
  levelId: 'class-ii',
  maxPlayers: 8,
  hostPlayerId: 'host-id',
  matchmaking: false,
  state: 'lobby',
  serverNowUnixMs: Date.parse('2026-08-19T11:59:57.000Z'),
  members: [
    { playerId: 'host-id', name: 'HOST', colorIndex: 0 },
    { playerId: 'guest-id', name: 'GUEST', colorIndex: 1 },
  ],
  ...overrides,
})

const presence = (...paddlers: PresentPaddler[]): Map<string, PresentPaddler> =>
  new Map(paddlers.map((paddler) => [paddler.playerId, paddler]))

const member = (overrides: Partial<LobbyMember> = {}): LobbyMember => ({
  playerId: 'host-id',
  name: 'HOST',
  colorIndex: 0,
  ready: true,
  connected: true,
  ...overrides,
})

describe('parsePresence', () => {
  it('accepts a fully-formed presence entry', () => {
    expect(parsePresence({ playerId: 'host-id', name: 'HOST', colorIndex: 0, ready: true }))
      .toEqual({ playerId: 'host-id', name: 'HOST', colorIndex: 0, ready: true })
  })

  it('drops anything the channel sends that is not a presence entry', () => {
    expect(parsePresence(undefined)).toBeUndefined()
    expect(parsePresence('host-id')).toBeUndefined()
    expect(parsePresence([{ playerId: 'host-id', name: 'HOST', colorIndex: 0, ready: true }]))
      .toBeUndefined()
  })

  it('drops a presence entry whose fields are missing or mistyped', () => {
    expect(parsePresence({ name: 'HOST', colorIndex: 0, ready: true }), 'no player id')
      .toBeUndefined()
    expect(parsePresence({ playerId: 'host-id', colorIndex: 0, ready: true }), 'no name')
      .toBeUndefined()
    expect(
      parsePresence({ playerId: 'host-id', name: 'HOST', colorIndex: '0', ready: true }),
      'colour index is not a number',
    ).toBeUndefined()
    expect(
      parsePresence({ playerId: 'host-id', name: 'HOST', colorIndex: 0, ready: 'yes' }),
      'readiness is not a boolean',
    ).toBeUndefined()
  })
})

describe('parsePlayerState', () => {
  it('splits a broadcast into the paddler and their survival state', () => {
    expect(parsePlayerState({ playerId: 'guest-id', survivalMs: 7_500, eliminated: false }))
      .toEqual({ playerId: 'guest-id', state: { survivalMs: 7_500, eliminated: false } })
  })

  it('drops a player-state broadcast that is malformed', () => {
    expect(parsePlayerState(7_500), 'not a record').toBeUndefined()
    expect(parsePlayerState({ survivalMs: 7_500, eliminated: false }), 'no player id')
      .toBeUndefined()
    expect(
      parsePlayerState({ playerId: 'guest-id', survivalMs: '7500', eliminated: false }),
      'survival time is not a number',
    ).toBeUndefined()
    expect(
      parsePlayerState({ playerId: 'guest-id', survivalMs: 7_500, eliminated: 1 }),
      'elimination is not a boolean',
    ).toBeUndefined()
  })
})

describe('mergeLobbyMembers', () => {
  it('marks a roster member absent until presence vouches for them', () => {
    expect(mergeLobbyMembers(room(), presence())).toEqual([
      { playerId: 'host-id', name: 'HOST', colorIndex: 0, ready: false, connected: false },
      { playerId: 'guest-id', name: 'GUEST', colorIndex: 1, ready: false, connected: false },
    ])
  })

  it('lets a present paddler speak for their own row', () => {
    const merged = mergeLobbyMembers(
      room(),
      presence({ playerId: 'guest-id', name: 'RENAMED', colorIndex: 5, ready: true }),
    )

    expect(merged[1], 'presence should override the stale roster name and colour').toEqual({
      playerId: 'guest-id',
      name: 'RENAMED',
      colorIndex: 5,
      ready: true,
      connected: true,
    })
  })

  it('appends a paddler who is on the channel before the roster catches up', () => {
    const merged = mergeLobbyMembers(
      room(),
      presence({ playerId: 'latecomer-id', name: 'LATE', colorIndex: 2, ready: false }),
    )

    expect(merged).toHaveLength(3)
    expect(merged[2]).toEqual({
      playerId: 'latecomer-id',
      name: 'LATE',
      colorIndex: 2,
      ready: false,
      connected: true,
    })
  })

  it('keeps the roster order rather than the presence order', () => {
    const merged = mergeLobbyMembers(
      room(),
      presence(
        { playerId: 'guest-id', name: 'GUEST', colorIndex: 1, ready: true },
        { playerId: 'host-id', name: 'HOST', colorIndex: 0, ready: true },
      ),
    )

    expect(merged.map((entry) => entry.playerId)).toEqual(['host-id', 'guest-id'])
  })
})

describe('canStartRace', () => {
  const snapshot = (members: LobbyMember[]) => ({ room: room(), members })

  it('lets the host start once everyone present is ready', () => {
    expect(canStartRace(
      snapshot([member(), member({ playerId: 'guest-id', name: 'GUEST', colorIndex: 1 })]),
      'host-id',
    )).toBe(true)
  })

  it('refuses a paddler who is not the host', () => {
    expect(canStartRace(
      snapshot([member(), member({ playerId: 'guest-id', name: 'GUEST', colorIndex: 1 })]),
      'guest-id',
    )).toBe(false)
  })

  it('refuses a host with nobody to race', () => {
    expect(MIN_RACE_PADDLERS).toBe(2)
    expect(canStartRace(snapshot([member()]), 'host-id')).toBe(false)
  })

  it('refuses while a connected paddler is still setting up', () => {
    expect(canStartRace(
      snapshot([member(), member({ playerId: 'guest-id', ready: false })]),
      'host-id',
    )).toBe(false)
  })

  it('ignores a disconnected paddler who never readied', () => {
    expect(canStartRace(
      snapshot([
        member(),
        member({ playerId: 'guest-id' }),
        member({ playerId: 'ghost-id', ready: false, connected: false }),
      ]),
      'host-id',
    )).toBe(true)
  })
})

describe('isNewlyScheduledStart', () => {
  it('fires on the poll that first learns of a start', () => {
    expect(isNewlyScheduledStart(undefined, 12_000)).toBe(true)
  })

  it('stays quiet on every later poll returning the same start', () => {
    expect(isNewlyScheduledStart(12_000, 12_000)).toBe(false)
  })

  it('stays quiet while the lobby is still unscheduled', () => {
    expect(isNewlyScheduledStart(undefined, undefined)).toBe(false)
  })
})
