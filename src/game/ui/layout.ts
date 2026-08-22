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
  /** Desktop gives the brand and setup their own columns; compact screens stack them. */
  split: boolean
  width: number
  height: number
  type: Typography
  gutter: number
  title: Point
  subtitle: Point
  brand: Point
  heroBody: Rect
  setupPanel: Rect
  sectionLabel: Point
  cards: Rect[]
  cardColumns: number
  detail: Rect
  /** Font size for the `CLASS n / NAME` line above the description. */
  detailLabel: number
  modeButtons: [Rect, Rect]
  voicePanel: Rect
  voiceButtons: Rect[]
  startButton: Rect
  howToPlayButton: Rect
  howToPlayPanel: Rect
  howToPlayCloseButton: Rect
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
  const gap = round(clamp(g * 0.5, 8, 16))
  const split = mode === 'landscape' && width >= 1_000 && height >= 620
  const compactLandscape = mode === 'landscape' && !split
  const startHeight = round(clamp(height * 0.095, MIN_TOUCH_PX + 12, 82))
  const modeHeight = round(clamp(height * 0.075, MIN_TOUCH_PX, 64))
  const voiceHeight = round(clamp(height * 0.105, MIN_TOUCH_PX + type.label * 2.65, 96))

  const setupPanel: Rect = split
    ? {
        x: round(width * 0.47),
        y: g,
        width: round(width - width * 0.47 - g),
        height: round(height - g * 2),
      }
    : { x: 0, y: 0, width, height }
  const panelPad = split ? round(clamp(setupPanel.width * 0.035, 18, 28)) : g
  const contentX = setupPanel.x + panelPad
  const contentWidth = setupPanel.width - panelPad * 2
  const titleY = g
  const subtitleY = split
    ? round(height * 0.25)
    : compactLandscape
      ? round(g + type.hero * 0.08)
      : round(g + type.hero * 0.92)
  const sectionY = split
    ? round(setupPanel.y + panelPad)
    : compactLandscape
      ? round(g + type.hero * 1.08)
      : round(subtitleY + type.heading * 2.45)
  const headerBottom = round(sectionY + type.heading * (split ? 1.9 : 1.35))

  const startButton: Rect = {
    x: round(contentX),
    y: round(setupPanel.y + setupPanel.height - panelPad - startHeight),
    width: round(contentWidth),
    height: startHeight,
  }
  const hintY = round(startButton.y - gap - type.label * 1.25)
  const controlsBottom = round(hintY - gap)

  let modeButtons: [Rect, Rect]
  let voicePanel: Rect
  let controlsTop: number
  if (compactLandscape) {
    const modeBlockWidth = round((contentWidth - gap) * 0.44)
    const modeWidth = (modeBlockWidth - gap) / 2
    controlsTop = round(controlsBottom - Math.max(modeHeight, voiceHeight))
    modeButtons = [
      { x: contentX, y: controlsTop, width: round(modeWidth), height: modeHeight },
      {
        x: round(contentX + modeWidth + gap),
        y: controlsTop,
        width: round(modeWidth),
        height: modeHeight,
      },
    ]
    voicePanel = {
      x: round(contentX + modeBlockWidth + gap),
      y: controlsTop,
      width: round(contentWidth - modeBlockWidth - gap),
      height: voiceHeight,
    }
  } else {
    voicePanel = {
      x: contentX,
      y: round(controlsBottom - voiceHeight),
      width: round(contentWidth),
      height: voiceHeight,
    }
    const modeTop = round(voicePanel.y - gap - modeHeight)
    const modeWidth = (contentWidth - gap) / 2
    controlsTop = modeTop
    modeButtons = [
      { x: contentX, y: modeTop, width: round(modeWidth), height: modeHeight },
      {
        x: round(contentX + modeWidth + gap),
        y: modeTop,
        width: round(modeWidth),
        height: modeHeight,
      },
    ]
  }

  const cardColumns = mode === 'landscape' ? Math.min(levelCount, 4) : 2
  const cardRows = Math.ceil(levelCount / cardColumns)
  const cardWidth = (contentWidth - gap * (cardColumns - 1)) / cardColumns
  const descriptionLines = contentWidth >= type.body * 0.47 * 70 ? 1 : 2
  const descriptionHeight =
    type.body * LINE_HEIGHT * descriptionLines +
    descriptionLineSpacing(type.body) * (descriptionLines - 1)
  const detailMin = round(type.body * 1.25 + descriptionHeight)
  const cardsAvailable = controlsTop - gap - detailMin - gap - headerBottom
  const cardHeight = clamp(
    Math.min((cardsAvailable - gap * (cardRows - 1)) / cardRows, cardWidth * 1.14),
    MIN_TOUCH_PX + 10,
    split ? 172 : mode === 'landscape' ? 112 : 124,
  )

  const cards: Rect[] = []
  for (let index = 0; index < levelCount; index += 1) {
    const column = index % cardColumns
    const row = Math.floor(index / cardColumns)
    cards.push({
      x: round(contentX + column * (cardWidth + gap)),
      y: round(headerBottom + row * (cardHeight + gap)),
      width: round(cardWidth),
      height: round(cardHeight),
    })
  }

  const cardsBottom = headerBottom + cardRows * cardHeight + (cardRows - 1) * gap
  const detailTop = cardsBottom + gap
  const detailHeight = round(Math.max(type.body * 2, controlsTop - gap - detailTop))
  const detailLabel = round(
    clamp((detailHeight - descriptionHeight) / 1.25, type.body, type.title),
  )

  const voiceInnerPad = round(clamp(g * 0.35, 7, 13))
  const voiceGap = 6
  const voiceButtonWidth =
    (voicePanel.width - voiceInnerPad * 2 - voiceGap * (voiceCount - 1)) / voiceCount
  const voiceButtonHeight = Math.max(
    MIN_TOUCH_PX,
    voicePanel.height - type.label * 1.55 - voiceInnerPad,
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

  const howToPlayButton: Rect = split
    ? {
        x: g,
        y: round(height - g - Math.max(MIN_TOUCH_PX + 10, type.heading * 2.3)),
        width: round(clamp(width * 0.16, 180, 240)),
        height: round(Math.max(MIN_TOUCH_PX + 10, type.heading * 2.3)),
      }
    : {
        x: round(width - g - MIN_TOUCH_PX),
        y: round(sectionY - (MIN_TOUCH_PX - type.heading) / 2),
        width: MIN_TOUCH_PX,
        height: MIN_TOUCH_PX,
      }
  const howToPlayPanelWidth = round(Math.min(width - g * 2, 720))
  const howToPlayPanelHeight = round(Math.min(height - g * 2, 440))
  const howToPlayPanel: Rect = {
    x: round((width - howToPlayPanelWidth) / 2),
    y: round((height - howToPlayPanelHeight) / 2),
    width: howToPlayPanelWidth,
    height: howToPlayPanelHeight,
  }
  const howToPlayCloseButton: Rect = {
    x: round(howToPlayPanel.x + howToPlayPanel.width * 0.16),
    y: round(howToPlayPanel.y + howToPlayPanel.height - panelPad - Math.max(52, modeHeight)),
    width: round(howToPlayPanel.width * 0.68),
    height: round(Math.max(52, modeHeight)),
  }

  return {
    mode,
    split,
    width,
    height,
    type,
    gutter: g,
    brand: { x: g, y: titleY },
    title: { x: g, y: titleY },
    subtitle: {
      x: compactLandscape ? round(g + type.hero * 3.55) : g,
      y: subtitleY,
    },
    heroBody: {
      x: g,
      y: round(subtitleY + type.hero * 2.05),
      width: split ? round(setupPanel.x - g * 2) : 0,
      height: round(type.body * 4.5),
    },
    setupPanel,
    sectionLabel: { x: contentX, y: sectionY },
    cards,
    cardColumns,
    detail: {
      x: contentX,
      y: round(detailTop),
      width: round(contentWidth),
      height: detailHeight,
    },
    detailLabel,
    modeButtons,
    voicePanel,
    voiceButtons,
    startButton,
    howToPlayButton,
    howToPlayPanel,
    howToPlayCloseButton,
    hint: { x: contentX, y: hintY },
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
// Multiplayer lobby
// ---------------------------------------------------------------------------

export interface LobbyLayout {
  mode: LayoutMode
  width: number
  height: number
  type: Typography
  gutter: number
  title: Point
  content: Rect
  nameInput: Rect
  capacityButtons: Rect[]
  createButton: Rect
  codeInput: Rect
  joinButton: Rect
  members: Rect
  roomButtons: [Rect, Rect, Rect, Rect]
  backButton: Rect
}

export function lobbyLayout(width: number, height: number): LobbyLayout {
  const mode = layoutMode(width, height)
  const type = typography(width, height)
  const g = gutter(width, height)
  const gap = round(clamp(g * 0.55, 8, 16))
  const title = { x: g, y: g }
  const contentY = round(g + type.hero * 1.18)
  const content: Rect = {
    x: g,
    y: contentY,
    width: round(width - g * 2),
    height: round(height - contentY - g),
  }
  const targetHeight = round(clamp(height * 0.09, MIN_TOUCH_PX, 58))

  let nameInput: Rect
  let capacityButtons: Rect[]
  let createButton: Rect
  let codeInput: Rect
  let joinButton: Rect

  if (mode === 'landscape') {
    const columnGap = round(gap * 1.5)
    const columnWidth = (content.width - columnGap) / 2
    const left = content.x
    const right = round(content.x + columnWidth + columnGap)
    const fieldTop = round(content.y + type.heading * 1.35)
    nameInput = { x: left, y: fieldTop, width: round(columnWidth), height: targetHeight }
    const capacityTop = round(fieldTop + targetHeight + type.heading * 1.55)
    const capacityWidth = (columnWidth - gap * 3) / 4
    capacityButtons = Array.from({ length: 4 }, (_, index) => ({
      x: round(left + index * (capacityWidth + gap)),
      y: capacityTop,
      width: round(capacityWidth),
      height: MIN_TOUCH_PX,
    }))
    createButton = {
      x: left,
      y: round(capacityTop + MIN_TOUCH_PX + gap),
      width: round(columnWidth),
      height: targetHeight,
    }
    codeInput = { x: right, y: fieldTop, width: round(columnWidth), height: targetHeight }
    joinButton = {
      x: right,
      y: round(fieldTop + targetHeight + gap),
      width: round(columnWidth),
      height: targetHeight,
    }
  } else {
    const fieldTop = round(content.y + type.heading * 1.35)
    nameInput = { x: content.x, y: fieldTop, width: content.width, height: targetHeight }
    const capacityTop = round(fieldTop + targetHeight + type.heading * 1.55)
    const capacityWidth = (content.width - gap * 3) / 4
    capacityButtons = Array.from({ length: 4 }, (_, index) => ({
      x: round(content.x + index * (capacityWidth + gap)),
      y: capacityTop,
      width: round(capacityWidth),
      height: MIN_TOUCH_PX,
    }))
    createButton = {
      x: content.x,
      y: round(capacityTop + MIN_TOUCH_PX + gap),
      width: content.width,
      height: targetHeight,
    }
    const joinTop = round(createButton.y + createButton.height + type.heading * 1.55)
    const joinWidth = round(clamp(content.width * 0.36, 96, 180))
    codeInput = {
      x: content.x,
      y: joinTop,
      width: round(content.width - joinWidth - gap),
      height: targetHeight,
    }
    joinButton = {
      x: round(content.x + content.width - joinWidth),
      y: joinTop,
      width: joinWidth,
      height: targetHeight,
    }
  }

  const roomButtonGap = gap
  const roomButtonWidth = (content.width - roomButtonGap) / 2
  const roomButtonsTop = round(content.y + content.height - targetHeight * 2 - roomButtonGap)
  const roomButtons: [Rect, Rect, Rect, Rect] = [0, 1, 2, 3].map((index) => ({
    x: round(content.x + (index % 2) * (roomButtonWidth + roomButtonGap)),
    y: round(roomButtonsTop + Math.floor(index / 2) * (targetHeight + roomButtonGap)),
    width: round(roomButtonWidth),
    height: targetHeight,
  })) as [Rect, Rect, Rect, Rect]
  const members: Rect = {
    x: content.x,
    y: round(content.y + type.title * 1.65),
    width: content.width,
    height: round(Math.max(type.body * 3, roomButtonsTop - gap - content.y - type.title * 1.65)),
  }
  const backButton: Rect = mode === 'landscape'
    ? {
        x: codeInput.x,
        y: round(joinButton.y + joinButton.height + gap),
        width: codeInput.width,
        height: MIN_TOUCH_PX,
      }
    : {
        x: content.x,
        y: round(codeInput.y + codeInput.height + gap),
        width: content.width,
        height: MIN_TOUCH_PX,
      }

  return {
    mode,
    width,
    height,
    type,
    gutter: g,
    title,
    content,
    nameInput,
    capacityButtons,
    createButton,
    codeInput,
    joinButton,
    members,
    roomButtons,
    backButton,
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
  railVisible: boolean
  topBar: Rect
  pauseButton: Rect
  river: Rect
  rail: Rect
  railAxis: RailAxis
  rhythmLane: Rect
  /** Where a stroke must be played, in absolute x within the lane. */
  targetX: number
  gateLabel: Point
  laneHint: Point
  controls: { forward: Rect; backward: Rect }
  call: Point
  callSub: Point
  feedback: Point
  raft: Point
  survivalStatus: Point
  timeText: Point
  statsText: Point
  modalPanel: Rect
  modalPrimaryButton: Rect
  modalSecondaryButton: Rect
}

export function riverLayout(width: number, height: number, railVisible = true): RiverLayout {
  const mode = layoutMode(width, height)
  const type = typography(width, height)
  const g = gutter(width, height)
  const controlGap = round(clamp(g * 0.5, 8, 16))
  const modalWidth = round(Math.min(width - g * 2, 620))
  const modalHeight = round(Math.min(height - g * 2, 440))
  const modalPanel: Rect = {
    x: round((width - modalWidth) / 2),
    y: round((height - modalHeight) / 2),
    width: modalWidth,
    height: modalHeight,
  }
  const modalButtonHeight = round(clamp(height * 0.08, 52, 66))
  const modalSecondaryButton: Rect = {
    x: round(modalPanel.x + modalPanel.width * 0.14),
    y: round(modalPanel.y + modalPanel.height - g - modalButtonHeight),
    width: round(modalPanel.width * 0.72),
    height: modalButtonHeight,
  }
  const modalPrimaryButton: Rect = {
    ...modalSecondaryButton,
    y: round(modalSecondaryButton.y - controlGap - modalButtonHeight),
  }

  // A phone held sideways has so little height that stacking everything leaves
  // the world a letterbox slit. Float the controls instead.
  const controlsOverlay = mode === 'landscape' && height < 520

  if (controlsOverlay) {
    const topBarHeight = round(
      clamp(height * 0.1, Math.max(type.heading * 2, MIN_TOUCH_PX + 8), 60),
    )
    const railThickness = railVisible ? round(clamp(width * 0.11, 84, 150)) : 0
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
    const pauseSize = round(clamp(topBarHeight * 0.68, MIN_TOUCH_PX, 54))

    const rhythmLane: Rect = {
      x: round(river.x + controlWidth + controlGap + edge),
      y: round(bottom - laneHeight),
      width: round(river.width - (controlWidth + controlGap + edge) * 2),
      height: laneHeight,
    }

    const targetX = round(rhythmLane.x + rhythmLane.width * 0.5)

    return {
      mode,
      width,
      height,
      type,
      gutter: g,
      controlsOverlay,
      railVisible,
      topBar: { x: 0, y: 0, width: round(width), height: topBarHeight },
      pauseButton: {
        x: round(width - g - pauseSize),
        y: round((topBarHeight - pauseSize) / 2),
        width: pauseSize,
        height: pauseSize,
      },
      river,
      rail: {
        x: round(width - railThickness),
        y: topBarHeight,
        width: railThickness,
        height: round(height - topBarHeight),
      },
      railAxis: 'vertical',
      rhythmLane,
      targetX,
      gateLabel: { x: targetX, y: round(rhythmLane.y + type.label * 0.8) },
      laneHint: {
        x: round(rhythmLane.x + g * 0.55),
        y: round(rhythmLane.y + rhythmLane.height - type.label * 0.55),
      },
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
      timeText: { x: round(width / 2), y: round(topBarHeight * 0.5) },
      statsText: { x: round(width - g - pauseSize - g * 0.55), y: round(topBarHeight * 0.5) },
      modalPanel,
      modalPrimaryButton,
      modalSecondaryButton,
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
    !railVisible
      ? 0
      : mode === 'landscape'
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
  const pauseSize = round(clamp(topBarHeight * 0.62, MIN_TOUCH_PX, 58))
  const targetX = round(rhythmLane.x + rhythmLane.width * 0.5)

  return {
    mode,
    width,
    height,
    type,
    gutter: g,
    controlsOverlay,
    railVisible,
    topBar: { x: 0, y: 0, width: round(width), height: topBarHeight },
    pauseButton: {
      x: round(width - g - pauseSize),
      y: round((topBarHeight - pauseSize) / 2),
      width: pauseSize,
      height: pauseSize,
    },
    river,
    rail,
    railAxis: mode === 'landscape' ? 'vertical' : 'horizontal',
    rhythmLane,
    targetX,
    gateLabel: { x: targetX, y: round(rhythmLane.y + type.label * 0.8) },
    laneHint: {
      x: round(rhythmLane.x + g * 0.55),
      y: round(rhythmLane.y + rhythmLane.height - type.label * 0.55),
    },
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
    timeText: { x: round(width / 2), y: round(topBarHeight * 0.5) },
    statsText: { x: round(width - g - pauseSize - g * 0.55), y: round(topBarHeight * 0.5) },
    modalPanel,
    modalPrimaryButton,
    modalSecondaryButton,
  }
}
