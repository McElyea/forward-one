/**
 * Viewport-driven layout for both scenes.
 *
 * The game used to render into a fixed 1280x720 canvas scaled with
 * `Phaser.Scale.FIT`, which meant every coordinate could be a literal. On a
 * phone that scaled the whole game down by ~0.3 in portrait, putting body text
 * at 4px and every touch target far below the 44px floor.
 *
 * The canvas is now sized to the viewport (`Phaser.Scale.RESIZE`), so one game
 * unit is one CSS pixel and the numbers below are the sizes a player actually
 * sees and touches. All of it is pure arithmetic on `(width, height)` so it can
 * be tested without a canvas — see `layout.test.ts`.
 */

export type LayoutMode = 'portrait' | 'landscape'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface Typography {
  hero: number
  title: number
  heading: number
  body: number
  label: number
}

/** Minimum size for anything a finger has to hit, per WCAG target-size guidance. */
export const MIN_TOUCH_PX = 44

/**
 * How much vertical room a line of text takes, as a multiple of its font size.
 * Phaser measures the font's own ascent and descent, which for the two bundled
 * faces sits a little above the em box; 1.15 covers that with room to spare.
 */
export const LINE_HEIGHT = 1.15

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const round = (value: number): number => Math.round(value)

export function layoutMode(width: number, height: number): LayoutMode {
  return width >= height ? 'landscape' : 'portrait'
}

export function typography(width: number, height: number): Typography {
  const mode = layoutMode(width, height)
  // Landscape keys off height (the scarce axis); portrait keys off width.
  const base = mode === 'landscape' ? height : width
  const scale = mode === 'landscape' ? 1 : 1.18

  return {
    hero: round(clamp(base * 0.13 * scale, 30, 68)),
    title: round(clamp(base * 0.07 * scale, 19, 36)),
    heading: round(clamp(base * 0.05 * scale, 14, 24)),
    body: round(clamp(base * 0.037 * scale, 12, 18)),
    label: round(clamp(base * 0.031 * scale, 11, 15)),
  }
}

