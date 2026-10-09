import { describe, expect, it } from 'vitest'
import {
  estimateServerClockOffset,
  isRecord,
  parseRaceRoom,
  scheduledCountdownMs,
} from './roomProtocol'

const payload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'room-id',
  code: 'RAFT23',
  levelId: 'class-ii',
  maxPlayers: 8,
  hostPlayerId: 'host-id',
  matchmaking: false,
  state: 'lobby',
  serverNow: '2026-08-19T11:59:57.000Z',
  startsAt: null,
  members: [{ playerId: 'host-id', name: 'HOST', colorIndex: 0 }],
  ...overrides,
})

describe('isRecord', () => {
  it('accepts a plain object', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ id: 'room-id' })).toBe(true)
  })

  it('rejects null, arrays and primitives', () => {
    expect(isRecord(null), 'null').toBe(false)
    expect(isRecord(undefined), 'undefined').toBe(false)
    expect(isRecord([]), 'an array').toBe(false)
    expect(isRecord('room-id'), 'a string').toBe(false)
    expect(isRecord(0), 'a number').toBe(false)
  })
})

describe('parseRaceRoom', () => {
  it('turns the database payload into the browser room model', () => {
    expect(parseRaceRoom({
      id: 'room-id',
      code: 'RAFT23',
      levelId: 'class-ii',
      maxPlayers: 8,
      hostPlayerId: 'host-id',
      matchmaking: true,
      state: 'countdown',
      serverNow: '2026-08-19T11:59:57.000Z',
      startsAt: '2026-08-19T12:00:00.000Z',
      members: [{ playerId: 'host-id', name: 'HOST', colorIndex: 0 }],
    })).toEqual({
      id: 'room-id',
      code: 'RAFT23',
      levelId: 'class-ii',
      maxPlayers: 8,
      hostPlayerId: 'host-id',
      matchmaking: true,
      state: 'countdown',
      serverNowUnixMs: Date.parse('2026-08-19T11:59:57.000Z'),
      startsAtUnixMs: Date.parse('2026-08-19T12:00:00.000Z'),
      members: [{ playerId: 'host-id', name: 'HOST', colorIndex: 0 }],
    })
  })

  it('accepts a lobby that has not been scheduled', () => {
    expect(parseRaceRoom({
      id: 'room-id',
      code: 'RAFT23',
      levelId: 'class-ii',
      maxPlayers: 64,
      hostPlayerId: 'host-id',
      matchmaking: false,
      state: 'lobby',
      serverNow: '2026-08-19T11:59:57.000Z',
      startsAt: null,
      members: [],
    }).startsAtUnixMs).toBeUndefined()
  })

  it('rejects malformed server data at the transport boundary', () => {
    expect(() => parseRaceRoom({ state: 'lobby' })).toThrow('Room response')
    expect(() => parseRaceRoom({
      id: 'room-id',
      code: 'RAFT23',
      levelId: 'class-ii',
      maxPlayers: 8,
      hostPlayerId: 'host-id',
      matchmaking: false,
      state: 'unknown',
      serverNow: '2026-08-19T11:59:57.000Z',
      members: [],
    })).toThrow('invalid state')
  })

  it('keeps only the fields of the room model, in member order', () => {
    expect(parseRaceRoom(payload({
      region: 'us-east',
      members: [
        { playerId: 'host-id', name: 'HOST', colorIndex: 0, ready: true },
        { playerId: 'guest-id', name: 'GUEST', colorIndex: 3 },
      ],
    }))).toEqual({
      id: 'room-id',
      code: 'RAFT23',
      levelId: 'class-ii',
      maxPlayers: 8,
      hostPlayerId: 'host-id',
      matchmaking: false,
      state: 'lobby',
      serverNowUnixMs: Date.parse('2026-08-19T11:59:57.000Z'),
      startsAtUnixMs: undefined,
      members: [
        { playerId: 'host-id', name: 'HOST', colorIndex: 0 },
        { playerId: 'guest-id', name: 'GUEST', colorIndex: 3 },
      ],
    })
  })

  it('accepts a payload with no startsAt key at all', () => {
    expect(parseRaceRoom(payload({ startsAt: undefined })).startsAtUnixMs).toBeUndefined()
  })

  it('rejects a payload that is not an object', () => {
    expect(() => parseRaceRoom(null), 'null').toThrow('Room response is invalid')
    expect(() => parseRaceRoom('RAFT23'), 'a string').toThrow('Room response is invalid')
    expect(() => parseRaceRoom([payload()]), 'an array').toThrow('Room response is invalid')
  })

  it('names a missing or empty string field', () => {
    for (const key of ['state', 'id', 'code', 'levelId', 'hostPlayerId', 'serverNow']) {
      expect(() => parseRaceRoom(payload({ [key]: undefined })), `${key} missing`)
        .toThrow(`Room response has no ${key}`)
      expect(() => parseRaceRoom(payload({ [key]: '' })), `${key} empty`)
        .toThrow(`Room response has no ${key}`)
    }
    expect(() => parseRaceRoom(payload({ state: 2 })), 'state is not a string')
      .toThrow('Room response has no state')
  })

  it('rejects a capacity that is not a finite number', () => {
    for (const maxPlayers of ['8', Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      expect(() => parseRaceRoom(payload({ maxPlayers })), `maxPlayers ${String(maxPlayers)}`)
        .toThrow('Room response has no numeric maxPlayers')
    }
  })

  it('rejects a payload whose members are not a list', () => {
    expect(() => parseRaceRoom(payload({ members: undefined })), 'members missing')
      .toThrow('Room response has no members')
    expect(
      () => parseRaceRoom(payload({ members: { 'host-id': { name: 'HOST' } } })),
      'members keyed by player id',
    ).toThrow('Room response has no members')
  })

  it('rejects a matchmaking flag that is not a boolean', () => {
    expect(() => parseRaceRoom(payload({ matchmaking: undefined })), 'matchmaking missing')
      .toThrow('Room response has no matchmaking mode')
    expect(() => parseRaceRoom(payload({ matchmaking: 'true' })), 'matchmaking as a string')
      .toThrow('Room response has no matchmaking mode')
  })

  it('rejects a start time that does not parse as a date', () => {
    expect(() => parseRaceRoom(payload({ startsAt: 'soon' })), 'an unparseable string')
      .toThrow('Room response has an invalid start time')
    expect(
      () => parseRaceRoom(payload({ startsAt: Date.parse('2026-08-19T12:00:00.000Z') })),
      'a unix-millisecond number rather than an ISO string',
    ).toThrow('Room response has an invalid start time')
  })

  it('rejects a server time that does not parse as a date', () => {
    expect(() => parseRaceRoom(payload({ serverNow: 'now' })))
      .toThrow('Room response has an invalid server time')
  })

  it('rejects a member that is not an object', () => {
    expect(() => parseRaceRoom(payload({ members: [null] })), 'a null member')
      .toThrow('Room response contains an invalid member')
    expect(() => parseRaceRoom(payload({ members: [['host-id', 'HOST', 0]] })), 'a tuple member')
      .toThrow('Room response contains an invalid member')
  })

  it('names the field a malformed member is missing', () => {
    const host = { playerId: 'host-id', name: 'HOST', colorIndex: 0 }
    expect(() => parseRaceRoom(payload({ members: [{ ...host, playerId: '' }] })))
      .toThrow('Room response has no playerId')
    expect(() => parseRaceRoom(payload({ members: [{ ...host, name: undefined }] })))
      .toThrow('Room response has no name')
    expect(() => parseRaceRoom(payload({ members: [{ ...host, colorIndex: '0' }] })))
      .toThrow('Room response has no numeric colorIndex')
  })
})

describe('server clock alignment', () => {
  it('uses the request midpoint to estimate clock skew', () => {
    expect(estimateServerClockOffset(10_100, 4_000, 4_200)).toBe(6_000)
  })

  it('schedules the same countdown even when the local clock is behind', () => {
    const offset = estimateServerClockOffset(10_100, 4_000, 4_200)
    expect(scheduledCountdownMs(13_000, 4_200, offset)).toBe(2_800)
    expect(scheduledCountdownMs(13_000, 7_100, offset)).toBe(0)
  })
})
