import { MIN_RACE_PADDLERS } from './lobbyState'
import type { LobbyMember, LobbySnapshot } from './roomProtocol'

/**
 * What the room view says while a lobby is open.
 *
 * The wording was assembled inline in `LobbyScene.renderLobby()`, where the two
 * things worth checking could not be: that a room too tall for its region still
 * accounts for the paddlers it cut, and that the queue quotes the threshold a
 * race actually starts at rather than a number typed into a sentence.
 */

/** Roster lines are drawn an interline gap taller than the type they use. */
const LINE_SPACING = 1.4

/** However short the members region gets, a roster still shows two paddlers. */
const MIN_ROSTER_LINES = 2

/** The heading, the line under it, and one line per paddler on the channel. */
export interface LobbyRoster {
  heading: string
  subheading: string
  lines: string[]
}

/** What the local client knows about the room that the snapshot does not. */
export interface LobbyRosterView {
  /** How many paddler lines fit — `rosterLineLimit()` is where it comes from. */
  lineLimit: number
  localIsHost: boolean
}

/**
 * The room's roster is who the database last saw; only the paddlers currently on
 * the channel are worth listing.
 */
export function connectedPaddlers(snapshot: LobbySnapshot): LobbyMember[] {
  return snapshot.members.filter((member) => member.connected)
}

/** How many roster lines a members region `heightPx` tall fits at `bodySizePx` type. */
export function rosterLineLimit(heightPx: number, bodySizePx: number): number {
  return Math.max(MIN_ROSTER_LINES, Math.floor(heightPx / (bodySizePx * LINE_SPACING)))
}

export function lobbyRoster(snapshot: LobbySnapshot, view: LobbyRosterView): LobbyRoster {
  const queue = snapshot.room.matchmaking
  const connected = connectedPaddlers(snapshot)
  const shown = connected.slice(0, Math.max(0, view.lineLimit))

  const lines = shown.map((member) => {
    const host = !queue && member.playerId === snapshot.room.hostPlayerId ? '  HOST' : ''
    const ready = queue ? 'IN QUEUE' : member.ready ? 'READY' : 'SETTING UP'
    return `${member.name.toUpperCase()}  /  ${ready}${host}`
  })
  // The paddlers who did not fit are counted rather than dropped, on a line of
  // their own past the limit the ones above it were held to.
  if (connected.length > shown.length) {
    lines.push(`+ ${connected.length - shown.length} MORE PADDLERS`)
  }

  return {
    heading: queue ? 'QUICK MATCH' : `ROOM ${snapshot.room.code}`,
    subheading: queue
      ? `${connected.length} IN QUEUE  /  AUTO-STARTS AT ${MIN_RACE_PADDLERS}`
      : `${connected.length} / ${snapshot.room.maxPlayers} PADDLERS  /  ` +
        `${view.localIsHost ? 'YOU ARE HOST' : 'WAITING FOR HOST'}`,
    lines,
  }
}
