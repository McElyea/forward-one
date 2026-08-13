import Phaser from 'phaser'
import {
  getSelectedGuideVoiceId,
  guideAudioKey,
  loadGuideAudio,
  type GuideCallNumber,
  type GuideVoiceId,
} from '../audio/guideAudio'
import { getLevel } from '../levels'
import { SimulatedRaceAdapter } from '../race/SimulatedRaceAdapter'
import { SoloRaceAdapter } from '../race/SoloRaceAdapter'
import type { RaceAdapter } from '../race/RaceAdapter'
import { RhythmEngine } from '../rhythm/RhythmEngine'
import type {
  LevelConfig,
  PaddleDirection,
  RaceMode,
  RacerSnapshot,
  StrokeJudgment,
  StrokeRating,
} from '../types'
import { riverLayout, type RiverLayout } from '../ui/layout'
import { bodyStyle, COLORS, headingStyle, hexToNumber } from '../ui/theme'

interface RiverSceneData {
  levelId?: string
  mode?: RaceMode
}

const RATING_COLOR: Record<StrokeRating, string> = {
  perfect: '#ffc857',
  good: '#73e2a7',
  early: '#ff9f5a',
  late: '#ff9f5a',
  wrong: '#e84a5f',
  miss: '#ff6b6b',
}

const LOOK_AHEAD_MS = 2_200

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

/** The channel outline, as fractions of the river region rather than pixels. */
const LEFT_BANK: Array<[number, number]> = [
  [0, 0], [0.159, 0], [0.197, 0.154], [0.139, 0.355], [0.178, 0.581],
  [0.21, 0.712], [0.144, 0.868], [0.173, 1], [0, 1],
]
const RIGHT_BANK: Array<[number, number]> = [
  [0.841, 0], [1, 0], [1, 1], [0.837, 1], [0.793, 0.837], [0.87, 0.658],
  [0.817, 0.457], [0.774, 0.301], [0.865, 0.138],
]
const WATER: Array<[number, number]> = [
  [0.159, 0], [0.841, 0], [0.865, 0.138], [0.774, 0.301], [0.817, 0.457],
  [0.87, 0.658], [0.793, 0.837], [0.837, 1], [0.173, 1], [0.144, 0.868],
  [0.21, 0.712], [0.178, 0.581], [0.139, 0.355], [0.197, 0.154],
]

export class RiverScene extends Phaser.Scene {
  private level!: LevelConfig
  private mode: RaceMode = 'solo'
  private rhythm!: RhythmEngine
  private race!: RaceAdapter
  private layout!: RiverLayout
  private startAt = 0
  private lastCueIndex = -1
  private paddleGain = 0
  private progress = 0
  private totalPoints = 0
  private completed = false
  private returningToMenu = false
  private riverGraphics!: Phaser.GameObjects.Graphics
  private rhythmGraphics!: Phaser.GameObjects.Graphics
  private raceGraphics!: Phaser.GameObjects.Graphics
  private raft!: Phaser.GameObjects.Container
  private callText!: Phaser.GameObjects.Text
  private callSubtext!: Phaser.GameObjects.Text
  private feedbackText!: Phaser.GameObjects.Text
  private statsText!: Phaser.GameObjects.Text
  private timeText!: Phaser.GameObjects.Text
  private racers: RacerSnapshot[] = []
  private activeGuideCall?: Phaser.Sound.BaseSound
  private guideVoiceId: GuideVoiceId = getSelectedGuideVoiceId()
  /**
   * How each display object places itself for a given layout. Registering a
   * closure per object means a rotate mid-run can re-place everything without
   * rebuilding the scene, which would throw the run away.
   */
  private layoutAppliers: Array<(layout: RiverLayout) => void> = []

  constructor() {
    super('river')
  }

  preload(): void {
    loadGuideAudio(this)
  }

  init(data: RiverSceneData): void {
    this.level = getLevel(data.levelId ?? 'class-ii')
    this.mode = data.mode ?? 'solo'
    this.rhythm = new RhythmEngine(this.level.cues)
    this.race = this.mode === 'solo' ? new SoloRaceAdapter() : new SimulatedRaceAdapter()
    this.lastCueIndex = -1
    this.paddleGain = 0
    this.progress = 0
    this.totalPoints = 0
    this.completed = false
    this.returningToMenu = false
    this.guideVoiceId = getSelectedGuideVoiceId()
    this.racers = []
    // Scene instances are reused, so this must not carry the last run's closures.
    this.layoutAppliers = []
  }

