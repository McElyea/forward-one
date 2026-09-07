import { describe, expect, it } from 'vitest'
import { connectedPaddlers, lobbyRoster, rosterLineLimit } from './lobbyRoster'
import { MIN_RACE_PADDLERS } from './lobbyState'
import type { LobbyMember, LobbySnapshot, RaceRoom } from './roomProtocol'

const member = (overrides: Partial<LobbyMember> = {}): LobbyMember => ({
  playerId: 'host-id',
  name: 'Rowan',
  colorIndex: 0,
  ready: false,
  connected: true,
  ...overrides,
})

const snapshot = (
  members: LobbyMember[],
  room: Partial<RaceRoom> = {},
): LobbySnapshot => ({
  room: {
    id: 'room-id',
    code: 'RAFT23',
    levelId: 'class-ii',
    maxPlayers: 8,
    hostPlayerId: 'host-id',
    matchmaking: false,
    state: 'lobby',
    serverNowUnixMs: Date.parse('2026-08-19T11:59:57.000Z'),
    members: members.map(({ playerId, name, colorIndex }) => ({ playerId, name, colorIndex })),
    ...room,
  },
  members,
})

const roomy = { lineLimit: 8, localIsHost: false }

describe('connectedPaddlers', () => {
  it('keeps only the paddlers currently on the channel', () => {
    const roster = connectedPaddlers(
      snapshot([
        member({ playerId: 'host-id', name: 'Rowan' }),
        member({ playerId: 'gone-id', name: 'Sam', connected: false }),
      ]),
    )

    expect(roster.map((paddler) => paddler.name)).toEqual(['Rowan'])
  })
})

describe('rosterLineLimit', () => {
  it('fits as many lines as the region has room for', () => {
    expect(rosterLineLimit(240, 16), '240px of region at 16px type').toBe(10)
  })

  it('never asks for a fraction of a line', () => {
    expect(rosterLineLimit(246, 16), '246px leaves a partial eleventh line').toBe(10)
  })

  it('shows two paddlers however short the region is', () => {
    expect(rosterLineLimit(0, 16), 'a region with no height at all').toBe(2)
    expect(rosterLineLimit(20, 16), 'a region under one line tall').toBe(2)
  })
})

describe('lobbyRoster in a private room', () => {
  it('heads the view with the code an invite carries', () => {
    expect(lobbyRoster(snapshot([member()]), roomy).heading).toBe('ROOM RAFT23')
  })

  it('counts the connected paddlers against the room capacity', () => {
    const view = lobbyRoster(
      snapshot([
        member({ playerId: 'host-id' }),
        member({ playerId: 'guest-id', name: 'Sam' }),
        member({ playerId: 'gone-id', name: 'Wren', connected: false }),
      ]),
      roomy,
    )

    expect(view.subheading).toBe('2 / 8 PADDLERS  /  WAITING FOR HOST')
  })

  it('says which side of the start button the local paddler is on', () => {
    const room = snapshot([member()])

    expect(lobbyRoster(room, { ...roomy, localIsHost: true }).subheading)
      .toContain('YOU ARE HOST')
    expect(lobbyRoster(room, { ...roomy, localIsHost: false }).subheading)
      .toContain('WAITING FOR HOST')
  })

  it('reads a paddler back with their readiness and marks the host', () => {
    const view = lobbyRoster(
      snapshot([
        member({ playerId: 'host-id', name: 'Rowan', ready: true }),
        member({ playerId: 'guest-id', name: 'Sam', ready: false }),
      ]),
      roomy,
    )

    expect(view.lines).toEqual([
      'ROWAN  /  READY  HOST',
      'SAM  /  SETTING UP',
    ])
  })
})

describe('lobbyRoster in the quick-match queue', () => {
  const queued = (members: LobbyMember[]): LobbySnapshot =>
    snapshot(members, { matchmaking: true })

  it('names the queue rather than a room nobody was invited to', () => {
    expect(lobbyRoster(queued([member()]), roomy).heading).toBe('QUICK MATCH')
  })

  it('quotes the threshold a race is actually started at', () => {
    expect(lobbyRoster(queued([member()]), roomy).subheading)
      .toBe(`1 IN QUEUE  /  AUTO-STARTS AT ${MIN_RACE_PADDLERS}`)
  })

  it('gives every paddler the same waiting state and no host', () => {
    const view = lobbyRoster(
      queued([
        member({ playerId: 'host-id', name: 'Rowan', ready: true }),
        member({ playerId: 'guest-id', name: 'Sam' }),
      ]),
      roomy,
    )

    expect(view.lines).toEqual([
      'ROWAN  /  IN QUEUE',
      'SAM  /  IN QUEUE',
    ])
  })
})

describe('lobbyRoster with more paddlers than lines', () => {
  const crowd = (count: number): LobbySnapshot =>
    snapshot(
      Array.from({ length: count }, (_unused, index) =>
        member({ playerId: `paddler-${index}`, name: `Paddler${index}` }),
      ),
      { maxPlayers: 64 },
    )

  it('counts the paddlers it had no room for', () => {
    const view = lobbyRoster(crowd(10), { ...roomy, lineLimit: 4 })

    expect(view.lines.slice(0, 4).every((line) => line.startsWith('PADDLER'))).toBe(true)
    expect(view.lines.at(-1), 'the six paddlers past the limit').toBe('+ 6 MORE PADDLERS')
  })

  it('spends the overflow line on top of the limit, not out of it', () => {
    // The count is drawn below a full list rather than displacing the last
    // paddler in it, so a truncated roster is one line taller than it asked for.
    expect(lobbyRoster(crowd(10), { ...roomy, lineLimit: 4 }).lines).toHaveLength(5)
  })

  it('leaves the count off when every paddler fits', () => {
    const view = lobbyRoster(crowd(4), { ...roomy, lineLimit: 4 })

    expect(view.lines).toHaveLength(4)
    expect(view.lines.join('\n')).not.toContain('MORE PADDLERS')
  })

  it('still counts them all when there is no room for a single line', () => {
    const view = lobbyRoster(crowd(3), { ...roomy, lineLimit: 0 })

    expect(view.lines).toEqual(['+ 3 MORE PADDLERS'])
  })
})
