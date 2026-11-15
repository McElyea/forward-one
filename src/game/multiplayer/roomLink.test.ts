import { describe, expect, it } from 'vitest'
import {
  invitedRoomCode,
  joinedRoomHref,
  ROOM_QUERY_PARAM,
  withoutRoomCode,
  withRoomCode,
} from './roomLink'

const PAGE = 'https://forward.one/play/'

describe('invitedRoomCode', () => {
  it('reads the room code an invite link carries', () => {
    expect(invitedRoomCode(`${PAGE}?room=RAFT42`)).toBe('RAFT42')
  })

  it('normalises a code typed in lower case with a separator', () => {
    expect(invitedRoomCode(`${PAGE}?room=raft-42`)).toBe('RAFT42')
  })

  it('finds the code among other parameters', () => {
    expect(invitedRoomCode(`${PAGE}?level=class-iii&room=RAFT42#lobby`)).toBe('RAFT42')
  })

  it('treats a page with no invite as no invite', () => {
    expect(invitedRoomCode(PAGE)).toBeUndefined()
  })

  it('treats an empty invite as no invite', () => {
    expect(invitedRoomCode(`${PAGE}?room=`)).toBeUndefined()
  })

  it('treats a code too short to be a room as no invite', () => {
    expect(invitedRoomCode(`${PAGE}?room=RAF`)).toBeUndefined()
  })

  it('treats a code using a character room codes never contain as no invite', () => {
    // Room codes skip 0, 1, I and O, which read as one another on a phone screen.
    expect(invitedRoomCode(`${PAGE}?room=RAFT10`)).toBeUndefined()
  })

  it('ignores a code carried under any other parameter', () => {
    expect(invitedRoomCode(`${PAGE}?code=RAFT42`)).toBeUndefined()
  })
})

describe('withRoomCode', () => {
  it('adds the code under the invite parameter', () => {
    expect(withRoomCode(PAGE, 'RAFT42')).toBe(`${PAGE}?${ROOM_QUERY_PARAM}=RAFT42`)
  })

  it('replaces an invite the page already carried', () => {
    expect(withRoomCode(`${PAGE}?room=WAVE77`, 'RAFT42')).toBe(`${PAGE}?room=RAFT42`)
  })

  it('keeps every other parameter and the fragment', () => {
    expect(withRoomCode(`${PAGE}?level=class-iii#lobby`, 'RAFT42')).toBe(
      `${PAGE}?level=class-iii&room=RAFT42#lobby`,
    )
  })

  it('makes a link invitedRoomCode reads back', () => {
    expect(invitedRoomCode(withRoomCode(PAGE, 'RAFT42'))).toBe('RAFT42')
  })
})

describe('withoutRoomCode', () => {
  it('drops the invite and keeps every other parameter and the fragment', () => {
    expect(withoutRoomCode(`${PAGE}?level=class-iii&room=RAFT42#lobby`)).toBe(
      `${PAGE}?level=class-iii#lobby`,
    )
  })

  it('leaves no query behind when the invite was the only parameter', () => {
    const href = withoutRoomCode(`${PAGE}?room=RAFT42`)
    expect(new URL(href).search).toBe('')
    expect(href).not.toContain(ROOM_QUERY_PARAM)
  })

  it('leaves a page with no invite as it was', () => {
    expect(withoutRoomCode(`${PAGE}?level=class-iii`)).toBe(`${PAGE}?level=class-iii`)
  })
})

describe('joinedRoomHref', () => {
  it('puts a private room code in the address so the page leads back into it', () => {
    expect(joinedRoomHref(PAGE, { code: 'RAFT42', matchmaking: false })).toBe(
      `${PAGE}?room=RAFT42`,
    )
  })

  it('keeps a matchmaking room code out of the address', () => {
    const href = joinedRoomHref(PAGE, { code: 'RAFT42', matchmaking: true })
    expect(invitedRoomCode(href)).toBeUndefined()
  })

  it('drops a stale invite on entering a matchmaking room', () => {
    const href = joinedRoomHref(`${PAGE}?room=WAVE77`, { code: 'RAFT42', matchmaking: true })
    expect(invitedRoomCode(href)).toBeUndefined()
  })
})
