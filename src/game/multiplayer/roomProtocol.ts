export type RaceRoomState = 'lobby' | 'countdown' | 'racing' | 'finished'

export interface RaceRoomMember {
  playerId: string
  name: string
  colorIndex: number
}

export interface RaceRoom {
  id: string
  code: string
  levelId: string
  maxPlayers: number
  hostPlayerId: string
  matchmaking: boolean
  state: RaceRoomState
  serverNowUnixMs: number
  startsAtUnixMs?: number
  members: RaceRoomMember[]
}

export interface LobbyMember extends RaceRoomMember {
  ready: boolean
  connected: boolean
}

export interface LobbySnapshot {
  room: RaceRoom
  members: LobbyMember[]
}

export function estimateServerClockOffset(
  serverNowUnixMs: number,
  requestedAtUnixMs: number,
  receivedAtUnixMs: number,
): number {
  return serverNowUnixMs - (requestedAtUnixMs + receivedAtUnixMs) / 2
}

export function scheduledCountdownMs(
  startsAtUnixMs: number,
  localNowUnixMs: number,
  serverClockOffsetMs: number,
): number {
  return Math.max(0, startsAtUnixMs - (localNowUnixMs + serverClockOffsetMs))
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const requiredString = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Room response has no ${key}`)
  }
  return value
}

const requiredNumber = (record: Record<string, unknown>, key: string): number => {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Room response has no numeric ${key}`)
  }
  return value
}

const parseMember = (value: unknown): RaceRoomMember => {
  if (!isRecord(value)) throw new Error('Room response contains an invalid member')
  return {
    playerId: requiredString(value, 'playerId'),
    name: requiredString(value, 'name'),
    colorIndex: requiredNumber(value, 'colorIndex'),
  }
}

export function parseRaceRoom(value: unknown): RaceRoom {
  if (!isRecord(value)) throw new Error('Room response is invalid')
  const state = requiredString(value, 'state')
  if (!['lobby', 'countdown', 'racing', 'finished'].includes(state)) {
    throw new Error(`Room response has an invalid state: ${state}`)
  }
  const members = value.members
  if (!Array.isArray(members)) throw new Error('Room response has no members')
  if (typeof value.matchmaking !== 'boolean') {
    throw new Error('Room response has no matchmaking mode')
  }

  const startsAt = value.startsAt
  const startsAtUnixMs = typeof startsAt === 'string' ? Date.parse(startsAt) : undefined
  if (startsAt !== null && startsAt !== undefined && !Number.isFinite(startsAtUnixMs)) {
    throw new Error('Room response has an invalid start time')
  }
  const serverNow = requiredString(value, 'serverNow')
  const serverNowUnixMs = Date.parse(serverNow)
  if (!Number.isFinite(serverNowUnixMs)) throw new Error('Room response has an invalid server time')

  return {
    id: requiredString(value, 'id'),
    code: requiredString(value, 'code'),
    levelId: requiredString(value, 'levelId'),
    maxPlayers: requiredNumber(value, 'maxPlayers'),
    hostPlayerId: requiredString(value, 'hostPlayerId'),
    matchmaking: value.matchmaking,
    state: state as RaceRoomState,
    serverNowUnixMs,
    startsAtUnixMs,
    members: members.map(parseMember),
  }
}