  /** Register how an object places itself, and place it now. */
  private onLayout(apply: (layout: RiverLayout) => void): void {
    this.layoutAppliers.push(apply)
    apply(this.layout)
  }

  private handleResize(): void {
    this.layout = riverLayout(this.scale.width, this.scale.height)
    for (const apply of this.layoutAppliers) apply(this.layout)
  }

  create(): void {
    this.layout = riverLayout(this.scale.width, this.scale.height)

    this.cameras.main.setBackgroundColor(COLORS.bank)
    this.riverGraphics = this.add.graphics()
    this.createRaft()
    this.createHud()
    this.rhythmGraphics = this.add.graphics()
    this.raceGraphics = this.add.graphics()

    this.input.keyboard?.on('keydown-SPACE', this.onForwardPaddle, this)
    this.input.keyboard?.on('keydown-F', this.onForwardPaddle, this)
    this.input.keyboard?.on('keydown-UP', this.onForwardPaddle, this)
    this.input.keyboard?.on('keydown-B', this.onBackwardPaddle, this)
    this.input.keyboard?.on('keydown-DOWN', this.onBackwardPaddle, this)
    this.input.keyboard?.on('keydown-ESC', this.returnToMenu, this)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanUp, this)

    this.startAt = this.time.now + 2_400
    this.race.start(this.level.durationMs)
  }

  update(time: number): void {
    if (this.completed) return

    const elapsed = time - this.startAt
    const activeElapsed = Math.max(0, elapsed)
    const missed = this.rhythm.expire(activeElapsed)

    for (const target of missed) {
      this.showFeedback('MISS', 'miss')
      this.race.recordStroke({ target, rating: 'miss', offsetMs: null, points: 0 })
    }

    this.updateCue(activeElapsed)
    this.updateProgress(activeElapsed)
    this.racers = this.race.update(activeElapsed, this.progress)
    this.drawRiver(activeElapsed)
    this.drawRhythmLane(activeElapsed)
    this.drawRaceRail()
    this.updateRaft(activeElapsed)
    this.updateHud(activeElapsed, elapsed < 0)

    if (this.progress >= 1) {
      this.finishRace(activeElapsed)
    }
  }

  private createRaft(): void {
    const raftBody = this.add.graphics()
    const crew = this.add.graphics()
    this.raft = this.add.container(this.layout.raft.x, this.layout.raft.y, [raftBody, crew])
    this.raft.setDepth(5)

    this.onLayout((layout) => {
      // The raft scales with the river so it stays legible on a phone without
      // swallowing the channel on a desktop.
      const s = Phaser.Math.Clamp(Math.min(layout.river.width, layout.river.height) / 640, 0.55, 1.25)
      raftBody.clear()
      raftBody.fillStyle(0xf05a3d, 1)
      raftBody.fillRoundedRect(-46 * s, -24 * s, 92 * s, 48 * s, 21 * s)
      raftBody.lineStyle(5 * s, 0xffa56e, 1)
      raftBody.strokeRoundedRect(-42 * s, -20 * s, 84 * s, 40 * s, 18 * s)
      raftBody.fillStyle(0x17343a, 1)
      raftBody.fillEllipse(0, 0, 59 * s, 24 * s)

      crew.clear()
      crew.fillStyle(0xffc857, 1)
      crew.fillCircle(-19 * s, -5 * s, 6 * s)
      crew.fillCircle(19 * s, -5 * s, 6 * s)
      crew.fillStyle(0xf5f1df, 1)
      crew.fillCircle(-19 * s, 9 * s, 5 * s)
      crew.fillCircle(19 * s, 9 * s, 5 * s)
    })
  }

  private createHud(): void {
    const { type } = this.layout
    const topBar = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.94).setOrigin(0).setDepth(10)
    topBar.setStrokeStyle(0)
    this.onLayout((layout) => {
      topBar.setPosition(0, 0).setSize(layout.topBar.width, layout.topBar.height)
    })

    const brand = this.add.text(0, 0, 'FORWARD / ONE', headingStyle(type.heading)).setDepth(11).setLetterSpacing(1)
    const classLabel = this.add
      .text(0, 0, `CLASS ${this.level.rapidClass}`, headingStyle(type.heading, this.level.accent))
      .setDepth(11)
    const modeLabel = this.add
      .text(0, 0, this.mode === 'solo' ? 'SOLO RUN' : 'RACE PREVIEW', headingStyle(type.label, '#9bb9b4'))
      .setDepth(11)
    this.timeText = this.add.text(0, 0, '00:00', headingStyle(type.title)).setDepth(11)
    this.statsText = this.add.text(0, 0, '100%  /  0', bodyStyle(type.label, '#9bb9b4')).setDepth(11).setOrigin(1, 0.5)

    this.onLayout((layout) => {
      const mid = layout.topBar.height / 2
      const g = layout.gutter
      brand.setPosition(g, mid).setOrigin(0, 0.5).setFontSize(layout.type.heading)
      classLabel
        .setPosition(g + brand.width + g * 0.7, mid)
        .setOrigin(0, 0.5)
        .setFontSize(layout.type.heading)
      modeLabel
        .setPosition(g + brand.width + classLabel.width + g * 1.4, mid)
        .setOrigin(0, 0.5)
        .setFontSize(layout.type.label)
        // A phone in portrait has no width for the mode caption.
        .setVisible(layout.mode === 'landscape')
      this.timeText
        .setPosition(layout.statsText.x - layout.type.body * 4.2, mid)
        .setOrigin(1, 0.5)
        .setFontSize(layout.type.title)
      this.statsText.setPosition(layout.statsText.x, mid).setFontSize(layout.type.label)
    })

    this.callText = this.add.text(0, 0, 'GET READY', headingStyle(type.hero, '#ffc857'))
      .setOrigin(0.5)
      .setDepth(9)
      .setShadow(0, 4, '#071f26', 7, true, true)
    this.callSubtext = this.add.text(0, 0, 'Listen for the guide', headingStyle(type.body, '#d7e8e1'))
      .setOrigin(0.5)
      .setDepth(9)
      .setLetterSpacing(1.3)
    this.feedbackText = this.add.text(0, 0, '', headingStyle(type.title))
      .setOrigin(0.5)
      .setDepth(20)

    this.onLayout((layout) => {
      this.callText.setPosition(layout.call.x, layout.call.y)
      this.callSubtext.setPosition(layout.callSub.x, layout.callSub.y).setFontSize(layout.type.body)
      this.feedbackText
        .setPosition(layout.feedback.x, layout.feedback.y)
        .setFontSize(layout.type.title)
    })

    const railTitle = this.add.text(0, 0, 'RACE LINE', headingStyle(type.label, '#9bb9b4')).setDepth(12).setLetterSpacing(1.5)
    const railStart = this.add.text(0, 0, 'START', headingStyle(type.label, '#688e87')).setDepth(12)
    const railFinish = this.add.text(0, 0, 'FINISH', headingStyle(type.label, '#688e87')).setDepth(12)
    this.onLayout((layout) => {
      const { rail } = layout
      const small = Math.round(layout.type.label * 0.85)
      railTitle.setFontSize(small)
      railStart.setFontSize(small)
      railFinish.setFontSize(small)
      if (layout.railAxis === 'vertical') {
        railTitle.setOrigin(0.5, 0).setPosition(rail.x + rail.width / 2, rail.y + small * 0.6)
        railStart.setOrigin(0.5, 1).setPosition(rail.x + rail.width / 2, rail.y + rail.height - 2)
        railFinish.setOrigin(0.5, 0).setPosition(rail.x + rail.width / 2, rail.y + small * 2.4)
        railTitle.setVisible(true)
      } else {
        railTitle.setVisible(false)
        railStart.setOrigin(0, 0.5).setPosition(rail.x + 6, rail.y + rail.height / 2)
        railFinish.setOrigin(1, 0.5).setPosition(rail.x + rail.width - 6, rail.y + rail.height / 2)
      }
    })

    const escHint = this.add.text(0, 0, 'ESC  MENU', headingStyle(type.label, '#9bb9b4')).setDepth(20).setLetterSpacing(1)
    this.onLayout((layout) => {
      escHint
        .setFontSize(Math.round(layout.type.label * 0.9))
        .setOrigin(0, 1)
        .setPosition(layout.gutter * 0.5, layout.rhythmLane.y - 4)
        // Keyboard hint is meaningless on a phone, where the buttons are the input.
        .setVisible(layout.mode === 'landscape')
    })

    this.createPaddleButton('forward', 'FORWARD', 'SPACE  /  F')
    this.createPaddleButton('backward', 'BACKWARDS', 'B  /  ↓')
  }

  private createPaddleButton(
    direction: PaddleDirection,
    label: string,
    keyLabel: string,
  ): void {
    const color = direction === 'forward' ? COLORS.yellow : COLORS.waterLight
    const button = this.add.rectangle(0, 0, 10, 10, color, 1).setOrigin(0).setDepth(21)
    button.setInteractive({ useHandCursor: true })
    const title = this.add.text(0, 0, label, headingStyle(this.layout.type.heading, '#071f26')).setDepth(22)
    const keys = this.add.text(0, 0, keyLabel, headingStyle(this.layout.type.label, '#16424a')).setDepth(22)

    this.onLayout((layout) => {
      const rect = direction === 'forward' ? layout.controls.forward : layout.controls.backward
      button.setPosition(rect.x, rect.y).setSize(rect.width, rect.height)
      button.setInteractive({ useHandCursor: true })
      title
        .setFontSize(layout.type.heading)
        .setOrigin(0, 0.5)
        .setPosition(rect.x + rect.width * 0.07, rect.y + rect.height / 2)
      keys
        .setFontSize(Math.round(layout.type.label * 0.9))
        .setOrigin(1, 0.5)
        .setPosition(rect.x + rect.width - rect.width * 0.07, rect.y + rect.height / 2)
        .setVisible(layout.mode === 'landscape')
    })

    button.on('pointerdown', () => this.onPaddle(direction))
    button.on('pointerover', () => button.setAlpha(0.84))
    button.on('pointerout', () => button.setAlpha(1))
  }

  private drawRiver(elapsed: number): void {
    const graphics = this.riverGraphics
    const { river } = this.layout
    const fx = (f: number): number => river.x + f * river.width
    const fy = (f: number): number => river.y + f * river.height
    const poly = (points: Array<[number, number]>): void => {
      graphics.beginPath()
      graphics.moveTo(fx(points[0][0]), fy(points[0][1]))
      for (const [x, y] of points.slice(1)) graphics.lineTo(fx(x), fy(y))
      graphics.closePath()
      graphics.fillPath()
    }

    const currentSpeed = 0.17 + this.level.rapidClass * 0.025
    const flowDistance = elapsed * currentSpeed
    const wrapFlowY = (offset: number, speedMultiplier = 1): number => {
      const distance = (offset + flowDistance * speedMultiplier) % river.height
      return river.y + (distance < 0 ? distance + river.height : distance)
    }

    graphics.clear()
    graphics.fillStyle(COLORS.bank, 1)
    graphics.fillRect(river.x, river.y, river.width, river.height)
    graphics.fillStyle(COLORS.bankLight, 1)
    poly(LEFT_BANK)
    poly(RIGHT_BANK)
    graphics.fillStyle(COLORS.water, 1)
    poly(WATER)

    // Long current streaks give the strongest sense that the camera follows the
    // raft while the surface travels underneath it.
    const laneSpan = river.width * 0.52
    for (let i = 0; i < 18; i += 1) {
      const y = wrapFlowY((i * 149) % river.height, 0.82 + (i % 4) * 0.08)
      const length = river.height * (0.075 + (i % 5) * 0.023)
      const laneX = fx(0.24) + ((i * 163) % laneSpan)
      const x = laneX + Math.sin(elapsed * 0.0011 + i * 1.7) * (river.width * 0.028)
      const tailY = Math.max(river.y + 3, y - length)
      const alpha = 0.28 + (i % 3) * 0.12

      graphics.lineStyle(i % 4 === 0 ? 4 : 2, i % 3 === 0 ? COLORS.cream : COLORS.waterLight, alpha)
      graphics.beginPath()
      graphics.moveTo(x - 7, tailY)
      graphics.lineTo(x + 3, tailY + (y - tailY) * 0.35)
      graphics.lineTo(x - 2, tailY + (y - tailY) * 0.72)
      graphics.lineTo(x + 5, y)
      graphics.strokePath()

      if (i % 3 === 0) {
        graphics.fillStyle(COLORS.cream, alpha + 0.12)
        graphics.fillEllipse(x + 5, y, river.width * 0.016, 4)
      }
    }

    // Small wave crests move a little faster than the deeper current bands.
    for (let i = 0; i < 10; i += 1) {
      const y = wrapFlowY(river.height * 0.065 + i * (river.height * 0.129), 1.14)
      const x = fx(0.3) + ((i * 127) % (river.width * 0.385)) + Math.sin(elapsed * 0.0015 + i) * (river.width * 0.037)
      const w = river.width * (0.033 + (i % 4) * 0.011)

      graphics.lineStyle(3, COLORS.cream, 0.55)
      graphics.beginPath()
      graphics.moveTo(x - w / 2, y - 5)
      graphics.lineTo(x, y)
      graphics.lineTo(x + w / 2, y - 5)
      graphics.strokePath()
    }

    // Fast flecks make the closest layer of water visibly rush past the boat.
    graphics.fillStyle(0xe9f7ef, 0.8)
    const rapidStrength = this.level.rapidClass - 1
    for (let i = 0; i < 12 + rapidStrength * 2; i += 1) {
      const y = wrapFlowY((i * 97) % river.height, 1.32 + (i % 3) * 0.07)
      const x = fx(0.26) + ((i * 157) % (river.width * 0.48)) + Math.sin(elapsed * 0.001 + i) * (river.width * 0.023)
      graphics.fillEllipse(x, y, river.width * (0.017 + (i % 4) * 0.0087), 3 + (i % 2) * 2)
    }

    // A widening wake anchors all of that motion to the player's raft.
    const raftX = this.raft.x
    const wakeOffset = flowDistance % 27
    for (let i = 0; i < 5; i += 1) {
      const y = this.raft.y + river.height * 0.053 + i * 24 + wakeOffset
      if (y > river.y + river.height * 0.85) continue
      const spread = 30 + i * 8
      graphics.lineStyle(3, COLORS.cream, 0.42 - i * 0.045)
      graphics.lineBetween(raftX - 24, y - 10, raftX - spread, y)
      graphics.lineBetween(raftX + 24, y - 10, raftX + spread, y)
    }

    // Minimal bank markers scroll more slowly, creating inexpensive parallax.
    for (let i = 0; i < 8; i += 1) {
      const y = wrapFlowY(30 + i * (river.height * 0.141), 0.54)
      const radius = 7 + (i % 3) * 3
      graphics.fillStyle(i % 2 === 0 ? 0x244b3d : 0x5f8066, 0.9)
      graphics.fillCircle(fx(0.069) + (i % 3) * 27, y, radius)
      graphics.fillCircle(fx(0.908) + (i % 3) * 24, y + 18, radius + 1)
    }
  }

  private drawRhythmLane(elapsed: number): void {
    const graphics = this.rhythmGraphics
    const { rhythmLane: lane, targetX } = this.layout
    graphics.clear()
    graphics.setDepth(15)
    graphics.fillStyle(COLORS.ink, 0.91)
    graphics.fillRoundedRect(lane.x, lane.y, lane.width, lane.height, 14)
    graphics.lineStyle(2, 0x31545a, 1)
    graphics.strokeRoundedRect(lane.x, lane.y, lane.width, lane.height, 14)

    const midY = lane.y + lane.height / 2
    const inset = lane.height * 0.11
    graphics.lineStyle(4, COLORS.yellow, 1)
    graphics.lineBetween(targetX, lane.y + inset, targetX, lane.y + lane.height - inset)
    graphics.fillStyle(COLORS.yellow, 1)
    graphics.fillTriangle(targetX - 8, lane.y + inset, targetX + 8, lane.y + inset, targetX, lane.y + inset + 12)

    if (elapsed < 0) return

    // Markers travel so that a target LOOK_AHEAD_MS away sits at the lane's far
    // edge, which keeps the read the same however wide the screen is.
    const speed = (lane.x + lane.width - targetX) / LOOK_AHEAD_MS
    const radius = Math.max(8, Math.min(14, lane.height * 0.16))

    for (const target of this.rhythm.getVisible(elapsed, LOOK_AHEAD_MS)) {
      const x = targetX + (target.targetTime - elapsed) * speed
      if (x < lane.x + radius || x > lane.x + lane.width - radius) continue
      const markerColor = target.direction === 'forward'
        ? (target.strokeIndex === 0 ? hexToNumber(this.level.accent) : COLORS.cream)
        : COLORS.waterLight
      graphics.fillStyle(markerColor, 1)
      graphics.fillCircle(x, midY, radius)
      graphics.lineStyle(3, COLORS.ink, 0.55)
      graphics.strokeCircle(x, midY, radius)
      graphics.fillStyle(COLORS.ink, 0.78)
      const a = radius * 0.5
      if (target.direction === 'forward') {
        graphics.fillTriangle(x - a * 0.6, midY - a, x - a * 0.6, midY + a, x + a, midY)
      } else {
        graphics.fillTriangle(x + a * 0.6, midY - a, x + a * 0.6, midY + a, x - a, midY)
      }
    }
  }

  private drawRaceRail(): void {
    const graphics = this.raceGraphics
    const { rail, railAxis, type } = this.layout
    graphics.clear()
    graphics.setDepth(11)
    graphics.fillStyle(COLORS.ink, 0.92)
    graphics.fillRect(rail.x, rail.y, rail.width, rail.height)

    const vertical = railAxis === 'vertical'
    // Track inset so the end caps and labels are not clipped.
    const padStart = vertical ? type.label * 3.4 : type.label * 3.6
    const padEnd = vertical ? type.label * 1.6 : type.label * 3.6
    const axisFrom = vertical ? rail.y + rail.height - padEnd : rail.x + padStart
    const axisTo = vertical ? rail.y + padStart : rail.x + rail.width - padEnd
    const cross = vertical ? rail.x + rail.width * 0.32 : rail.y + rail.height / 2

    graphics.lineStyle(4, 0x31545a, 1)
    if (vertical) {
      graphics.lineBetween(cross, axisFrom, cross, axisTo)
    } else {
      graphics.lineBetween(axisFrom, cross, axisTo, cross)
    }

    const sorted = [...this.racers].sort((a, b) => b.progress - a.progress)
    for (const racer of sorted) {
      const along = axisFrom + (axisTo - axisFrom) * racer.progress
      const x = vertical ? cross : along
      const y = vertical ? along : cross
      const radius = racer.isLocal ? 11 : 8

      graphics.fillStyle(racer.color, 1)
      graphics.fillCircle(x, y, radius)
      graphics.lineStyle(racer.isLocal ? 3 : 2, COLORS.cream, racer.isLocal ? 1 : 0.55)
      graphics.strokeCircle(x, y, radius)

      const name = `racer-${racer.id}`
      const size = Math.round(type.label * (racer.isLocal ? 0.95 : 0.85))
      const color = `#${racer.color.toString(16).padStart(6, '0')}`
      const label = this.children.getByName(name) as Phaser.GameObjects.Text | null
      if (label) {
        label.setFontSize(size).setPosition(
          vertical ? x + radius + 6 : x,
          vertical ? y : y - radius - size * 1.1,
        )
        label.setOrigin(vertical ? 0 : 0.5, vertical ? 0.5 : 0)
      } else {
        this.add
          .text(x, y, racer.name, headingStyle(size, color))
          .setName(name)
          .setDepth(13)
          .setOrigin(vertical ? 0 : 0.5, vertical ? 0.5 : 0)
      }
    }
  }

  private updateCue(elapsed: number): void {
    const leadTime = 1_500
    const cueIndex = this.level.cues.findIndex((cue) => {
      const interval = cue.interval ?? 560
      const end = cue.at + (cue.strokes - 1) * interval + 650
      return elapsed >= cue.at - leadTime && elapsed <= end
    })

    if (cueIndex === -1) {
      if (elapsed > 0) {
        this.callText
          .setText('READ THE WATER')
          .setColor('#f5f1df')
          .setFontSize(Math.round(this.layout.type.hero * 0.6))
        this.callSubtext.setText('Hold the line')
      }
      return
    }

    const cue = this.level.cues[cueIndex]
    const directionLabel = cue.direction === 'forward' ? 'FORWARD' : 'BACKWARDS'
    this.callText
      .setText(`${directionLabel} ${cue.strokes}!`)
      .setColor(cue.direction === 'forward' ? this.level.accent : '#55c3cc')
      .setFontSize(
        cue.direction === 'forward' ? this.layout.type.hero : Math.round(this.layout.type.hero * 0.86),
      )
    this.callSubtext.setText(`${directionLabel} ONLY  /  ${cue.strokes} ${cue.strokes === 1 ? 'STROKE' : 'STROKES'}`)

    if (cueIndex !== this.lastCueIndex) {
      this.lastCueIndex = cueIndex
      this.tweens.add({ targets: this.callText, scale: { from: 1.14, to: 1 }, duration: 180 })
      this.speakCall(cue.direction, cue.strokes)
    }
  }

  private updateProgress(elapsed: number): void {
    const baseProgress = (elapsed / this.level.durationMs) * 0.78
    this.progress = clamp(baseProgress + this.paddleGain)
  }

  private updateRaft(elapsed: number): void {
    const { raft, river } = this.layout
    const wave = Math.sin(elapsed * 0.004)
    const sway = Math.sin(elapsed * 0.0013) * (river.width * 0.073)
    this.raft.setPosition(raft.x + sway, raft.y + wave * 8)
    this.raft.setRotation(wave * 0.055)
  }

  private updateHud(elapsed: number, countingDown: boolean): void {
    if (countingDown) {
      const seconds = Math.ceil((this.startAt - this.time.now) / 1000)
      this.callText
        .setText(seconds > 0 ? `${seconds}` : 'GO!')
        .setFontSize(Math.round(this.layout.type.hero * 1.2))
        .setColor('#ffc857')
      this.callSubtext.setText('THE CLOCK STARTS TOGETHER')
    }

    const seconds = Math.floor(elapsed / 1000)
    const centiseconds = Math.floor((elapsed % 1000) / 10)
    this.timeText.setText(`${String(seconds).padStart(2, '0')}:${String(centiseconds).padStart(2, '0')}`)
    this.statsText.setText(`${this.rhythm.getAccuracy()}%  /  ${this.totalPoints}`)
  }

  private onForwardPaddle(): void {
    this.onPaddle('forward')
  }

  private onBackwardPaddle(): void {
    this.onPaddle('backward')
  }

  private onPaddle(direction: PaddleDirection): void {
    if (this.completed || this.time.now < this.startAt) return

    const judgment = this.rhythm.judge(this.time.now - this.startAt, direction)
    this.applyJudgment(judgment)
  }

  private applyJudgment(judgment: StrokeJudgment): void {
    this.totalPoints += judgment.points
    const gain = {
      perfect: 0.024,
      good: 0.017,
      early: 0.007,
      late: 0.007,
      wrong: 0,
      miss: 0,
    }[judgment.rating]
    this.paddleGain += gain
    this.race.recordStroke(judgment)
    this.showFeedback(judgment.rating === 'wrong' ? 'WRONG WAY' : judgment.rating.toUpperCase(), judgment.rating)

    if (judgment.target) {
      this.tweens.add({
        targets: this.raft,
        y: this.raft.y - 16,
        duration: 90,
        yoyo: true,
        ease: 'Quad.out',
      })
    }
  }

  private showFeedback(label: string, rating: StrokeRating): void {
    const { feedback } = this.layout
    this.feedbackText.setText(label).setColor(RATING_COLOR[rating]).setAlpha(1).setScale(1.12)
    this.tweens.killTweensOf(this.feedbackText)
    this.tweens.add({
      targets: this.feedbackText,
      alpha: 0,
      scale: 1,
      y: { from: feedback.y, to: feedback.y - 20 },
      duration: 520,
    })
  }

  private speakCall(direction: PaddleDirection, strokes: number): void {
    if (strokes < 1 || strokes > 4) return
    this.activeGuideCall?.stop()
    this.activeGuideCall?.destroy()
    const guideCall = this.sound.add(guideAudioKey(this.guideVoiceId, direction, strokes as GuideCallNumber), {
      volume: 1,
    })
    this.activeGuideCall = guideCall
    guideCall.once(Phaser.Sound.Events.COMPLETE, () => {
      guideCall.destroy()
      if (this.activeGuideCall === guideCall) this.activeGuideCall = undefined
    })
    guideCall.play()
  }

  private finishRace(elapsed: number): void {
    this.completed = true
    this.activeGuideCall?.stop()
    const sorted = [...this.racers].sort((a, b) => b.progress - a.progress)
    const place = Math.max(1, sorted.findIndex((racer) => racer.isLocal) + 1)
    const placeLabel = ['FIRST', 'SECOND', 'THIRD', 'FOURTH'][place - 1] ?? `${place}TH`

    const scrim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.82).setOrigin(0).setDepth(50)
    const heading = this.add
      .text(0, 0, this.mode === 'solo' ? 'TAKE OUT' : `${placeLabel} PLACE`, headingStyle(this.layout.type.hero, this.level.accent))
      .setOrigin(0.5)
      .setDepth(51)
    const summary = this.add
      .text(0, 0, `${(elapsed / 1000).toFixed(2)} SEC   /   ${this.rhythm.getAccuracy()}% ACCURACY`, headingStyle(this.layout.type.heading, '#f5f1df'))
      .setOrigin(0.5)
      .setDepth(51)
      .setLetterSpacing(1.4)
    const blurb = this.add
      .text(0, 0, `${this.level.name} complete. Clean lines beat raw speed.`, bodyStyle(this.layout.type.body, '#9bb9b4'))
      .setOrigin(0.5)
      .setDepth(51)
      .setWordWrapWidth(this.layout.width * 0.8)
      .setAlign('center')
    const button = this.add.rectangle(0, 0, 10, 10, COLORS.yellow, 1).setDepth(51).setInteractive({ useHandCursor: true })
    const buttonLabel = this.add
      .text(0, 0, 'BACK TO PUT-IN', headingStyle(this.layout.type.heading, '#071f26'))
      .setOrigin(0.5)
      .setDepth(52)
      .setInteractive({ useHandCursor: true })

    this.onLayout((layout) => {
      const cx = layout.width / 2
      const cy = layout.height / 2
      scrim.setPosition(0, 0).setSize(layout.width, layout.height)
      heading.setFontSize(layout.type.hero).setPosition(cx, cy - layout.height * 0.19)
      summary.setFontSize(layout.type.heading).setPosition(cx, cy - layout.height * 0.05)
      blurb
        .setFontSize(layout.type.body)
        .setWordWrapWidth(layout.width * 0.8)
        .setPosition(cx, cy + layout.height * 0.03)
      const bw = Math.min(layout.width * 0.62, 280)
      const bh = Math.max(48, layout.height * 0.09)
      button.setPosition(cx, cy + layout.height * 0.17).setSize(bw, bh)
      button.setInteractive({ useHandCursor: true })
      buttonLabel.setFontSize(layout.type.heading).setPosition(cx, cy + layout.height * 0.17)
    })

    const activateButton = (): void => this.returnToMenu()
    button.on('pointerdown', activateButton)
    buttonLabel.on('pointerdown', activateButton)
    button.on('pointerover', () => button.setFillStyle(0xffd979, 1))
    button.on('pointerout', () => button.setFillStyle(COLORS.yellow, 1))
  }

  private returnToMenu(): void {
    if (this.returningToMenu) return
    this.returningToMenu = true
    this.scene.start('menu', { levelId: this.level.id })
  }

  private cleanUp(): void {
    this.input.keyboard?.off('keydown-SPACE', this.onForwardPaddle, this)
    this.input.keyboard?.off('keydown-F', this.onForwardPaddle, this)
    this.input.keyboard?.off('keydown-UP', this.onForwardPaddle, this)
    this.input.keyboard?.off('keydown-B', this.onBackwardPaddle, this)
    this.input.keyboard?.off('keydown-DOWN', this.onBackwardPaddle, this)
    this.input.keyboard?.off('keydown-ESC', this.returnToMenu, this)
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.layoutAppliers = []
    this.race.destroy()
    this.activeGuideCall?.stop()
    this.activeGuideCall?.destroy()
    this.activeGuideCall = undefined
  }
}
