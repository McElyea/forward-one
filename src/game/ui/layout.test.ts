import { describe, expect, it } from 'vitest'
import {
  MIN_TOUCH_PX,
  gutter,
  layoutMode,
  menuLayout,
  riverLayout,
  typography,
  type Rect,
} from './layout'

/** Real CSS-pixel viewports, both orientations, plus a desktop and a floor case. */
const VIEWPORTS: Array<{ name: string; width: number; height: number }> = [
  { name: 'iPhone SE portrait', width: 375, height: 667 },
  { name: 'iPhone SE landscape', width: 667, height: 375 },
  { name: 'iPhone 15 portrait', width: 393, height: 852 },
  { name: 'iPhone 15 landscape', width: 852, height: 393 },
  { name: 'Pixel 7 portrait', width: 412, height: 915 },
  { name: 'Pixel 7 landscape', width: 915, height: 412 },
  { name: 'Galaxy S22 Ultra portrait', width: 384, height: 854 },
  { name: 'Galaxy S22 Ultra landscape', width: 854, height: 384 },
  { name: 'small phone portrait', width: 320, height: 568 },
  { name: 'tablet portrait', width: 834, height: 1112 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide desktop', width: 1920, height: 1080 },
]

const LEVEL_COUNT = 4
const VOICE_COUNT = 4

const shorterSide = (rect: Rect): number => Math.min(rect.width, rect.height)

const within = (rect: Rect, width: number, height: number): boolean =>
  rect.x >= 0 &&
  rect.y >= 0 &&
  rect.x + rect.width <= width + 1 &&
  rect.y + rect.height <= height + 1

describe('layoutMode', () => {
  it('calls a square viewport landscape and a taller one portrait', () => {
    expect(layoutMode(600, 600)).toBe('landscape')
    expect(layoutMode(599, 600)).toBe('portrait')
    expect(layoutMode(900, 400)).toBe('landscape')
  })
})

describe('typography', () => {
  it.each(VIEWPORTS)('keeps body text readable on $name', ({ width, height }) => {
    const type = typography(width, height)

    // 12px is the floor below which the HUD stops being legible at arm's length.
    expect(type.body).toBeGreaterThanOrEqual(12)
    expect(type.label).toBeGreaterThanOrEqual(11)
    // Sizes stay ordered, so no heading ever renders smaller than body text.
    expect(type.hero).toBeGreaterThan(type.title)
    expect(type.title).toBeGreaterThanOrEqual(type.heading)
    expect(type.heading).toBeGreaterThanOrEqual(type.body)
    expect(type.body).toBeGreaterThanOrEqual(type.label)
  })

  it('does not blow up the hero size on a huge display', () => {
    expect(typography(3840, 2160).hero).toBeLessThanOrEqual(68)
  })
})

describe('menuLayout', () => {
  it.each(VIEWPORTS)('gives every menu target a touchable size on $name', ({ width, height }) => {
    const layout = menuLayout(width, height, LEVEL_COUNT, VOICE_COUNT)

    for (const card of layout.cards) {
      expect(shorterSide(card)).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
    }
    for (const button of layout.modeButtons) {
      expect(shorterSide(button)).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
    }
    for (const button of layout.voiceButtons) {
      expect(shorterSide(button)).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
    }
  })

  it.each(VIEWPORTS)('keeps every menu element on screen on $name', ({ width, height }) => {
    const layout = menuLayout(width, height, LEVEL_COUNT, VOICE_COUNT)

    for (const rect of [
      ...layout.cards,
      ...layout.modeButtons,
      ...layout.voiceButtons,
      layout.voicePanel,
    ]) {
      expect(within(rect, width, height)).toBe(true)
    }
    expect(layout.hint.y).toBeLessThanOrEqual(height)
  })

  it('produces one card per level, and stacks them into two columns in portrait', () => {
    const portrait = menuLayout(393, 852, LEVEL_COUNT, VOICE_COUNT)
    const landscape = menuLayout(852, 393, LEVEL_COUNT, VOICE_COUNT)

    expect(portrait.cards).toHaveLength(LEVEL_COUNT)
    expect(landscape.cards).toHaveLength(LEVEL_COUNT)
    expect(portrait.cardColumns).toBe(2)
    expect(landscape.cardColumns).toBe(4)
  })

  it('lays cards out in reading order without overlapping', () => {
    const layout = menuLayout(393, 852, LEVEL_COUNT, VOICE_COUNT)
    const [first, second, third] = layout.cards

    expect(second.x).toBeGreaterThan(first.x) // same row, next column
    expect(third.y).toBeGreaterThanOrEqual(first.y + first.height) // next row
  })

  it.each(VIEWPORTS)('leaves the level description room to render on $name', ({
    width,
    height,
  }) => {
    const layout = menuLayout(width, height, LEVEL_COUNT, VOICE_COUNT)

    // Sizing the cards from width alone used to squeeze this to zero on a
    // landscape phone and on a small portrait one, hiding the description
    // entirely. Two wrapped lines of body text is the floor.
    expect(layout.detail.height).toBeGreaterThanOrEqual(layout.type.body * 2)
    expect(layout.detail.width).toBeGreaterThan(0)
  })

  it.each(VIEWPORTS)('stacks header, cards and description in order on $name', ({
    width,
    height,
  }) => {
    const layout = menuLayout(width, height, LEVEL_COUNT, VOICE_COUNT)
    const lastCard = layout.cards[layout.cards.length - 1]

    expect(layout.cards[0].y).toBeGreaterThanOrEqual(layout.sectionLabel.y)
    expect(layout.detail.y).toBeGreaterThanOrEqual(lastCard.y + lastCard.height)
  })

  it('shares one row between the mode buttons and the voice panel in landscape', () => {
    const layout = menuLayout(852, 393, LEVEL_COUNT, VOICE_COUNT)
    const [, secondMode] = layout.modeButtons

    // Side by side, not stacked — a landscape phone has no height to spare.
    expect(layout.voicePanel.x).toBeGreaterThanOrEqual(secondMode.x + secondMode.width)
    expect(layout.voicePanel.y).toBeLessThan(secondMode.y + secondMode.height)
  })

  it('stacks the voice panel below the mode buttons in portrait', () => {
    const layout = menuLayout(393, 852, LEVEL_COUNT, VOICE_COUNT)
    const [firstMode] = layout.modeButtons

    expect(layout.voicePanel.y).toBeGreaterThanOrEqual(firstMode.y + firstMode.height)
  })
})

describe('riverLayout', () => {
  it.each(VIEWPORTS)('keeps both paddle controls touchable on $name', ({ width, height }) => {
    const { controls } = riverLayout(width, height)

    expect(shorterSide(controls.forward)).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
    expect(shorterSide(controls.backward)).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
    expect(controls.backward.x).toBeGreaterThan(controls.forward.x)
  })

  it.each(VIEWPORTS)('never puts anything under the top bar on $name', ({ width, height }) => {
    const layout = riverLayout(width, height)

    expect(layout.topBar.y + layout.topBar.height).toBeLessThanOrEqual(layout.river.y)
    expect(layout.river.height).toBeGreaterThan(0)
    expect(layout.controls.forward.y + layout.controls.forward.height).toBeLessThanOrEqual(height)
  })

  it.each(VIEWPORTS.filter((v) => !riverLayout(v.width, v.height).controlsOverlay))(
    'stacks river, lane and controls without overlapping on $name',
    ({ width, height }) => {
      const layout = riverLayout(width, height)

      expect(layout.river.y + layout.river.height).toBeLessThanOrEqual(layout.rhythmLane.y)
      expect(layout.rhythmLane.y + layout.rhythmLane.height).toBeLessThanOrEqual(
        layout.controls.forward.y,
      )
    },
  )

  it.each(VIEWPORTS.filter((v) => riverLayout(v.width, v.height).controlsOverlay))(
    'floats the lane and controls over the river without colliding on $name',
    ({ width, height }) => {
      const layout = riverLayout(width, height)
      const { river, rhythmLane, controls } = layout

      // Both sit inside the river, which now runs the full height beneath the
      // top bar rather than being squeezed between reserved bands.
      for (const rect of [rhythmLane, controls.forward, controls.backward]) {
        expect(rect.x).toBeGreaterThanOrEqual(river.x)
        expect(rect.x + rect.width).toBeLessThanOrEqual(river.x + river.width + 1)
        expect(rect.y).toBeGreaterThanOrEqual(river.y)
        expect(rect.y + rect.height).toBeLessThanOrEqual(river.y + river.height + 1)
      }
      // The lane threads between the two paddle zones; nothing overlaps.
      expect(rhythmLane.x).toBeGreaterThanOrEqual(controls.forward.x + controls.forward.width)
      expect(rhythmLane.x + rhythmLane.width).toBeLessThanOrEqual(controls.backward.x)
      expect(rhythmLane.width).toBeGreaterThan(0)
    },
  )

  it('gives the world most of a landscape phone screen', () => {
    const layout = riverLayout(852, 393)
    const share = (layout.river.width * layout.river.height) / (852 * 393)

    expect(layout.controlsOverlay).toBe(true)
    // Reserving bands for the lane and controls left the river 42% of the
    // screen, which read as a letterbox slit on a real phone.
    expect(share).toBeGreaterThan(0.75)
  })

  it('keeps the stacked layout on a desktop, where there is height to spare', () => {
    expect(riverLayout(1440, 900).controlsOverlay).toBe(false)
    expect(riverLayout(393, 852).controlsOverlay).toBe(false)
  })

  it.each(VIEWPORTS)('keeps every river element on screen on $name', ({ width, height }) => {
    const layout = riverLayout(width, height)

    for (const rect of [
      layout.topBar,
      layout.river,
      layout.rail,
      layout.rhythmLane,
      layout.controls.forward,
      layout.controls.backward,
    ]) {
      expect(within(rect, width, height)).toBe(true)
    }
  })

  it('puts the rival rail down the side in landscape and across the top in portrait', () => {
    const landscape = riverLayout(852, 393)
    const portrait = riverLayout(393, 852)

    expect(landscape.railAxis).toBe('vertical')
    expect(landscape.rail.height).toBeGreaterThan(landscape.rail.width)
    // The rail sits beside the river, never on top of it.
    expect(landscape.river.x + landscape.river.width).toBeLessThanOrEqual(landscape.rail.x)

    expect(portrait.railAxis).toBe('horizontal')
    expect(portrait.rail.width).toBeGreaterThan(portrait.rail.height)
    expect(portrait.rail.y + portrait.rail.height).toBeLessThanOrEqual(portrait.river.y)
  })

  it('places the timing line inside the rhythm lane with room to approach', () => {
    for (const { width, height } of VIEWPORTS) {
      const layout = riverLayout(width, height)
      expect(layout.targetX).toBeGreaterThan(layout.rhythmLane.x)
      expect(layout.targetX).toBeLessThan(layout.rhythmLane.x + layout.rhythmLane.width)
    }
  })

  it('centres the call text and the raft on the river, not on the whole canvas', () => {
    const landscape = riverLayout(852, 393)
    const riverCentre = landscape.river.x + landscape.river.width / 2

    expect(landscape.call.x).toBe(Math.round(riverCentre))
    expect(landscape.raft.x).toBe(Math.round(riverCentre))
    // The rail steals width on the right, so the centre is left of the canvas centre.
    expect(landscape.call.x).toBeLessThan(852 / 2)
  })

  it.each(VIEWPORTS)('keeps the survival status inside the river on $name', ({ width, height }) => {
    const layout = riverLayout(width, height)

    expect(layout.survivalStatus.x).toBeGreaterThanOrEqual(layout.river.x)
    expect(layout.survivalStatus.x).toBeLessThanOrEqual(layout.river.x + layout.river.width)
    expect(layout.survivalStatus.y).toBeGreaterThanOrEqual(layout.river.y)
    expect(layout.survivalStatus.y).toBeLessThanOrEqual(layout.river.y + layout.river.height)
  })
})

describe('gutter', () => {
  it('stays proportional but bounded', () => {
    expect(gutter(320, 568)).toBeGreaterThanOrEqual(12)
    expect(gutter(3840, 2160)).toBeLessThanOrEqual(34)
  })
})
