import type Phaser from 'phaser'

export const COLORS = {
  ink: 0x071f26,
  inkSoft: 0x0d3037,
  cream: 0xf5f1df,
  muted: 0x9bb9b4,
  water: 0x167b91,
  waterLight: 0x55c3cc,
  bank: 0x2d5947,
  bankLight: 0x47775c,
  yellow: 0xffc857,
}

export const FONT_HEADING = '"Barlow Condensed", Impact, sans-serif'
export const FONT_BODY = 'Inter, Arial, sans-serif'

export function headingStyle(size: number, color = '#f5f1df'): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_HEADING,
    fontSize: `${size}px`,
    fontStyle: 'bold',
    color,
  }
}

export function bodyStyle(size: number, color = '#f5f1df'): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_BODY,
    fontSize: `${size}px`,
    color,
  }
}

export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16)
}
