import { describe, expect, it } from 'vitest'
import roomsMigration from '../../../supabase/migrations/20260819000000_multiplayer_rooms.sql?raw'
import { LEVELS } from '../levels'
import {
  bodyStyle,
  COLORS,
  FONT_BODY,
  FONT_HEADING,
  headingStyle,
  hexToNumber,
  RACER_COLORS,
  TEXT_COLORS,
} from './theme'

describe('headingStyle', () => {
  it('sets the heading face in bold at the given pixel size', () => {
    expect(headingStyle(28, TEXT_COLORS.yellow)).toEqual({
      fontFamily: FONT_HEADING,
      fontSize: '28px',
      fontStyle: 'bold',
      color: TEXT_COLORS.yellow,
    })
  })

  it('defaults to the cream text colour', () => {
    expect(headingStyle(28).color).toBe(TEXT_COLORS.cream)
  })
})

describe('bodyStyle', () => {
  it('sets the body face at the given pixel size, without bold', () => {
    expect(bodyStyle(15, TEXT_COLORS.muted)).toEqual({
      fontFamily: FONT_BODY,
      fontSize: '15px',
      color: TEXT_COLORS.muted,
    })
  })

  it('defaults to the cream text colour', () => {
    expect(bodyStyle(15).color).toBe(TEXT_COLORS.cream)
  })
})

describe('TEXT_COLORS', () => {
  it('names the same colour as COLORS wherever both have an entry', () => {
    const numeric: Record<string, number> = COLORS
    for (const [name, hex] of Object.entries(TEXT_COLORS)) {
      if (!(name in numeric)) continue
      expect(hexToNumber(hex), `TEXT_COLORS.${name} and COLORS.${name}`).toBe(numeric[name])
    }
  })
})

describe('RACER_COLORS', () => {
  it('gives every seat the database can assign a colour of its own', () => {
    // race_room_members.color_index is constrained in the rooms migration, and
    // SupabaseRaceAdapter wraps an out-of-range index rather than rejecting it.
    const constraint = /color_index smallint not null check \(color_index between 0 and (\d+)\)/
      .exec(roomsMigration)
    if (constraint === null) {
      throw new Error('the color_index constraint could not be read — the format it is parsed from has changed')
    }
    const seats = Number(constraint[1]) + 1
    expect(RACER_COLORS, 'one racer colour per color_index').toHaveLength(seats)
    expect(new Set(RACER_COLORS).size, 'no two seats share a colour').toBe(seats)
  })

  it('starts with the shared yellow the solo and simulated races give the local paddler', () => {
    expect(RACER_COLORS[0]).toBe(COLORS.yellow)
  })
})

describe('hexToNumber', () => {
  it('converts a CSS hex string to the integer Phaser tints with', () => {
    expect(hexToNumber('#ffc857')).toBe(0xffc857)
  })

  it('accepts the same value with or without the leading hash', () => {
    expect(hexToNumber('ffc857')).toBe(hexToNumber('#ffc857'))
  })

  it('converts every level accent the scenes tint with', () => {
    // MenuScene and RiverScene run each level's `accent` through this.
    for (const level of LEVELS) {
      expect(hexToNumber(level.accent)).toBe(Number.parseInt(level.accent.slice(1), 16))
    }
  })

  it('agrees with the numeric palette on the shared yellow', () => {
    expect(hexToNumber(LEVELS[0].accent)).toBe(COLORS.yellow)
  })

  it('handles the extremes of the range', () => {
    expect(hexToNumber('#000000')).toBe(0x000000)
    expect(hexToNumber('#ffffff')).toBe(0xffffff)
  })
})
