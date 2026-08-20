import type { RaceRoomMember } from '../multiplayer/roomProtocol'

export interface HostedPlayerState {
  survivalMs: number
  eliminated: boolean
}

/** Transport-neutral session consumed by the race adapter after a lobby starts. */
export interface HostedRaceSession {
  readonly startsAtUnixMs: number
  readonly localPlayerId: string
  getCountdownMs(): number
  getMembers(): readonly RaceRoomMember[]
  isConnected(playerId: string): boolean
  getPlayerState(playerId: string): HostedPlayerState | undefined
  sendPlayerState(state: HostedPlayerState): void
  destroy(): void
}
