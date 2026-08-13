import { describe, expect, it } from 'vitest'
import { LEVELS } from '../levels'
import { COLORS, hexToNumber } from './theme'

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
