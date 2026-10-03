import type Phaser from 'phaser'

export const COLORS = {
  ink: 0x071f26,
  inkSoft: 0x0d3037,
  control: 0x1a4a52,
  /** Hover fill of a control, and the caption ink on a yellow button. */
  controlDark: 0x16424a,
  /** Panel, card and lane stroke. */
  border: 0x31545a,
  cream: 0xf5f1df,
  muted: 0x9bb9b4,
  mutedDark: 0x688e87,
  water: 0x167b91,
  waterLight: 0x55c3cc,
  bank: 0x2d5947,
  bankLight: 0x47775c,
  yellow: 0xffc857,
  /** Hover fill of a yellow button. */
  yellowHover: 0xffd979,
  danger: 0xe84a5f,
  warning: 0xff9f5a,
  success: 0x73e2a7,
  rock: 0x6f7775,
  rockLight: 0xaab0aa,
  wood: 0x76533a,
}

export const TEXT_COLORS = {
  ink: '#071f26',
  controlDark: '#16424a',
  cream: '#f5f1df',
  muted: '#9bb9b4',
  mutedDark: '#688e87',
  waterLight: '#55c3cc',
  yellow: '#ffc857',
  danger: '#e84a5f',
  warning: '#ff9f5a',
  success: '#73e2a7',
}

/** Stable room colours. Large rooms reuse the palette rather than inventing inline scene colours. */
export const RACER_COLORS = [
  COLORS.yellow,
  0x56d6c9,
  0xef6f9f,
  0xb695ff,
  0xff8f70,
  0x7eb6ff,
  0x9be564,
  0xf7aef8,
  0xf4d35e,
  0x5dd39e,
  0xee6c4d,
  0x8d99ae,
  0xc77dff,
  0x48cae4,
  0xffc6ff,
  0xa7c957,
] as const

export const FONT_HEADING = '"Barlow Condensed", Impact, sans-serif'
export const FONT_BODY = 'Inter, Arial, sans-serif'

export function headingStyle(size: number, color = TEXT_COLORS.cream): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_HEADING,
    fontSize: `${size}px`,
    fontStyle: 'bold',
    color,
  }
}

export function bodyStyle(size: number, color = TEXT_COLORS.cream): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_BODY,
    fontSize: `${size}px`,
    color,
  }
}

export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16)
}

/** The inverse of `hexToNumber()`: a palette number as the CSS string text and DOM styles take. */
export function numberToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}
