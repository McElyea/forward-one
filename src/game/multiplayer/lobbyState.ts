import type { HostedPlayerState } from '../race/HostedRaceSession'
import { isRecord, type LobbyMember, type LobbySnapshot, type RaceRoom } from './roomProtocol'

/** How a paddler announces themselves on the room channel while the lobby is open. */
export interface PresentPaddler {
  playerId: string
  name: string
  colorIndex: number
  ready: boolean
}

/** A `player-state` broadcast, once it has been vouched for. */
export interface PlayerStateUpdate {
  playerId: string
  state: HostedPlayerState
}

/** A race needs someone to race against, so the host cannot start alone. */
export const MIN_RACE_PADDLERS = 2

export function parsePresence(value: unknown): PresentPaddler | undefined {
  if (!isRecord(value)) return undefined
  const { playerId, name, colorIndex, ready } = value
  if (
    typeof playerId !== 'string' ||
    typeof name !== 'string' ||
    typeof colorIndex !== 'number' ||
    typeof ready !== 'boolean'
  ) {
    return undefined
  }
  return { playerId, name, colorIndex, ready }
}

export function parsePlayerState(value: unknown): PlayerStateUpdate | undefined {
  if (!isRecord(value)) return undefined
  const { playerId, survivalMs, eliminated } = value
  if (
    typeof playerId !== 'string' ||
    typeof survivalMs !== 'number' ||
    typeof eliminated !== 'boolean'
  ) {
    return undefined
  }
  return { playerId, state: { survivalMs, eliminated } }
}

/**
 * The room's roster is what the database last told us; presence is who is on the
 * channel right now. A paddler who is present speaks for their own row, and one
 * who is present without being on the roster yet is appended rather than dropped.
 */
export function mergeLobbyMembers(
  room: RaceRoom,
  present: ReadonlyMap<string, PresentPaddler>,
): LobbyMember[] {
  const membersById = new Map(room.members.map((member) => [member.playerId, member]))
  for (const paddler of present.values()) {
    membersById.set(paddler.playerId, paddler)
  }

  return Array.from(membersById.values()).map((member) => {
    const paddler = present.get(member.playerId)
    return {
      playerId: member.playerId,
      name: member.name,
      colorIndex: member.colorIndex,
      ready: paddler?.ready ?? false,
      connected: paddler !== undefined,
    }
  })
}

/** Only the host starts a race, only with company, and only once everyone present is ready. */
export function canStartRace(snapshot: LobbySnapshot, localPlayerId: string): boolean {
  if (snapshot.room.hostPlayerId !== localPlayerId) return false
  const connected = snapshot.members.filter((member) => member.connected)
  return connected.length >= MIN_RACE_PADDLERS && connected.every((member) => member.ready)
}

/**
 * A start is announced once, on the transition from unscheduled to scheduled —
 * every later poll returns the same time and must not fire again.
 */
export function isNewlyScheduledStart(
  previousStartsAtUnixMs: number | undefined,
  startsAtUnixMs: number | undefined,
): startsAtUnixMs is number {
  return previousStartsAtUnixMs === undefined && startsAtUnixMs !== undefined
}