/** Outer margin, scaled to the viewport but never cramped or absurd. */
export function gutter(width: number, height: number): number {
  return round(clamp(Math.min(width, height) * 0.045, 12, 34))
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/** Extra room between the description's wrapped lines. */
export function descriptionLineSpacing(body: number): number {
  return round(body * 0.4)
}

export interface MenuLayout {
  mode: LayoutMode
  width: number
  height: number
  type: Typography
  gutter: number
  title: Point
  subtitle: Point
  brand: Point
  sectionLabel: Point
  cards: Rect[]
  cardColumns: number
  detail: Rect
  /** Font size for the `CLASS n / NAME` line above the description. */
  detailLabel: number
  modeButtons: [Rect, Rect]
  voicePanel: Rect
  voiceButtons: Rect[]
  hint: Point
}

export function menuLayout(
  width: number,
  height: number,
  levelCount: number,
  voiceCount: number,
): MenuLayout {
  const mode = layoutMode(width, height)
  const type = typography(width, height)
  const g = gutter(width, height)
  const contentWidth = width - g * 2
  const gap = round(clamp(g * 0.5, 8, 16))

  // --- Header, measured downward from the top edge.
  const titleY = g
  const subtitleY = titleY + type.hero * 1.05
  const sectionY = subtitleY + type.heading * 2
  const headerBottom = sectionY + type.heading * 1.7

  // --- Bottom stack, measured upward from the bottom edge, because the
  // controls have to stay under the player's thumb whatever else gives.
  const hintHeight = round(type.label * 2)
  const buttonHeight = round(clamp(height * 0.09, MIN_TOUCH_PX + 12, 72))
  const voiceHeight = round(Math.max(buttonHeight, MIN_TOUCH_PX) + type.label * 2.2)
  // A landscape phone has no vertical room to stack these, so they share a row.
  const controlsRowHeight =
    mode === 'landscape' ? Math.max(buttonHeight, voiceHeight) : buttonHeight + gap + voiceHeight
  const controlsTop = height - g - hintHeight - controlsRowHeight

  // --- Cards take what is left over, after reserving the description block a
  // floor. Sizing them from width alone is what used to push the description
  // off a short screen.
  // The description block is a label line above the description itself, so the
  // reserve has to hold both. Two body lines alone left the label out of the
  // sum, which is how the description ended up under the mode buttons.
  const descriptionLines = contentWidth >= type.body * 0.47 * 70 ? 1 : 2
  const descriptionHeight =
    type.body * LINE_HEIGHT * descriptionLines +
    descriptionLineSpacing(type.body) * (descriptionLines - 1)
  const detailMin = round(type.body * 1.25 + descriptionHeight)
  const cardColumns = mode === 'landscape' ? Math.min(levelCount, 4) : 2
  const cardRows = Math.ceil(levelCount / cardColumns)
  const cardWidth = (contentWidth - gap * (cardColumns - 1)) / cardColumns
  const cardsAvailable = controlsTop - gap - detailMin - gap - headerBottom
  const cardHeight = clamp(
    Math.min((cardsAvailable - gap * (cardRows - 1)) / cardRows, cardWidth * 1.2),
    MIN_TOUCH_PX + 16,
    mode === 'landscape' ? 148 : 124,
  )

  const cards: Rect[] = []
  for (let index = 0; index < levelCount; index += 1) {
    const column = index % cardColumns
    const row = Math.floor(index / cardColumns)
    cards.push({
      x: round(g + column * (cardWidth + gap)),
      y: round(headerBottom + row * (cardHeight + gap)),
      width: round(cardWidth),
      height: round(cardHeight),
    })
  }

  const cardsBottom = headerBottom + cardRows * cardHeight + (cardRows - 1) * gap
  const detailTop = cardsBottom + gap

  // --- Controls row.
  const modeBlockWidth = mode === 'landscape' ? (contentWidth - gap) * 0.46 : contentWidth
  const modeWidth = (modeBlockWidth - gap) / 2
  const modeTop = controlsTop

  const voicePanel: Rect =
    mode === 'landscape'
      ? {
          x: round(g + modeBlockWidth + gap),
          y: round(controlsTop),
          width: round(contentWidth - modeBlockWidth - gap),
          height: voiceHeight,
        }
      : {
          x: round(g),
          y: round(controlsTop + buttonHeight + gap),
          width: round(contentWidth),
          height: voiceHeight,
        }

  const voiceInnerPad = round(clamp(g * 0.4, 8, 14))
  const voiceGap = 6
  const voiceButtonWidth =
    (voicePanel.width - voiceInnerPad * 2 - voiceGap * (voiceCount - 1)) / voiceCount
  const voiceButtonHeight = Math.max(
    MIN_TOUCH_PX,
    voicePanel.height - type.label * 1.9 - voiceInnerPad,
  )
  const voiceButtons: Rect[] = []
  for (let index = 0; index < voiceCount; index += 1) {
    voiceButtons.push({
      x: round(voicePanel.x + voiceInnerPad + index * (voiceButtonWidth + voiceGap)),
      y: round(voicePanel.y + voicePanel.height - voiceInnerPad - voiceButtonHeight),
      width: round(voiceButtonWidth),
      height: round(voiceButtonHeight),
    })
  }

  // The label used to be `type.title` whatever the room. It now takes what the
  // region has left after the description, down to body size.
  const detailHeight = round(Math.max(type.body * 2, controlsTop - gap - detailTop))
  // The longest level description runs about 70 characters, and condensed body
  // text averages a little under half its size per character, so this is where
  // the description stops needing a second line.
  const detailLabel = round(
    clamp((detailHeight - descriptionHeight) / 1.25, type.body, type.title),
  )

  return {
    mode,
    width,
    height,
    type,
    gutter: g,
    brand: { x: g, y: round(titleY) },
    title: { x: g, y: round(titleY) },
    subtitle: { x: g, y: round(subtitleY) },
    sectionLabel: { x: g, y: round(sectionY) },
    cards,
    cardColumns,
    detail: {
      x: round(g),
      y: round(detailTop),
      width: round(contentWidth),
      height: detailHeight,
    },
    detailLabel,
    modeButtons: [
      { x: round(g), y: round(modeTop), width: round(modeWidth), height: buttonHeight },
      {
        x: round(g + modeWidth + gap),
        y: round(modeTop),
        width: round(modeWidth),
        height: buttonHeight,
      },
    ],
    voicePanel,
    voiceButtons,
    hint: { x: g, y: round(height - g - hintHeight * 0.85) },
  }
}

/** One line of text on a level card: where it starts, and how big it is. */
export interface LevelCardLine {
  x: number
  y: number
  size: number
}

export interface LevelCardText {
  classLabel: LevelCardLine
  number: LevelCardLine
  name: LevelCardLine
}

/**
 * Type and insets for one level card, measured from the card and not the
 * viewport.
 *
 * The horizontal inset used to be the vertical one too. Card height is capped
 * (see `cardHeight` above) while card width follows the viewport, so on a wide
 * portrait tablet that inset grew until the rapid-class numeral — sized from
 * the whole card — was drawn straight through the level name. The numeral now
 * takes only the band the two labels leave it, and shrinks when that band does.
 */
export function levelCardText(card: Rect): LevelCardText {
  const padX = round(clamp(card.width * 0.09, 12, 26))
  const padY = round(clamp(card.height * 0.1, 6, 16))
  const labelSize = round(clamp(card.height * 0.11, 10, 15))

  // Rounded away from the neighbouring line in each case, so the whole-pixel
  // positions keep the clearance the unrounded arithmetic gives them.
  const numberTop = Math.ceil(padY + labelSize * LINE_HEIGHT)
  const nameTop = Math.floor(card.height - padY - labelSize * LINE_HEIGHT)
  const numberSize = Math.floor(
    clamp((nameTop - numberTop) / LINE_HEIGHT, 12, card.height * 0.46),
  )

  return {
    classLabel: { x: padX, y: padY, size: labelSize },
    // A digit reads as inset by its own side bearing, so it starts a pixel left.
    number: { x: padX - 1, y: numberTop, size: numberSize },
    name: { x: padX, y: nameTop, size: labelSize },
  }
}

// ---------------------------------------------------------------------------
// River
// ---------------------------------------------------------------------------

export type RailAxis = 'vertical' | 'horizontal'

export interface RiverLayout {
  mode: LayoutMode
  width: number
  height: number
  type: Typography
  gutter: number
  /**
   * True on a short landscape screen (a phone held sideways), where reserving
   * bands for the lane and the paddle buttons left the river only ~42% of the
   * screen. When set, both float over the river instead, and the scene draws
   * them translucent so the water still reads underneath.
   */
  controlsOverlay: boolean
  topBar: Rect
  river: Rect
  rail: Rect
  railAxis: RailAxis
  rhythmLane: Rect
  /** Where a stroke must be played, in absolute x within the lane. */
  targetX: number
  controls: { forward: Rect; backward: Rect }
  call: Point
  callSub: Point
  feedback: Point
  raft: Point
  survivalStatus: Point
  timeText: Point
  statsText: Point
}

export function riverLayout(width: number, height: number): RiverLayout {
  const mode = layoutMode(width, height)
  const type = typography(width, height)
  const g = gutter(width, height)
  const controlGap = round(clamp(g * 0.5, 8, 16))

  // A phone held sideways has so little height that stacking everything leaves
  // the world a letterbox slit. Float the controls instead.
  const controlsOverlay = mode === 'landscape' && height < 520

  if (controlsOverlay) {
    const topBarHeight = round(clamp(height * 0.1, type.heading * 2, 54))
    const railThickness = round(clamp(width * 0.11, 84, 150))
    const river: Rect = {
      x: 0,
      y: topBarHeight,
      width: round(width - railThickness),
      height: round(height - topBarHeight),
    }
    const laneHeight = round(clamp(height * 0.15, type.body * 3.2, 76))
    const controlHeight = round(clamp(height * 0.22, MIN_TOUCH_PX + 12, 110))
    const controlWidth = round(clamp(width * 0.15, MIN_TOUCH_PX + 24, 150))
    const bottom = height - g * 0.55
    const edge = round(g * 0.4)

    const rhythmLane: Rect = {
      x: round(river.x + controlWidth + controlGap + edge),
      y: round(bottom - laneHeight),
      width: round(river.width - (controlWidth + controlGap + edge) * 2),
      height: laneHeight,
    }

    return {
      mode,
      width,
      height,
      type,
      gutter: g,
      controlsOverlay,
      topBar: { x: 0, y: 0, width: round(width), height: topBarHeight },
      river,
      rail: {
        x: round(width - railThickness),
        y: topBarHeight,
        width: railThickness,
        height: round(height - topBarHeight),
      },
      railAxis: 'vertical',
      rhythmLane,
      targetX: round(rhythmLane.x + rhythmLane.width * 0.28),
      controls: {
        forward: {
          x: round(river.x + edge),
          y: round(bottom - controlHeight),
          width: controlWidth,
          height: controlHeight,
        },
        backward: {
          x: round(river.x + river.width - controlWidth - edge),
          y: round(bottom - controlHeight),
          width: controlWidth,
          height: controlHeight,
        },
      },
      call: { x: round(river.x + river.width / 2), y: round(river.y + river.height * 0.15) },
      callSub: {
        x: round(river.x + river.width / 2),
        y: round(river.y + river.height * 0.15 + type.hero * 0.78),
      },
      feedback: { x: round(river.x + river.width / 2), y: round(river.y + river.height * 0.56) },
      raft: { x: round(river.x + river.width / 2), y: round(river.y + river.height * 0.42) },
      survivalStatus: { x: round(river.x + g), y: round(river.y + g * 0.7) },
      timeText: { x: round(g), y: round(topBarHeight * 0.5) },
      statsText: { x: round(width - g), y: round(topBarHeight * 0.5) },
    }
  }

  const topBarHeight = round(clamp(height * 0.1, type.heading * 2.4, 84))

  // Controls are the one thing that must never shrink below the touch floor.
  const controlHeight = round(
    clamp(height * (mode === 'landscape' ? 0.14 : 0.12), MIN_TOUCH_PX + 12, 96),
  )
  const laneHeight = round(clamp(height * 0.15, type.body * 4, 96))

  const controlsTop = height - g * 0.6 - controlHeight
  const laneTop = controlsTop - controlGap - laneHeight

  // The rival rail runs down the right edge in landscape, and across the top
  // in portrait where horizontal space is the scarce axis.
  const railThickness =
    mode === 'landscape'
      ? round(clamp(width * 0.17, 120, 240))
      : round(clamp(height * 0.055, 40, 72))

  const rail: Rect =
    mode === 'landscape'
      ? {
          x: round(width - railThickness),
          y: round(topBarHeight),
          width: railThickness,
          height: round(laneTop - controlGap - topBarHeight),
        }
      : {
          x: 0,
          y: round(topBarHeight),
          width: round(width),
          height: railThickness,
        }

  const river: Rect =
    mode === 'landscape'
      ? {
          x: 0,
          y: round(topBarHeight),
          width: round(width - railThickness),
          height: round(laneTop - controlGap - topBarHeight),
        }
      : {
          x: 0,
          y: round(topBarHeight + railThickness),
          width: round(width),
          height: round(laneTop - controlGap - topBarHeight - railThickness),
        }

  const rhythmLane: Rect = {
    x: round(g * 0.5),
    y: round(laneTop),
    width: round(width - g),
    height: laneHeight,
  }

  const controlWidth = (width - g - controlGap) / 2

  return {
    mode,
    width,
    height,
    type,
    gutter: g,
    controlsOverlay,
    topBar: { x: 0, y: 0, width: round(width), height: topBarHeight },
    river,
    rail,
    railAxis: mode === 'landscape' ? 'vertical' : 'horizontal',
    rhythmLane,
    // A third of the way in, so approaching markers have room to travel.
    targetX: round(rhythmLane.x + rhythmLane.width * 0.28),
    controls: {
      forward: {
        x: round(g * 0.5),
        y: round(controlsTop),
        width: round(controlWidth),
        height: controlHeight,
      },
      backward: {
        x: round(g * 0.5 + controlWidth + controlGap),
        y: round(controlsTop),
        width: round(controlWidth),
        height: controlHeight,
      },
    },
    call: { x: round(river.x + river.width / 2), y: round(river.y + river.height * 0.16) },
    callSub: {
      x: round(river.x + river.width / 2),
      y: round(river.y + river.height * 0.16 + type.hero * 0.82),
    },
    feedback: { x: round(river.x + river.width / 2), y: round(river.y + river.height * 0.72) },
    raft: { x: round(river.x + river.width / 2), y: round(river.y + river.height * 0.55) },
    survivalStatus: { x: round(river.x + g), y: round(river.y + g * 0.7) },
    timeText: { x: round(g), y: round(topBarHeight * 0.5) },
    statsText: { x: round(width - g), y: round(topBarHeight * 0.5) },
  }
}
