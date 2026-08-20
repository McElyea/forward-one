import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ROOM_CAPACITY,
  isRoomCode,
  MAX_ROOM_CAPACITY,
  normalizeRoomCode,
  ROOM_CAPACITY_OPTIONS,
  sanitizePlayerName,
  validateRoomCapacity,
} from './roomPolicy'

describe('room policy', () => {
  it('defaults to eight and offers presets through the 64-player ceiling', () => {
    expect(DEFAULT_ROOM_CAPACITY).toBe(8)
    expect(ROOM_CAPACITY_OPTIONS).toEqual([8, 16, 32, 64])
    expect(MAX_ROOM_CAPACITY).toBe(64)
  })

  it('accepts any whole capacity from two through 64', () => {
    expect(validateRoomCapacity(2)).toBe(2)
    expect(validateRoomCapacity(13)).toBe(13)
    expect(validateRoomCapacity(64)).toBe(64)
  })

  it.each([1, 65, 8.5, Number.NaN])('rejects an invalid capacity of %s', (capacity) => {
    expect(() => validateRoomCapacity(capacity)).toThrow('Room capacity')
  })

  it('normalizes invite codes while excluding ambiguous characters', () => {
    expect(normalizeRoomCode(' ab-cd23! ')).toBe('ABCD23')
    expect(isRoomCode('ABCD23')).toBe(true)
    expect(isRoomCode('ABCDO1')).toBe(false)
    expect(isRoomCode('SHORT')).toBe(false)
  })

  it('keeps player names compact and display-safe', () => {
    expect(sanitizePlayerName('  River   Rat!  ')).toBe('River Rat')
    expect(sanitizePlayerName('Paddler_一号')).toBe('Paddler_一号')
    expect(sanitizePlayerName('abcdefghijklmnopqrstuvwxyz')).toHaveLength(18)
  })
})
