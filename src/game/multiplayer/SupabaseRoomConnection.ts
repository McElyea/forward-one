import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { HostedPlayerState, HostedRaceSession } from '../race/HostedRaceSession'
import { getSupabaseClient } from './multiplayerConfig'
import {
  estimateServerClockOffset,
  type LobbyMember,
  type LobbySnapshot,
  parseRaceRoom,
  type RaceRoom,
  type RaceRoomMember,
  scheduledCountdownMs,
} from './roomProtocol'
import { normalizeRoomCode, sanitizePlayerName, validateRoomCapacity } from './roomPolicy'

interface PresencePayload {
  playerId: string
  name: string
  colorIndex: number
  ready: boolean
}

type LobbyListener = (snapshot: LobbySnapshot) => void
type StartListener = (startsAtUnixMs: number) => void

const ROOM_HEARTBEAT_MS = 20_000
const MATCHMAKING_POLL_MS = 2_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const presencePayload = (value: unknown): PresencePayload | undefined => {
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

const playerState = (value: unknown): { playerId: string; state: HostedPlayerState } | undefined => {
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

const resultData = (data: unknown, error: { message: string } | null): unknown => {
  if (error) throw new Error(error.message)
  if (data === null || data === undefined) throw new Error('The room service returned no data')
  return data
}

const clockOffsetFrom = (room: RaceRoom, requestedAt: number, receivedAt: number): number =>
  estimateServerClockOffset(room.serverNowUnixMs, requestedAt, receivedAt)

const ensurePlayerId = async (client: SupabaseClient): Promise<string> => {
  const current = await client.auth.getSession()
  if (current.error) throw new Error(current.error.message)
  const existingId = current.data.session?.user.id
  if (existingId) return existingId

  const signedIn = await client.auth.signInAnonymously()
  if (signedIn.error) throw new Error(signedIn.error.message)
  const playerId = signedIn.data.user?.id
  if (!playerId) throw new Error('Anonymous sign-in returned no player')
  return playerId
}

export class SupabaseRoomConnection implements HostedRaceSession {
  readonly localPlayerId: string
  private readonly client: SupabaseClient
  private readonly playerName: string
  private readonly channel: RealtimeChannel
  private readonly lobbyListeners = new Set<LobbyListener>()
  private readonly startListeners = new Set<StartListener>()
  private readonly connectedPresence = new Map<string, PresencePayload>()
  private readonly raceStates = new Map<string, HostedPlayerState>()
  private roomValue: RaceRoom
  private serverClockOffsetMs: number
  private localReady = false
  private closed = false
  private heartbeatTimer?: number

  private constructor(
    client: SupabaseClient,
    room: RaceRoom,
    localPlayerId: string,
    playerName: string,
    serverClockOffsetMs: number,
  ) {
    this.client = client
    this.roomValue = room
    this.localPlayerId = localPlayerId
    this.playerName = playerName
    this.serverClockOffsetMs = serverClockOffsetMs
    this.channel = client.channel(`race:${room.id}`, {
      config: {
        private: true,
        broadcast: { self: false },
        presence: { key: localPlayerId },
      },
    })
  }

  static async create(options: {
    levelId: string
    playerName: string
    maxPlayers: number
  }): Promise<SupabaseRoomConnection> {
    const client = getSupabaseClient()
    const localPlayerId = await ensurePlayerId(client)
    const playerName = sanitizePlayerName(options.playerName)
    if (!playerName) throw new Error('Enter a paddler name')

    const requestedAt = Date.now()
    const response = await client.rpc('create_race_room', {
      p_level_id: options.levelId,
      p_player_name: playerName,
      p_max_players: validateRoomCapacity(options.maxPlayers),
    })
    const receivedAt = Date.now()
    const room = parseRaceRoom(resultData(response.data, response.error))
    const connection = new SupabaseRoomConnection(
      client,
      room,
      localPlayerId,
      playerName,
      clockOffsetFrom(room, requestedAt, receivedAt),
    )
    try {
      await connection.connect()
      return connection
    } catch (error) {
      connection.destroy()
      throw error
    }
  }

  static async join(options: {
    code: string
    playerName: string
  }): Promise<SupabaseRoomConnection> {
    const client = getSupabaseClient()
    const localPlayerId = await ensurePlayerId(client)
    const playerName = sanitizePlayerName(options.playerName)
    if (!playerName) throw new Error('Enter a paddler name')

    const requestedAt = Date.now()
    const response = await client.rpc('join_race_room', {
      p_code: normalizeRoomCode(options.code),
      p_player_name: playerName,
    })
    const receivedAt = Date.now()
    const room = parseRaceRoom(resultData(response.data, response.error))
    const connection = new SupabaseRoomConnection(
      client,
      room,
      localPlayerId,
      playerName,
      clockOffsetFrom(room, requestedAt, receivedAt),
    )
    try {
      await connection.connect()
      return connection
    } catch (error) {
      connection.destroy()
      throw error
    }
  }

  static async quickMatch(options: {
    levelId: string
    playerName: string
  }): Promise<SupabaseRoomConnection> {
    const client = getSupabaseClient()
    const localPlayerId = await ensurePlayerId(client)
    const playerName = sanitizePlayerName(options.playerName)
    if (!playerName) throw new Error('Enter a paddler name')

    const requestedAt = Date.now()
    const response = await client.rpc('quick_match_race_room', {
      p_level_id: options.levelId,
      p_player_name: playerName,
    })
    const receivedAt = Date.now()
    const room = parseRaceRoom(resultData(response.data, response.error))
    const connection = new SupabaseRoomConnection(
      client,
      room,
      localPlayerId,
      playerName,
      clockOffsetFrom(room, requestedAt, receivedAt),
    )
    try {
      await connection.connect()
      return connection
    } catch (error) {
      connection.destroy()
      throw error
    }
  }

  get room(): RaceRoom {
    return this.roomValue
  }

  get startsAtUnixMs(): number {
    const startsAt = this.roomValue.startsAtUnixMs
    if (startsAt === undefined) throw new Error('The room has no scheduled start')
    return startsAt
  }

  get isHost(): boolean {
    return this.roomValue.hostPlayerId === this.localPlayerId
  }

  getCountdownMs(): number {
    return scheduledCountdownMs(this.startsAtUnixMs, Date.now(), this.serverClockOffsetMs)
  }

  get lobbySnapshot(): LobbySnapshot {
    const membersById = new Map(this.roomValue.members.map((member) => [member.playerId, member]))
    for (const present of this.connectedPresence.values()) {
      membersById.set(present.playerId, present)
    }

    const members: LobbyMember[] = Array.from(membersById.values()).map((member) => {
      const present = this.connectedPresence.get(member.playerId)
      return {
        playerId: member.playerId,
        name: member.name,
        colorIndex: member.colorIndex,
        ready: present?.ready ?? false,
        connected: present !== undefined,
      }
    })
    return { room: this.roomValue, members }
  }

  get canStart(): boolean {
    const connected = this.lobbySnapshot.members.filter((member) => member.connected)
    return this.isHost && connected.length >= 2 && connected.every((member) => member.ready)
  }

  getMembers(): readonly RaceRoomMember[] {
    return this.roomValue.members
  }

  isConnected(playerId: string): boolean {
    return this.connectedPresence.has(playerId)
  }

  getPlayerState(playerId: string): HostedPlayerState | undefined {
    return this.raceStates.get(playerId)
  }

  sendPlayerState(state: HostedPlayerState): void {
    if (this.closed) return
    void this.channel.send({
      type: 'broadcast',
      event: 'player-state',
      payload: { playerId: this.localPlayerId, ...state },
    })
  }

  onLobbyChange(listener: LobbyListener): () => void {
    this.lobbyListeners.add(listener)
    listener(this.lobbySnapshot)
    return () => this.lobbyListeners.delete(listener)
  }

  onStart(listener: StartListener): () => void {
    this.startListeners.add(listener)
    if (this.roomValue.startsAtUnixMs !== undefined) listener(this.roomValue.startsAtUnixMs)
    return () => this.startListeners.delete(listener)
  }

  async setReady(ready: boolean): Promise<void> {
    this.localReady = ready
    await this.trackPresence()
  }

  async startRace(): Promise<void> {
    if (!this.canStart) throw new Error('Every connected paddler must be ready')
    const requestedAt = Date.now()
    const response = await this.client.rpc('start_race_room', { p_room_id: this.roomValue.id })
    const receivedAt = Date.now()
    this.roomValue = parseRaceRoom(resultData(response.data, response.error))
    this.serverClockOffsetMs = clockOffsetFrom(this.roomValue, requestedAt, receivedAt)
    const startsAtUnixMs = this.startsAtUnixMs
    await this.channel.send({
      type: 'broadcast',
      event: 'race-start',
      payload: { startsAtUnixMs },
    })
    this.emitLobby()
    this.emitStart(startsAtUnixMs)
  }

  async leave(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.lobbyListeners.clear()
    this.startListeners.clear()
    try {
      await this.client.rpc('leave_race_room', { p_room_id: this.roomValue.id })
      await this.channel.send({ type: 'broadcast', event: 'room-changed', payload: {} })
    } finally {
      if (this.heartbeatTimer !== undefined) window.clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
      await this.channel.untrack()
      await this.client.removeChannel(this.channel)
    }
  }

  destroy(): void {
    void this.leave().catch(() => undefined)
  }

  private async connect(): Promise<void> {
    this.channel
      .on('presence', { event: 'sync' }, () => this.syncPresence())
      .on('broadcast', { event: 'room-changed' }, () => {
        void this.refreshRoom().catch(() => undefined)
      })
      .on('broadcast', { event: 'race-start' }, ({ payload }) => {
        if (!isRecord(payload) || typeof payload.startsAtUnixMs !== 'number') return
        void this.receiveRaceStart(payload.startsAtUnixMs)
      })
      .on('broadcast', { event: 'player-state' }, ({ payload }) => {
        const update = playerState(payload)
        if (update) this.raceStates.set(update.playerId, update.state)
      })

    await new Promise<void>((resolve, reject) => {
      this.channel.subscribe((status, error) => {
        if (status === 'SUBSCRIBED') resolve()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(error ?? new Error(`Room connection failed: ${status}`))
        }
      })
    })
    await this.trackPresence()
    await this.channel.send({ type: 'broadcast', event: 'room-changed', payload: {} })
    this.startHeartbeat(
      this.roomValue.matchmaking && this.roomValue.startsAtUnixMs === undefined
        ? MATCHMAKING_POLL_MS
        : ROOM_HEARTBEAT_MS,
    )
  }

  private startHeartbeat(intervalMs: number): void {
    if (this.heartbeatTimer !== undefined) window.clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = window.setInterval(() => {
      void this.touchRoom().catch(() => undefined)
    }, intervalMs)
  }

  private async trackPresence(): Promise<void> {
    const member = this.roomValue.members.find(
      (candidate) => candidate.playerId === this.localPlayerId,
    )
    await this.channel.track({
      playerId: this.localPlayerId,
      name: this.playerName,
      colorIndex: member?.colorIndex ?? 0,
      ready: this.localReady,
    })
  }

  private syncPresence(): void {
    this.connectedPresence.clear()
    const state: unknown = this.channel.presenceState()
    if (isRecord(state)) {
      for (const entries of Object.values(state)) {
        if (!Array.isArray(entries)) continue
        for (const entry of entries) {
          const parsed = presencePayload(entry)
          if (parsed) this.connectedPresence.set(parsed.playerId, parsed)
        }
      }
    }
    this.emitLobby()
  }

  private async refreshRoom(): Promise<void> {
    const previousStartsAtUnixMs = this.roomValue.startsAtUnixMs
    const requestedAt = Date.now()
    const response = await this.client.rpc('get_race_room', { p_room_id: this.roomValue.id })
    const receivedAt = Date.now()
    this.roomValue = parseRaceRoom(resultData(response.data, response.error))
    this.serverClockOffsetMs = clockOffsetFrom(this.roomValue, requestedAt, receivedAt)
    this.emitLobby()
    this.emitNewStart(previousStartsAtUnixMs)
  }

  private async touchRoom(): Promise<void> {
    const previousStartsAtUnixMs = this.roomValue.startsAtUnixMs
    const requestedAt = Date.now()
    const response = await this.client.rpc('touch_race_room', { p_room_id: this.roomValue.id })
    const receivedAt = Date.now()
    this.roomValue = parseRaceRoom(resultData(response.data, response.error))
    this.serverClockOffsetMs = clockOffsetFrom(this.roomValue, requestedAt, receivedAt)
    this.emitLobby()
    this.emitNewStart(previousStartsAtUnixMs)
  }

  private emitNewStart(previousStartsAtUnixMs: number | undefined): void {
    const startsAtUnixMs = this.roomValue.startsAtUnixMs
    if (previousStartsAtUnixMs !== undefined || startsAtUnixMs === undefined) return
    this.startHeartbeat(ROOM_HEARTBEAT_MS)
    this.emitStart(startsAtUnixMs)
  }

  private async receiveRaceStart(startsAtUnixMs: number): Promise<void> {
    this.roomValue = {
      ...this.roomValue,
      state: 'countdown',
      startsAtUnixMs,
    }
    try {
      await this.refreshRoom()
    } catch {
      this.emitLobby()
    }
    this.emitStart(this.roomValue.startsAtUnixMs ?? startsAtUnixMs)
  }

  private emitLobby(): void {
    const snapshot = this.lobbySnapshot
    for (const listener of this.lobbyListeners) listener(snapshot)
  }

  private emitStart(startsAtUnixMs: number): void {
    for (const listener of this.startListeners) listener(startsAtUnixMs)
  }
}
