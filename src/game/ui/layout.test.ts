import { describe, expect, it } from 'vitest'
import {
  LINE_HEIGHT,
  MIN_TOUCH_PX,
  descriptionLineSpacing,
  gutter,
  layoutMode,
  levelCardText,
  lobbyLayout,
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

  it('stops every size at its ceiling on a huge display', () => {
    expect(typography(3840, 2160)).toEqual({ hero: 68, title: 36, heading: 24, body: 18, label: 15 })
  })

  it('holds every size at its floor on a tiny viewport', () => {
    expect(typography(200, 100)).toEqual({ hero: 30, title: 19, heading: 14, body: 12, label: 11 })
  })

  it('keys landscape off the height, whatever the width', () => {
    const expected = { hero: 52, title: 28, heading: 20, body: 15, label: 12 }

    expect(typography(1000, 400)).toEqual(expected)
    expect(typography(2000, 400)).toEqual(expected)
  })

  it('keys portrait off the width and scales it up, whatever the height', () => {
    const expected = { hero: 61, title: 33, heading: 24, body: 17, label: 15 }

    expect(typography(400, 1000)).toEqual(expected)
    expect(typography(400, 2000)).toEqual(expected)
  })
})

describe('descriptionLineSpacing', () => {
  it('is two fifths of the body size, in whole pixels', () => {
    expect(descriptionLineSpacing(15)).toBe(6)
    expect(descriptionLineSpacing(12)).toBe(5)
    expect(descriptionLineSpacing(18)).toBe(7)
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
    for (const button of [
      layout.startButton,
      layout.howToPlayButton,
      layout.howToPlayCloseButton,
    ]) {
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
      layout.startButton,
      layout.howToPlayButton,
      layout.howToPlayPanel,
      layout.howToPlayCloseButton,
    ]) {
      expect(within(rect, width, height)).toBe(true)
    }
    expect(layout.hint.y).toBeLessThanOrEqual(height)
  })

  it.each(VIEWPORTS)('keeps a level card\'s three lines clear of each other on $name', ({
    width,
    height,
  }) => {
    const layout = menuLayout(width, height, LEVEL_COUNT, VOICE_COUNT)

    for (const card of layout.cards) {
      const text = levelCardText(card)
      const bottomOf = (line: { y: number; size: number }): number =>
        line.y + line.size * LINE_HEIGHT

      // The numeral used to be sized from the whole card while both insets grew
      // with card width, so on a wide portrait tablet it was drawn through the
      // level name.
      expect(
        bottomOf(text.number),
        'the rapid-class numeral runs into the level name',
      ).toBeLessThanOrEqual(text.name.y)
      expect(
        bottomOf(text.classLabel),
        'the CLASS label runs into the numeral',
      ).toBeLessThanOrEqual(text.number.y)
      expect(bottomOf(text.name), 'the level name falls off the card').toBeLessThanOrEqual(
        card.height,
      )
      expect(text.classLabel.y, 'the CLASS label sits above the card').toBeGreaterThan(0)
      expect(text.number.x, 'the numeral sits outside the card').toBeGreaterThan(0)
    }
  })

  it.each(VIEWPORTS)('keeps the numeral the dominant line on a card on $name', ({
    width,
    height,
  }) => {
    const layout = menuLayout(width, height, LEVEL_COUNT, VOICE_COUNT)

    for (const card of layout.cards) {
      const text = levelCardText(card)

      expect(text.name.size).toBe(text.classLabel.size)
      // Shrinking to fit must still leave the numeral reading as the headline
      // of the card rather than a third label.
      expect(
        text.number.size,
        'the numeral no longer dominates the card',
      ).toBeGreaterThanOrEqual(text.name.size * 1.5)
    }
  })

  it('shrinks the numeral rather than the card when the card is wide and short', () => {
    const tall = levelCardText({ x: 0, y: 0, width: 173, height: 124 })
    const wide = levelCardText({ x: 0, y: 0, width: 470, height: 124 })

    // Same height, so the same numeral: the horizontal inset no longer steals
    // vertical room.
    expect(wide.number.size).toBe(tall.number.size)
    expect(wide.number.y).toBe(tall.number.y)
    expect(wide.classLabel.x).toBeGreaterThan(tall.classLabel.x)
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

  it.each(VIEWPORTS)('keeps the description clear of the controls on $name', ({
    width,
    height,
  }) => {
    const layout = menuLayout(width, height, LEVEL_COUNT, VOICE_COUNT)
    const descriptionLines = layout.detail.width >= layout.type.body * 0.47 * 70 ? 1 : 2
    const drawnBottom =
      layout.detail.y +
      layout.detailLabel * 1.25 +
      layout.type.body * LINE_HEIGHT * descriptionLines +
      descriptionLineSpacing(layout.type.body) * (descriptionLines - 1)

    // The label was `type.title` whatever the room, so on a landscape phone the
    // description was drawn under the mode buttons.
    expect(
      drawnBottom,
      'the level description is drawn into the controls row',
    ).toBeLessThanOrEqual(layout.modeButtons[0].y)
    expect(layout.detail.y + layout.detail.height).toBeLessThanOrEqual(
      layout.modeButtons[0].y,
    )
  })

  it.each(VIEWPORTS)('keeps the description label readable on $name', ({
    width,
    height,
  }) => {
    const layout = menuLayout(width, height, LEVEL_COUNT, VOICE_COUNT)

    expect(layout.detailLabel).toBeGreaterThanOrEqual(layout.type.body)
    expect(layout.detailLabel).toBeLessThanOrEqual(layout.type.title)
  })

  it('spends the room on the label where there is room to spend', () => {
    const desktop = menuLayout(1440, 900, LEVEL_COUNT, VOICE_COUNT)
    const shortLandscape = menuLayout(667, 375, LEVEL_COUNT, VOICE_COUNT)

    expect(desktop.detailLabel).toBe(desktop.type.title)
    expect(shortLandscape.detailLabel).toBeLessThan(shortLandscape.type.title)
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

  it('splits the brand and run setup into separate desktop columns', () => {
    const layout = menuLayout(1440, 900, LEVEL_COUNT, VOICE_COUNT)

    expect(layout.split).toBe(true)
    expect(layout.setupPanel.x).toBeGreaterThan(layout.title.x)
    expect(layout.cards[0].x).toBeGreaterThanOrEqual(layout.setupPanel.x)
    expect(layout.startButton.x).toBeGreaterThanOrEqual(layout.setupPanel.x)
  })

  it('keeps one stacked surface on compact screens', () => {
    expect(menuLayout(393, 852, LEVEL_COUNT, VOICE_COUNT).split).toBe(false)
    expect(menuLayout(852, 393, LEVEL_COUNT, VOICE_COUNT).split).toBe(false)
  })

  it('splits only from 1000 wide and 620 tall, and only in landscape', () => {
    expect(menuLayout(1000, 620, LEVEL_COUNT, VOICE_COUNT).split).toBe(true)
    expect(menuLayout(999, 620, LEVEL_COUNT, VOICE_COUNT).split).toBe(false)
    expect(menuLayout(1000, 619, LEVEL_COUNT, VOICE_COUNT).split).toBe(false)
    expect(menuLayout(1100, 1200, LEVEL_COUNT, VOICE_COUNT).split).toBe(false)
  })

  it('gives the setup a panel of its own only when split', () => {
    const split = menuLayout(1440, 900, LEVEL_COUNT, VOICE_COUNT)
    const compact = menuLayout(852, 393, LEVEL_COUNT, VOICE_COUNT)

    expect(split.setupPanel).toEqual({ x: 677, y: 34, width: 729, height: 832 })
    expect(compact.setupPanel).toEqual({ x: 0, y: 0, width: 852, height: 393 })
  })

  it('gives the hero copy a column only when split', () => {
    expect(menuLayout(1440, 900, LEVEL_COUNT, VOICE_COUNT).heroBody.width).toBe(609)
    expect(menuLayout(852, 393, LEVEL_COUNT, VOICE_COUNT).heroBody.width).toBe(0)
    expect(menuLayout(393, 852, LEVEL_COUNT, VOICE_COUNT).heroBody.width).toBe(0)
  })

  it('places the subtitle and section label by the three menu shapes', () => {
    const split = menuLayout(1440, 900, LEVEL_COUNT, VOICE_COUNT)
    const compactLandscape = menuLayout(852, 393, LEVEL_COUNT, VOICE_COUNT)
    const portrait = menuLayout(393, 852, LEVEL_COUNT, VOICE_COUNT)

    expect(split.subtitle).toEqual({ x: 34, y: 225 })
    expect(split.sectionLabel).toEqual({ x: 703, y: 60 })
    // Beside the title rather than under it: this row has no height to spare.
    expect(compactLandscape.subtitle).toEqual({ x: 199, y: 22 })
    expect(compactLandscape.sectionLabel).toEqual({ x: 18, y: 73 })
    expect(portrait.subtitle).toEqual({ x: 18, y: 73 })
    expect(portrait.sectionLabel).toEqual({ x: 18, y: 129 })
  })

  it('bounds the split panel padding between 18 and 28', () => {
    const narrow = menuLayout(1000, 620, LEVEL_COUNT, VOICE_COUNT)
    const wide = menuLayout(3000, 1000, LEVEL_COUNT, VOICE_COUNT)

    expect(narrow.sectionLabel.x - narrow.setupPanel.x).toBe(18)
    expect(wide.sectionLabel.x - wide.setupPanel.x).toBe(28)
  })

  it('divides the landscape controls row into a mode block and a wider voice panel', () => {
    const layout = menuLayout(852, 393, LEVEL_COUNT, VOICE_COUNT)
    const [first, second] = layout.modeButtons

    expect([first.x, first.width, second.x, second.width]).toEqual([18, 173, 200, 173])
    expect(first.y).toBe(layout.voicePanel.y)
    expect(second.y).toBe(layout.voicePanel.y)
    expect([layout.voicePanel.x, layout.voicePanel.width]).toEqual([382, 452])
    expect(layout.voicePanel.x + layout.voicePanel.width).toBe(
      layout.startButton.x + layout.startButton.width,
    )
  })

  it('runs the portrait controls across the full content width', () => {
    const layout = menuLayout(393, 852, LEVEL_COUNT, VOICE_COUNT)
    const [first, second] = layout.modeButtons

    expect([layout.voicePanel.x, layout.voicePanel.width]).toEqual([18, 357])
    expect([first.x, first.width, second.x, second.width]).toEqual([18, 174, 201, 174])
    expect(first.y).toBe(second.y)
  })

  it('divides the voice panel evenly, however many voices there are', () => {
    const layout = menuLayout(852, 393, LEVEL_COUNT, 3)

    expect(layout.voiceButtons.map((button) => button.x)).toEqual([389, 537, 685])
    for (const button of layout.voiceButtons) {
      expect(button.width).toBe(142)
    }
  })

  it('never makes more card columns than there are levels in landscape', () => {
    const layout = menuLayout(852, 393, 2, VOICE_COUNT)

    expect(layout.cardColumns).toBe(2)
    expect(layout.cards[1].y).toBe(layout.cards[0].y)
  })

  it('wraps landscape cards onto a new row after the fourth', () => {
    const layout = menuLayout(852, 393, 6, VOICE_COUNT)

    expect(layout.cards).toHaveLength(6)
    expect(layout.cardColumns).toBe(4)
    expect(layout.cards[4].x).toBe(layout.cards[0].x)
    expect(layout.cards[4].y).toBeGreaterThan(layout.cards[0].y)
  })

  it('keeps two portrait columns even for an odd level count', () => {
    const layout = menuLayout(393, 852, 3, VOICE_COUNT)

    expect(layout.cardColumns).toBe(2)
    expect(layout.cards[2].x).toBe(layout.cards[0].x)
    expect(layout.cards[2].y).toBeGreaterThan(layout.cards[0].y)
  })

  it('caps the card height by menu shape', () => {
    expect(menuLayout(1440, 900, LEVEL_COUNT, VOICE_COUNT).cards[0].height).toBe(172)
    expect(menuLayout(999, 900, LEVEL_COUNT, VOICE_COUNT).cards[0].height).toBe(112)
    expect(menuLayout(393, 852, LEVEL_COUNT, VOICE_COUNT).cards[0].height).toBe(124)
  })

  it('limits a narrow card to its width before any other cap', () => {
    const [card] = menuLayout(1000, 900, LEVEL_COUNT, VOICE_COUNT).cards

    expect(card.width).toBe(103)
    expect(card.height).toBe(117)
  })

  it('holds cards, description and label at their floors when levels overcrowd the menu', () => {
    const layout = menuLayout(393, 852, 12, VOICE_COUNT)

    expect(layout.cards[0].height).toBe(MIN_TOUCH_PX + 10)
    expect(layout.detail.height).toBe(layout.type.body * 2)
    expect(layout.detailLabel).toBe(layout.type.body)
  })

  it('anchors the how-to-play button in the brand column when split', () => {
    expect(menuLayout(1440, 900, LEVEL_COUNT, VOICE_COUNT).howToPlayButton).toEqual({
      x: 34,
      y: 811,
      width: 230,
      height: 55,
    })
  })

  it('bounds the split how-to-play button between 180 and 240 wide', () => {
    expect(menuLayout(1000, 620, LEVEL_COUNT, VOICE_COUNT).howToPlayButton.width).toBe(180)
    expect(menuLayout(2000, 1000, LEVEL_COUNT, VOICE_COUNT).howToPlayButton.width).toBe(240)
  })

  it('shrinks how-to-play to an exact touch-floor square at the right gutter when compact', () => {
    for (const [width, height, x] of [[393, 852, 331], [852, 393, 790]]) {
      const button = menuLayout(width, height, LEVEL_COUNT, VOICE_COUNT).howToPlayButton

      expect(button.x).toBe(x)
      expect(button.width).toBe(MIN_TOUCH_PX)
      expect(button.height).toBe(MIN_TOUCH_PX)
    }
  })

  it('caps the how-to-play panel at 720 by 440 and centres it', () => {
    expect(menuLayout(1440, 900, LEVEL_COUNT, VOICE_COUNT).howToPlayPanel).toEqual({
      x: 360,
      y: 230,
      width: 720,
      height: 440,
    })
  })

  it('fits the how-to-play panel inside the gutters on either short axis', () => {
    expect(menuLayout(393, 852, LEVEL_COUNT, VOICE_COUNT).howToPlayPanel).toEqual({
      x: 18,
      y: 206,
      width: 357,
      height: 440,
    })
    expect(menuLayout(852, 393, LEVEL_COUNT, VOICE_COUNT).howToPlayPanel).toEqual({
      x: 66,
      y: 18,
      width: 720,
      height: 357,
    })
  })

  it('sizes the how-to-play close button from the mode height, down to 52 tall', () => {
    expect(menuLayout(1440, 900, LEVEL_COUNT, VOICE_COUNT).howToPlayCloseButton).toEqual({
      x: 475,
      y: 580,
      width: 490,
      height: 64,
    })
    expect(menuLayout(852, 393, LEVEL_COUNT, VOICE_COUNT).howToPlayCloseButton).toEqual({
      x: 181,
      y: 305,
      width: 490,
      height: 52,
    })
  })
})

describe('levelCardText', () => {
  it('derives the insets and all three lines from the card', () => {
    expect(levelCardText({ x: 0, y: 0, width: 200, height: 100 })).toEqual({
      classLabel: { x: 18, y: 10, size: 11 },
      number: { x: 17, y: 23, size: 46 },
      name: { x: 18, y: 77, size: 11 },
    })
  })

  it('stops the insets, labels and numeral at their ceilings on a large card', () => {
    expect(levelCardText({ x: 0, y: 0, width: 400, height: 200 })).toEqual({
      classLabel: { x: 26, y: 16, size: 15 },
      number: { x: 25, y: 34, size: 92 },
      name: { x: 26, y: 166, size: 15 },
    })
  })

  it('holds the insets, labels and numeral at their floors on a small card', () => {
    expect(levelCardText({ x: 0, y: 0, width: 100, height: 48 })).toEqual({
      classLabel: { x: 12, y: 6, size: 10 },
      number: { x: 11, y: 18, size: 12 },
      name: { x: 12, y: 30, size: 10 },
    })
  })
})

describe('riverLayout', () => {
  it.each(VIEWPORTS)('keeps both paddle controls touchable on $name', ({ width, height }) => {
    const { controls, pauseButton, modalPrimaryButton, modalSecondaryButton } = riverLayout(
      width,
      height,
    )

    expect(shorterSide(controls.forward)).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
    expect(shorterSide(controls.backward)).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
    expect(controls.backward.x).toBeGreaterThan(controls.forward.x)
    expect(shorterSide(pauseButton)).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
    expect(shorterSide(modalPrimaryButton)).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
    expect(shorterSide(modalSecondaryButton)).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
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
      layout.pauseButton,
      layout.modalPanel,
      layout.modalPrimaryButton,
      layout.modalSecondaryButton,
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
      expect(
        Math.abs(layout.targetX - (layout.rhythmLane.x + layout.rhythmLane.width / 2)),
      ).toBeLessThanOrEqual(1)
    }
  })

  it('uses the full river width when a solo run does not need a rival rail', () => {
    const layout = riverLayout(1440, 900, false)

    expect(layout.railVisible).toBe(false)
    expect(layout.rail.width).toBe(0)
    expect(layout.river.width).toBe(1440)
    expect(layout.call.x).toBe(720)
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

  it('floats the controls only on a landscape screen under 520 tall', () => {
    expect(riverLayout(800, 519).controlsOverlay).toBe(true)
    expect(riverLayout(800, 520).controlsOverlay).toBe(false)
    expect(riverLayout(400, 500).controlsOverlay).toBe(false)
  })

  it('bounds the overlay rail between 84 and 150 thick', () => {
    expect(riverLayout(600, 300).rail.width).toBe(84)
    expect(riverLayout(852, 393).rail.width).toBe(94)
    expect(riverLayout(1500, 500).rail.width).toBe(150)
  })

  it('bounds the stacked landscape rail between 120 and 240 thick', () => {
    expect(riverLayout(600, 550).rail.width).toBe(120)
    expect(riverLayout(800, 600).rail.width).toBe(136)
    expect(riverLayout(1440, 900).rail.width).toBe(240)
  })

  it('bounds the portrait rail between 40 and 72 thick', () => {
    expect(riverLayout(300, 600).rail.height).toBe(40)
    expect(riverLayout(393, 852).rail.height).toBe(47)
    expect(riverLayout(800, 1400).rail.height).toBe(72)
  })

  it('runs the stacked landscape rail down the side, level with the river', () => {
    const { rail, railAxis, river } = riverLayout(1440, 900)

    expect(railAxis).toBe('vertical')
    expect(rail.x).toBe(river.width)
    expect(rail.y).toBe(river.y)
    expect(rail.height).toBe(river.height)
  })

  it('gives the river the rail\'s band when a portrait run hides the rail', () => {
    const shown = riverLayout(393, 852)
    const hidden = riverLayout(393, 852, false)

    expect([shown.river.y, shown.river.height]).toEqual([131, 500])
    expect(hidden.rail.height).toBe(0)
    expect([hidden.river.y, hidden.river.height]).toEqual([84, 547])
  })

  it('gives the river the full width when an overlay run hides the rail', () => {
    const layout = riverLayout(852, 393, false)

    expect(layout.rail).toEqual({ x: 852, y: 52, width: 0, height: 341 })
    expect(layout.railAxis).toBe('vertical')
    expect(layout.river.width).toBe(852)
    expect(layout.call.x).toBe(426)
  })

  it('sizes stacked controls by orientation, within 56 to 96 tall', () => {
    expect(riverLayout(800, 600).controls.forward.height).toBe(84)
    expect(riverLayout(500, 600).controls.forward.height).toBe(72)
    expect(riverLayout(300, 400).controls.forward.height).toBe(56)
    expect(riverLayout(1440, 900).controls.forward.height).toBe(96)
  })

  it('bounds the overlay controls in both axes', () => {
    expect(riverLayout(800, 250).controls.forward.height).toBe(56)
    expect(riverLayout(852, 393).controls.forward.height).toBe(86)
    expect(riverLayout(1200, 510).controls.forward.height).toBe(110)

    expect(riverLayout(400, 300).controls.forward.width).toBe(68)
    expect(riverLayout(852, 393).controls.forward.width).toBe(128)
    expect(riverLayout(1200, 510).controls.forward.width).toBe(150)
  })

  it('threads the overlay lane between the paddle zones, targeted at the river centre', () => {
    const layout = riverLayout(852, 393)

    expect(layout.rhythmLane).toEqual({ x: 144, y: 324, width: 470, height: 59 })
    expect(layout.controls.forward).toEqual({ x: 7, y: 297, width: 128, height: 86 })
    expect(layout.controls.backward).toEqual({ x: 623, y: 297, width: 128, height: 86 })
    expect(layout.targetX).toBe(379)
    expect(layout.gateLabel).toEqual({ x: 379, y: 334 })
    expect(layout.laneHint).toEqual({ x: 154, y: 376 })
  })

  it('runs the stacked lane and controls across the gutters', () => {
    const layout = riverLayout(393, 852)

    expect(layout.rhythmLane).toEqual({ x: 9, y: 640, width: 375, height: 96 })
    expect(layout.controls.forward).toEqual({ x: 9, y: 745, width: 183, height: 96 })
    expect(layout.controls.backward).toEqual({ x: 201, y: 745, width: 183, height: 96 })
  })

  it('draws the raft and call higher on the river in the overlay layout', () => {
    const overlay = riverLayout(852, 393)
    const stacked = riverLayout(393, 852)

    expect(overlay.raft).toEqual({ x: 379, y: 195 })
    expect(overlay.feedback).toEqual({ x: 379, y: 243 })
    expect(overlay.call).toEqual({ x: 379, y: 103 })
    expect(overlay.callSub).toEqual({ x: 379, y: 143 })

    expect(stacked.raft).toEqual({ x: 197, y: 406 })
    expect(stacked.feedback).toEqual({ x: 197, y: 491 })
    expect(stacked.call).toEqual({ x: 197, y: 211 })
    expect(stacked.callSub).toEqual({ x: 197, y: 260 })
  })

  it('holds the overlay top bar at the touch floor plus a margin', () => {
    expect(riverLayout(852, 393).topBar.height).toBe(52)
    expect(riverLayout(1200, 510).topBar.height).toBe(52)
  })

  it('lays out the top bar around the pause button in both layouts', () => {
    const overlay = riverLayout(852, 393)
    const stacked = riverLayout(393, 852)

    expect(overlay.pauseButton).toEqual({ x: 790, y: 4, width: 44, height: 44 })
    expect(overlay.timeText).toEqual({ x: 426, y: 26 })
    expect(overlay.statsText).toEqual({ x: 780, y: 26 })

    expect(stacked.pauseButton).toEqual({ x: 323, y: 16, width: 52, height: 52 })
    expect(stacked.timeText).toEqual({ x: 197, y: 42 })
    expect(stacked.statsText).toEqual({ x: 313, y: 42 })
  })

  it('holds the stacked pause button at the touch floor on a short top bar', () => {
    const layout = riverLayout(500, 600)

    expect(layout.pauseButton.width).toBe(MIN_TOUCH_PX)
    expect(layout.pauseButton.height).toBe(MIN_TOUCH_PX)
    expect(layout.pauseButton.y).toBe(8)
    expect(layout.pauseButton.x + layout.pauseButton.width + layout.gutter).toBe(500)
  })

  it('caps the modal at 620 by 440 and stacks its buttons in the bottom', () => {
    const layout = riverLayout(1440, 900)

    expect(layout.modalPanel).toEqual({ x: 410, y: 230, width: 620, height: 440 })
    expect(layout.modalSecondaryButton).toEqual({ x: 497, y: 570, width: 446, height: 66 })
    expect(layout.modalPrimaryButton).toEqual({ x: 497, y: 488, width: 446, height: 66 })
  })

  it('fits the modal inside the gutters and holds its buttons at 52 tall on a small phone', () => {
    const layout = riverLayout(320, 568)

    expect(layout.modalPanel).toEqual({ x: 14, y: 64, width: 292, height: 440 })
    expect(layout.modalSecondaryButton).toEqual({ x: 55, y: 438, width: 210, height: 52 })
    expect(layout.modalPrimaryButton).toEqual({ x: 55, y: 378, width: 210, height: 52 })
  })

  it('shrinks the modal to the gutters on a short landscape screen', () => {
    expect(riverLayout(667, 375).modalPanel).toEqual({ x: 24, y: 17, width: 620, height: 341 })
  })
})

describe('lobbyLayout', () => {
  it.each(VIEWPORTS)('keeps every lobby target on screen and touchable on $name', ({
    width,
    height,
  }) => {
    const layout = lobbyLayout(width, height)
    const targets = [
      layout.nameInput,
      layout.quickMatchButton,
      ...layout.capacityButtons,
      layout.createButton,
      layout.codeInput,
      layout.joinButton,
      ...layout.roomButtons,
      layout.queueLeaveButton,
      layout.backButton,
    ]

    for (const target of targets) {
      expect(within(target, width, height)).toBe(true)
      expect(shorterSide(target)).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
    }
    expect(within(layout.members, width, height)).toBe(true)
  })

  it('splits setup into two columns on a landscape phone', () => {
    const layout = lobbyLayout(667, 375)
    expect(layout.mode).toBe('landscape')
    expect(layout.codeInput.x).toBeGreaterThan(layout.nameInput.x + layout.nameInput.width)
  })

  it('stacks setup controls in portrait', () => {
    const layout = lobbyLayout(393, 852)
    expect(layout.mode).toBe('portrait')
    expect(layout.quickMatchButton.y).toBeGreaterThan(
      layout.nameInput.y + layout.nameInput.height,
    )
    expect(layout.createButton.y).toBeGreaterThan(layout.nameInput.y + layout.nameInput.height)
    expect(layout.codeInput.y).toBeGreaterThan(layout.createButton.y + layout.createButton.height)
  })

  it('puts the portrait setup controls on one column, with join beside the code', () => {
    const layout = lobbyLayout(393, 852)

    expect(layout.content).toEqual({ x: 18, y: 89, width: 357, height: 745 })
    expect(layout.nameInput).toEqual({ x: 18, y: 120, width: 357, height: 58 })
    expect(layout.quickMatchButton).toEqual({ x: 18, y: 188, width: 357, height: 58 })
    expect(layout.capacityButtons.map((button) => button.x)).toEqual([18, 110, 202, 293])
    for (const button of layout.capacityButtons) {
      expect(button.y).toBe(282)
      expect(button.width).toBe(82)
      expect(button.height).toBe(MIN_TOUCH_PX)
    }
    expect(layout.createButton).toEqual({ x: 18, y: 336, width: 357, height: 58 })
    expect(layout.codeInput).toEqual({ x: 18, y: 430, width: 218, height: 58 })
    expect(layout.joinButton).toEqual({ x: 246, y: 430, width: 129, height: 58 })
    expect(layout.backButton).toEqual({ x: 18, y: 498, width: 357, height: MIN_TOUCH_PX })
  })

  it('bounds the portrait join button between 96 and 180 wide', () => {
    expect(lobbyLayout(240, 568).joinButton.width).toBe(96)
    expect(lobbyLayout(834, 1112).joinButton.width).toBe(180)
  })

  it('stacks the back button under join in the landscape column', () => {
    expect(lobbyLayout(667, 375).backButton).toEqual({
      x: 341,
      y: 207,
      width: 310,
      height: MIN_TOUCH_PX,
    })
  })

  it('keeps the landscape capacity row inside the left column', () => {
    const layout = lobbyLayout(667, 375)
    const last = layout.capacityButtons[3]

    expect(last.x + last.width).toBeLessThanOrEqual(layout.nameInput.x + layout.nameInput.width)
    expect(last.x + last.width).toBeLessThan(layout.codeInput.x)
  })

  it('puts the room buttons in a two-by-two block at the foot of the content', () => {
    const { roomButtons } = lobbyLayout(393, 852)

    expect(roomButtons).toEqual([
      { x: 18, y: 708, width: 174, height: 58 },
      { x: 202, y: 708, width: 174, height: 58 },
      { x: 18, y: 776, width: 174, height: 58 },
      { x: 202, y: 776, width: 174, height: 58 },
    ])
  })

  it('stretches leave-queue across the bottom room-button row', () => {
    expect(lobbyLayout(393, 852).queueLeaveButton).toEqual({
      x: 18,
      y: 776,
      width: 357,
      height: 58,
    })
  })

  it('fills the room between the title and the room buttons with the member list', () => {
    expect(lobbyLayout(393, 852).members).toEqual({ x: 18, y: 142, width: 357, height: 556 })
  })

  it('keeps three lines of member list on a very short viewport', () => {
    const layout = lobbyLayout(500, 200)

    expect(layout.members.height).toBe(layout.type.body * 3)
  })
})

describe('gutter', () => {
  it('stays proportional but bounded', () => {
    expect(gutter(320, 568)).toBeGreaterThanOrEqual(12)
    expect(gutter(3840, 2160)).toBeLessThanOrEqual(34)
  })

  it('stops at exactly 12 and 34', () => {
    expect(gutter(200, 400)).toBe(12)
    expect(gutter(3840, 2160)).toBe(34)
  })

  it('keys off the shorter side, in either orientation', () => {
    expect(gutter(400, 1000)).toBe(18)
    expect(gutter(1000, 400)).toBe(18)
  })
})
