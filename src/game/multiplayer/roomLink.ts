import { isRoomCode, normalizeRoomCode } from './roomPolicy'
import type { RaceRoom } from './roomProtocol'

/** The query parameter an invite link carries its room code in. */
export const ROOM_QUERY_PARAM = 'room'

/**
 * The room code an invite link names, or `undefined` when it names none.
 *
 * The parameter is typed or pasted by people, so it is normalised the same way
 * the code field is — `abc-123` and `ABC123` are the same room — and anything
 * that still is not a room code afterwards counts as no invite at all.
 */
export function invitedRoomCode(href: string): string | undefined {
  const code = normalizeRoomCode(new URL(href).searchParams.get(ROOM_QUERY_PARAM) ?? '')
  return isRoomCode(code) ? code : undefined
}

/** `href` as a link that invites its reader into the room `code` names. */
export function withRoomCode(href: string, code: string): string {
  const url = new URL(href)
  url.searchParams.set(ROOM_QUERY_PARAM, code)
  return url.toString()
}

/** `href` with any invite removed, leaving every other parameter in place. */
export function withoutRoomCode(href: string): string {
  const url = new URL(href)
  url.searchParams.delete(ROOM_QUERY_PARAM)
  return url.toString()
}

/**
 * What the address bar should say once a room has been joined.
 *
 * A private room keeps its code in the address so reloading or sharing the page
 * leads back into it. A matchmaking room is one the server picked, so its code
 * is not worth handing out — the address drops any invite instead.
 */
export function joinedRoomHref(href: string, room: Pick<RaceRoom, 'code' | 'matchmaking'>): string {
  return room.matchmaking ? withoutRoomCode(href) : withRoomCode(href, room.code)
}
