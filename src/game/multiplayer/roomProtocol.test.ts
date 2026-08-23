import { describe, expect, it } from 'vitest'
import {
  estimateServerClockOffset,
  parseRaceRoom,
  scheduledCountdownMs,
} from './roomProtocol'

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
