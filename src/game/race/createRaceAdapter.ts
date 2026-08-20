import type { RaceMode } from '../types'
import type { HostedRaceSession } from './HostedRaceSession'
import type { RaceAdapter } from './RaceAdapter'
import { SimulatedRaceAdapter } from './SimulatedRaceAdapter'
import { SoloRaceAdapter } from './SoloRaceAdapter'
import { SupabaseRaceAdapter } from './SupabaseRaceAdapter'

export function createRaceAdapter(
  mode: RaceMode,
  hostedSession?: HostedRaceSession,
): RaceAdapter {
  if (mode === 'solo') return new SoloRaceAdapter()
  if (mode === 'multiplayer-preview') return new SimulatedRaceAdapter()
  if (!hostedSession) throw new Error('A multiplayer race needs a hosted room session')
  return new SupabaseRaceAdapter(hostedSession)
}
