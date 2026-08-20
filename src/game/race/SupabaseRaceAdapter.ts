import { RACER_COLORS } from '../ui/theme'
import type { RacerSnapshot, StrokeJudgment } from '../types'
import type { HostedPlayerState, HostedRaceSession } from './HostedRaceSession'
import type { RaceAdapter } from './RaceAdapter'

const RAIL_SPAN_MULTIPLIER = 2.25
const STATE_BROADCAST_INTERVAL_MS = 2_000

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

const racerColor = (colorIndex: number): number =>
  RACER_COLORS[Math.abs(Math.trunc(colorIndex)) % RACER_COLORS.length]

export class SupabaseRaceAdapter implements RaceAdapter {
  readonly kind = 'multiplayer' as const
  private readonly session: HostedRaceSession
  private survivalBaselineMs = 38_000
  private lastBroadcastAt = -STATE_BROADCAST_INTERVAL_MS
  private sentElimination = false

  constructor(session: HostedRaceSession) {
    this.session = session
  }

  start(survivalBaselineMs: number): { countdownMs: number } {
    this.survivalBaselineMs = survivalBaselineMs
    return {
      countdownMs: this.session.getCountdownMs(),
    }
  }

  recordStroke(_judgment: StrokeJudgment): void {}

  update(
    elapsedMs: number,
    localProgress: number,
    localEliminated = false,
  ): RacerSnapshot[] {
    this.broadcastLocalState(elapsedMs, localEliminated)
    const railSpanMs = this.survivalBaselineMs * RAIL_SPAN_MULTIPLIER

    return this.session.getMembers().map((member) => {
      const isLocal = member.playerId === this.session.localPlayerId
      const remoteState = isLocal ? undefined : this.session.getPlayerState(member.playerId)
      const connected = isLocal || this.session.isConnected(member.playerId)
      const eliminated = isLocal ? localEliminated : (remoteState?.eliminated ?? false)
      const survivalMs = isLocal
        ? elapsedMs
        : eliminated || !connected
          ? (remoteState?.survivalMs ?? 0)
          : elapsedMs

      return {
        id: member.playerId,
        name: isLocal ? 'YOU' : member.name.toUpperCase(),
        color: racerColor(member.colorIndex),
        progress: isLocal ? localProgress : clamp(survivalMs / railSpanMs),
        survivalMs,
        eliminated,
        isLocal,
        connected,
      }
    })
  }

  destroy(): void {
    this.session.destroy()
  }

  private broadcastLocalState(elapsedMs: number, eliminated: boolean): void {
    if (this.session.getCountdownMs() > 0) return
    const eliminationChanged = eliminated && !this.sentElimination
    if (!eliminationChanged && elapsedMs - this.lastBroadcastAt < STATE_BROADCAST_INTERVAL_MS) {
      return
    }

    const state: HostedPlayerState = { survivalMs: elapsedMs, eliminated }
    this.session.sendPlayerState(state)
    this.lastBroadcastAt = elapsedMs
    this.sentElimination = this.sentElimination || eliminated
  }
}
