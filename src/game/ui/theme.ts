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
  danger: 0xe84a5f,
  warning: 0xff9f5a,
  success: 0x73e2a7,
  rock: 0x6f7775,
  rockLight: 0xaab0aa,
  wood: 0x76533a,
}

export const TEXT_COLORS = {
  ink: '#071f26',
  cream: '#f5f1df',
  muted: '#9bb9b4',
  waterLight: '#55c3cc',
  yellow: '#ffc857',
  danger: '#e84a5f',
  warning: '#ff9f5a',
  success: '#73e2a7',
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
