import Phaser from 'phaser'
import raftTopDownUrl from '../../assets/raft-top-down.png'
import {
  getSelectedGuideVoiceId,
  guideAudioKey,
  loadGuideAudio,
  type GuideCallNumber,
  type GuideVoiceId,
} from '../audio/guideAudio'
import { getLevel } from '../levels'
import { createRaceAdapter } from '../race/createRaceAdapter'
import type { HostedRaceSession } from '../race/HostedRaceSession'
import type { RaceAdapter } from '../race/RaceAdapter'
import { spreadRailLabels } from '../race/railLabels'
import { rankRacers } from '../race/rankRacers'
import { raceClockMs, raceElapsedMs, raceTimeExpired } from '../race/raceRules'
import { selectRailRacers } from '../race/selectRailRacers'
import { RhythmEngine } from '../rhythm/RhythmEngine'
import { callBanner, obstacleLabel, type BannerTone } from '../run/callBanner'
import { placeOfLocal, runOutcome, timeLimitOutcome } from '../run/runOutcome'
import {
  SurvivalEngine,
  type SurvivalTransition,
} from '../survival/SurvivalEngine'
import type {
  LevelConfig,
  PaddleDirection,
  RaceMode,
  RacerSnapshot,
  StrokeJudgment,
  StrokeRating,
} from '../types'
import { riverLayout, type RiverLayout } from '../ui/layout'
import { obstacleLaneTarget, raftDodgeCueIndex, raftLaneCrossingDuration, raftLaneTarget, raftLaneTravel } from '../ui/raftMotion'
import { formatRunClock } from '../ui/runClock'
import {
  bodyStyle,
  COLORS,
  headingStyle,
  hexToNumber,
  TEXT_COLORS,
} from '../ui/theme'

interface RiverSceneData {
  levelId?: string
  mode?: RaceMode
  hostedSession?: HostedRaceSession
}

const RATING_COLOR: Record<StrokeRating, string> = {
  perfect: TEXT_COLORS.yellow,
  good: TEXT_COLORS.success,
  early: TEXT_COLORS.warning,
  late: TEXT_COLORS.warning,
  wrong: TEXT_COLORS.danger,
  miss: TEXT_COLORS.danger,
}

const LOOK_AHEAD_MS = 2_200
const SCHEDULE_AHEAD_MS = LOOK_AHEAD_MS + 2_000
const CALL_LEAD_MS = 1_500
const MAX_VISIBLE_RAIL_RACERS = 8
const RAFT_TEXTURE_KEY = 'raft-top-down'

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
  private survival!: SurvivalEngine
  private race!: RaceAdapter
  private layout!: RiverLayout
  private startAt = 0
  private lastCueIndex = -1
  private totalPoints = 0
  private streak = 0
  private completed = false
  private paused = false
  private pausedAt = 0
  private returningToMenu = false
  private raftLaneMotion = { position: 0, lean: 0 }
  private raftStrokeMotion = { offsetY: 0 }
  private lastRaftCueIndex = -1
  private raftDisplayHeight = 120
  private riverGraphics!: Phaser.GameObjects.Graphics
  private rhythmGraphics!: Phaser.GameObjects.Graphics
  private raceGraphics!: Phaser.GameObjects.Graphics
  private raft!: Phaser.GameObjects.Container
  private swimmer!: Phaser.GameObjects.Graphics
  private callText!: Phaser.GameObjects.Text
  private callSubtext!: Phaser.GameObjects.Text
  private feedbackText!: Phaser.GameObjects.Text
  private feedbackPlate!: Phaser.GameObjects.Rectangle
  private gateLabelText!: Phaser.GameObjects.Text
  private laneHintText!: Phaser.GameObjects.Text
  private statsText!: Phaser.GameObjects.Text
  private survivalText!: Phaser.GameObjects.Text
  private timeText!: Phaser.GameObjects.Text
  private racers: RacerSnapshot[] = []
  private raceLabels = new Map<string, Phaser.GameObjects.Text>()
  private raceOverflowText!: Phaser.GameObjects.Text
  private activeGuideCall?: Phaser.Sound.BaseSound
  private pauseObjects: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text> = []
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
    this.load.image(RAFT_TEXTURE_KEY, raftTopDownUrl)
  }

  init(data: RiverSceneData): void {
    this.level = getLevel(data.levelId ?? 'class-ii')
    this.mode = data.mode ?? 'solo'
    this.rhythm = new RhythmEngine([])
    this.survival = new SurvivalEngine(this.level)
    this.race = createRaceAdapter(this.mode, data.hostedSession)
    this.lastCueIndex = -1
    this.totalPoints = 0
    this.streak = 0
    this.completed = false
    this.paused = false
    this.pausedAt = 0
    this.returningToMenu = false
    this.raftLaneMotion = { position: 0, lean: 0 }
    this.raftStrokeMotion = { offsetY: 0 }
    this.lastRaftCueIndex = -1
    this.raftDisplayHeight = 120
    this.guideVoiceId = getSelectedGuideVoiceId()
    this.racers = []
    this.raceLabels = new Map<string, Phaser.GameObjects.Text>()
    this.pauseObjects = []
    // Scene instances are reused, so this must not carry the last run's closures.
    this.layoutAppliers = []
  }

  /** Register how an object places itself, and place it now. */
  private onLayout(apply: (layout: RiverLayout) => void): void {
    this.layoutAppliers.push(apply)
    apply(this.layout)
  }

  private handleResize(): void {
    this.layout = riverLayout(this.scale.width, this.scale.height, this.mode !== 'solo')
    for (const apply of this.layoutAppliers) apply(this.layout)
  }

  create(): void {
    this.layout = riverLayout(this.scale.width, this.scale.height, this.mode !== 'solo')

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
    this.input.keyboard?.on('keydown-ESC', this.togglePause, this)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanUp, this)

    const raceStart = this.race.start(this.level.survivalBenchmarkMs)
    this.startAt = this.time.now + raceStart.countdownMs
  }

  update(time: number): void {
    if (this.completed || this.paused) return

    const elapsed = time - this.startAt
    const activeElapsed = raceElapsedMs(this.mode, elapsed)
    const scheduled = this.survival.ensureScheduledThrough(activeElapsed + SCHEDULE_AHEAD_MS)
    for (const event of scheduled) this.rhythm.addCue(event.cue)
    const missed = this.rhythm.expire(activeElapsed)

    for (const target of missed) {
      this.streak = 0
      this.showFeedback('MISS', 'miss')
      const judgment: StrokeJudgment = {
        target,
        rating: 'miss',
        offsetMs: null,
        points: 0,
      }
      this.survival.recordJudgment(judgment)
      this.race.recordStroke(judgment)
    }

    for (const transition of this.survival.resolveThrough(activeElapsed)) {
      this.handleSurvivalTransition(transition)
    }

    const survival = this.survival.getSnapshot(activeElapsed)
    this.updateCue(activeElapsed)
    const railProgress = clamp(activeElapsed / (this.level.survivalBenchmarkMs * 2.25))
    this.racers = this.race.update(
      activeElapsed,
      railProgress,
      survival.state === 'swept-away',
    )
    this.drawRiver(activeElapsed)
    this.drawRhythmLane(activeElapsed)
    this.drawRaceRail()
    this.updateRaft(activeElapsed)
    this.updateHud(activeElapsed, elapsed < 0)

    if (survival.state === 'swept-away') {
      this.finishRace(activeElapsed)
    } else if (raceTimeExpired(this.mode, elapsed)) {
      this.finishRace(activeElapsed, true)
    }
  }

  private createRaft(): void {
    const raftSprite = this.add.image(0, 0, RAFT_TEXTURE_KEY)
    this.raft = this.add.container(this.layout.raft.x, this.layout.raft.y, [raftSprite])
    this.raft.setDepth(5)
    this.swimmer = this.add.graphics().setDepth(6).setVisible(false)

    this.onLayout((layout) => {
      const s = Phaser.Math.Clamp(Math.min(layout.river.width, layout.river.height) / 640, 0.55, 1.25)
      const displayHeight = Phaser.Math.Clamp(
        Math.min(layout.river.height * 0.46, layout.river.width * 0.48),
        110,
        220,
      )
      this.raftDisplayHeight = displayHeight
      raftSprite.setDisplaySize(
        displayHeight * (raftSprite.width / raftSprite.height),
        displayHeight,
      )

      this.swimmer.clear()
      this.swimmer.fillStyle(COLORS.yellow, 1)
      this.swimmer.fillCircle(0, 0, 7 * s)
      this.swimmer.lineStyle(3 * s, COLORS.cream, 1)
      this.swimmer.lineBetween(-11 * s, 5 * s, 11 * s, 5 * s)
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
      .text(
        0,
        0,
        this.mode === 'solo' ? 'SOLO SURVIVAL' : 'SURVIVAL RACE',
        headingStyle(type.label, TEXT_COLORS.muted),
      )
      .setDepth(11)
    this.timeText = this.add.text(0, 0, formatRunClock(0), headingStyle(type.title)).setDepth(11)
    this.statsText = this.add
      .text(0, 0, 'ACCURACY 100%   SCORE 0', bodyStyle(type.label, TEXT_COLORS.muted))
      .setDepth(11)
      .setOrigin(1, 0.5)

    this.onLayout((layout) => {
      const mid = layout.topBar.height / 2
      const g = layout.gutter
      // A phone in portrait has no width for the wordmark or the mode caption
      // next to a clock that now reads M:SS.CC; the class is what identifies
      // the run, so it takes the left edge alone.
      const wide = layout.mode === 'landscape'
      brand
        .setPosition(g, mid)
        .setOrigin(0, 0.5)
        .setFontSize(layout.type.heading)
        .setVisible(wide)
      const classX = wide ? g + brand.width + g * 0.7 : g
      classLabel.setPosition(classX, mid).setOrigin(0, 0.5).setFontSize(layout.type.heading)
      modeLabel
        .setPosition(classX + classLabel.width + g * 1.4, mid)
        .setOrigin(0, 0.5)
        .setFontSize(layout.type.label)
        .setVisible(wide)
      this.timeText
        .setPosition(layout.timeText.x, mid)
        .setOrigin(0.5)
        .setFontSize(layout.type.title)
      this.statsText.setPosition(layout.statsText.x, mid).setFontSize(layout.type.label)
    })

    const pauseButton = this.add
      .rectangle(0, 0, 10, 10, COLORS.inkSoft, 1)
      .setOrigin(0)
      .setDepth(12)
      .setStrokeStyle(2, 0x31545a, 1)
      .setInteractive({ useHandCursor: true })
    const pauseLabel = this.add
      .text(0, 0, 'Ⅱ', headingStyle(type.heading, TEXT_COLORS.cream))
      .setOrigin(0.5)
      .setDepth(13)
      .setInteractive({ useHandCursor: true })
    this.onLayout((layout) => {
      const rect = layout.pauseButton
      pauseButton.setPosition(rect.x, rect.y).setSize(rect.width, rect.height)
      pauseLabel
        .setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2)
        .setFontSize(layout.type.heading)
    })
    const pause = (): void => this.togglePause()
    pauseButton.on('pointerdown', pause)
    pauseLabel.on('pointerdown', pause)

    this.callText = this.add.text(0, 0, 'GET READY', headingStyle(type.hero, '#ffc857'))
      .setOrigin(0.5)
      .setDepth(9)
      .setShadow(0, 4, '#071f26', 7, true, true)
    this.callSubtext = this.add.text(0, 0, 'Listen for the guide', headingStyle(type.body, '#d7e8e1'))
      .setOrigin(0.5)
      .setDepth(9)
      .setLetterSpacing(1.3)
    this.feedbackPlate = this.add
      .rectangle(0, 0, 10, 10, COLORS.ink, 0.78)
      .setDepth(19)
      .setStrokeStyle(2, COLORS.cream, 0.2)
      .setVisible(false)
    this.feedbackText = this.add.text(0, 0, '', headingStyle(type.title))
      .setOrigin(0.5)
      .setDepth(20)
    this.survivalText = this.add
      .text(0, 0, 'RAFT  ●●●', headingStyle(type.label, TEXT_COLORS.cream))
      .setDepth(12)
      .setLetterSpacing(1)

    this.onLayout((layout) => {
      this.callText.setPosition(layout.call.x, layout.call.y)
      this.callSubtext.setPosition(layout.callSub.x, layout.callSub.y).setFontSize(layout.type.body)
      this.feedbackText
        .setPosition(layout.feedback.x, layout.feedback.y)
        .setFontSize(layout.type.title)
      this.feedbackPlate
        .setPosition(layout.feedback.x, layout.feedback.y)
        .setSize(Math.max(132, layout.type.title * 6.4), Math.max(42, layout.type.title * 1.7))
      this.survivalText
        .setPosition(layout.survivalStatus.x, layout.survivalStatus.y)
        .setFontSize(layout.type.label)
    })

    this.gateLabelText = this.add
      .text(0, 0, 'HIT\nHERE', headingStyle(type.label, TEXT_COLORS.yellow))
      .setOrigin(0.5, 0)
      .setDepth(17)
      .setLetterSpacing(1)
      .setAlign('center')
    this.laneHintText = this.add
      .text(
        0,
        0,
        'MATCH THE CALL WHEN IT REACHES THE GATE',
        headingStyle(Math.round(type.label * 0.82), TEXT_COLORS.muted),
      )
      .setOrigin(0, 1)
      .setDepth(17)
      .setLetterSpacing(0.8)
    this.onLayout((layout) => {
      this.gateLabelText
        .setPosition(layout.gateLabel.x, layout.gateLabel.y)
        .setFontSize(layout.type.label)
      this.laneHintText
        .setPosition(layout.laneHint.x, layout.laneHint.y)
        .setFontSize(Math.round(layout.type.label * 0.82))
        .setVisible(!layout.controlsOverlay && layout.width >= 600)
    })

    const railTitle = this.add
      .text(0, 0, 'SURVIVAL', headingStyle(type.label, TEXT_COLORS.muted))
      .setDepth(12)
      .setLetterSpacing(1.5)
    const railStart = this.add
      .text(0, 0, 'PUT-IN', headingStyle(type.label, '#688e87'))
      .setDepth(12)
    const railFinish = this.add
      .text(0, 0, 'LONGEST', headingStyle(type.label, '#688e87'))
      .setDepth(12)
    this.raceOverflowText = this.add
      .text(0, 0, '', headingStyle(type.label, TEXT_COLORS.muted))
      .setDepth(14)
      .setLetterSpacing(1)
      .setVisible(false)
    this.onLayout((layout) => {
      const { rail } = layout
      const small = Math.round(layout.type.label * 0.85)
      railTitle.setFontSize(small)
      railStart.setFontSize(small)
      railFinish.setFontSize(small)
      this.raceOverflowText.setFontSize(small)
      if (layout.railAxis === 'vertical') {
        railTitle.setOrigin(0.5, 0).setPosition(rail.x + rail.width / 2, rail.y + small * 0.6)
        railStart.setOrigin(0.5, 1).setPosition(rail.x + rail.width / 2, rail.y + rail.height - 2)
        railFinish.setOrigin(0.5, 0).setPosition(rail.x + rail.width / 2, rail.y + small * 2.4)
        railTitle.setVisible(true)
        this.raceOverflowText
          .setOrigin(0.5, 0)
          .setPosition(rail.x + rail.width / 2, rail.y + small * 4)
      } else {
        railTitle.setVisible(false)
        railStart.setOrigin(0, 0.5).setPosition(rail.x + 6, rail.y + rail.height / 2)
        railFinish.setOrigin(1, 0.5).setPosition(rail.x + rail.width - 6, rail.y + rail.height / 2)
        this.raceOverflowText
          .setOrigin(0.5, 1)
          .setPosition(rail.x + rail.width / 2, rail.y + rail.height - 2)
      }
      railTitle.setVisible(layout.railVisible && layout.railAxis === 'vertical')
      railStart.setVisible(layout.railVisible)
      railFinish.setVisible(layout.railVisible)
      if (!layout.railVisible) this.raceOverflowText.setVisible(false)
    })

    const escHint = this.add.text(0, 0, 'ESC  PAUSE', headingStyle(type.label, '#9bb9b4')).setDepth(20).setLetterSpacing(1)
    this.onLayout((layout) => {
      escHint
        .setFontSize(Math.round(layout.type.label * 0.9))
        .setOrigin(0, 1)
        .setPosition(layout.gutter * 0.5, layout.rhythmLane.y - 4)
        // Meaningless on a phone, where the buttons are the input — and with the
        // controls floating it would land inside the forward button.
        .setVisible(layout.mode === 'landscape' && !layout.controlsOverlay)
    })

    this.createPaddleButton('forward', 'FORWARD', 'SPACE  /  F')
    this.createPaddleButton('backward', 'BACKWARDS', 'B  /  ↓')
    this.createPauseOverlay()
  }

  private createPauseOverlay(): void {
    const { type } = this.layout
    const scrim = this.add
      .rectangle(0, 0, 10, 10, COLORS.ink, 0.9)
      .setOrigin(0)
      .setDepth(50)
      .setInteractive()
    const panel = this.add
      .rectangle(0, 0, 10, 10, COLORS.inkSoft, 1)
      .setOrigin(0)
      .setDepth(51)
      .setStrokeStyle(2, 0x31545a, 1)
    const eyebrow = this.add
      .text(0, 0, 'RUN ON HOLD', headingStyle(type.label, TEXT_COLORS.muted))
      .setOrigin(0.5)
      .setDepth(52)
      .setLetterSpacing(2)
    const title = this.add
      .text(0, 0, 'PAUSED', headingStyle(type.hero, TEXT_COLORS.cream))
      .setOrigin(0.5)
      .setDepth(52)
    const copy = this.add
      .text(
        0,
        0,
        'The river waits. Resume on your count.',
        bodyStyle(type.body, TEXT_COLORS.muted),
      )
      .setOrigin(0.5)
      .setDepth(52)
    const resumeButton = this.add
      .rectangle(0, 0, 10, 10, COLORS.yellow, 1)
      .setOrigin(0)
      .setDepth(52)
      .setInteractive({ useHandCursor: true })
    const resumeLabel = this.add
      .text(0, 0, 'RESUME RUN', headingStyle(type.heading, TEXT_COLORS.ink))
      .setOrigin(0.5)
      .setDepth(53)
      .setInteractive({ useHandCursor: true })
    const menuButton = this.add
      .rectangle(0, 0, 10, 10, COLORS.inkSoft, 1)
      .setOrigin(0)
      .setDepth(52)
      .setStrokeStyle(2, COLORS.waterLight, 1)
      .setInteractive({ useHandCursor: true })
    const menuLabel = this.add
      .text(0, 0, 'CHANGE SETUP', headingStyle(type.heading, TEXT_COLORS.waterLight))
      .setOrigin(0.5)
      .setDepth(53)
      .setInteractive({ useHandCursor: true })

    this.pauseObjects = [
      scrim,
      panel,
      eyebrow,
      title,
      copy,
      resumeButton,
      resumeLabel,
      menuButton,
      menuLabel,
    ]
    for (const object of this.pauseObjects) object.setVisible(false)

    this.onLayout((layout) => {
      const modal = layout.modalPanel
      const primary = layout.modalPrimaryButton
      const secondary = layout.modalSecondaryButton
      const cx = modal.x + modal.width / 2
      scrim.setPosition(0, 0).setSize(layout.width, layout.height)
      panel.setPosition(modal.x, modal.y).setSize(modal.width, modal.height)
      eyebrow
        .setPosition(cx, modal.y + modal.height * 0.16)
        .setFontSize(layout.type.label)
      title
        .setPosition(cx, modal.y + modal.height * 0.3)
        .setFontSize(layout.type.hero)
      copy
        .setPosition(cx, modal.y + modal.height * 0.45)
        .setFontSize(layout.type.body)
      resumeButton
        .setPosition(primary.x, primary.y)
        .setSize(primary.width, primary.height)
      resumeLabel
        .setPosition(primary.x + primary.width / 2, primary.y + primary.height / 2)
        .setFontSize(layout.type.heading)
      menuButton
        .setPosition(secondary.x, secondary.y)
        .setSize(secondary.width, secondary.height)
      menuLabel
        .setPosition(secondary.x + secondary.width / 2, secondary.y + secondary.height / 2)
        .setFontSize(layout.type.heading)
    })

    const resume = (): void => this.resumeRun()
    resumeButton.on('pointerdown', resume)
    resumeLabel.on('pointerdown', resume)
    const menu = (): void => this.returnToMenu()
    menuButton.on('pointerdown', menu)
    menuLabel.on('pointerdown', menu)
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

    let restingAlpha = 1

    this.onLayout((layout) => {
      const rect = direction === 'forward' ? layout.controls.forward : layout.controls.backward
      const overlay = layout.controlsOverlay
      restingAlpha = overlay ? 0.82 : 1
      button.setPosition(rect.x, rect.y).setSize(rect.width, rect.height).setAlpha(restingAlpha)
      button.setInteractive({ useHandCursor: true })
      // Floating over the river the buttons are narrow thumb zones, so the
      // caption centres instead of sitting against the left edge.
      title
        .setFontSize(overlay ? Math.round(layout.type.body) : layout.type.heading)
        .setOrigin(overlay ? 0.5 : 0, 0.5)
        .setPosition(
          overlay ? rect.x + rect.width / 2 : rect.x + rect.width * 0.07,
          rect.y + rect.height / 2,
        )
      keys
        .setFontSize(Math.round(layout.type.label * 0.9))
        .setOrigin(1, 0.5)
        .setPosition(rect.x + rect.width - rect.width * 0.07, rect.y + rect.height / 2)
        .setVisible(layout.mode === 'landscape' && !overlay)
    })

    button.on('pointerdown', () => this.onPaddle(direction))
    button.on('pointerover', () => button.setAlpha(restingAlpha * 0.84))
    button.on('pointerout', () => button.setAlpha(restingAlpha))
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

    this.drawObstacles(graphics, elapsed)

    // A widening wake anchors all of that motion to the player's raft.
    const raftX = this.raft.x
    const wakeOffset = flowDistance % 27
    for (let i = 0; i < 5; i += 1) {
      const y = this.raft.y + this.raftDisplayHeight * 0.43 + i * 24 + wakeOffset
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

  private drawObstacles(graphics: Phaser.GameObjects.Graphics, elapsed: number): void {
    const { river, raft } = this.layout
    const upstreamDistance = river.height * 0.62
    const obstacleSize = Math.min(river.width, river.height) * 0.045

    for (const event of this.survival.getVisibleEvents(elapsed)) {
      const lead = event.collisionAt - elapsed
      const y = raft.y - this.raftDisplayHeight * 0.46 - (lead / 2_800) * upstreamDistance
      if (y < river.y || y > river.y + river.height) continue

      const obstacleLane = obstacleLaneTarget(event.cueIndex)
      const x = raft.x + obstacleLane * raftLaneTravel(river.width)
      const alpha = Phaser.Math.Clamp(1 + lead / 2_800, 0.28, 1)
      const size = obstacleSize * (0.86 + (event.cueIndex % 3) * 0.12)

      if (event.obstacle === 'rock') {
        graphics.fillStyle(COLORS.rock, alpha)
        graphics.fillCircle(x, y, size)
        graphics.fillTriangle(
          x - size * 0.72,
          y + size * 0.24,
          x - size * 0.2,
          y - size * 0.82,
          x + size * 0.76,
          y + size * 0.4,
        )
        graphics.fillStyle(COLORS.rockLight, alpha * 0.72)
        graphics.fillCircle(x - size * 0.2, y - size * 0.22, size * 0.22)
      } else if (event.obstacle === 'strainer') {
        graphics.lineStyle(size * 0.25, COLORS.wood, alpha)
        graphics.lineBetween(x - size, y - size * 0.55, x + size, y + size * 0.55)
        graphics.lineBetween(x - size * 0.2, y, x + size * 0.48, y - size * 0.72)
        graphics.lineBetween(x + size * 0.2, y + size * 0.1, x + size * 0.9, y - size * 0.35)
      } else if (event.obstacle === 'current') {
        graphics.lineStyle(size * 0.18, COLORS.waterLight, alpha)
        graphics.strokeCircle(x, y, size)
        graphics.strokeCircle(x, y, size * 0.55)
        graphics.fillStyle(COLORS.waterLight, alpha)
        graphics.fillTriangle(
          x + size * 0.2,
          y - size * 0.7,
          x + size * 0.86,
          y - size * 0.4,
          x + size * 0.42,
          y,
        )
      } else {
        graphics.lineStyle(size * 0.2, COLORS.cream, alpha)
        for (const offset of [-0.65, 0, 0.65]) {
          const waveY = y + offset * size
          graphics.beginPath()
          graphics.moveTo(x - size, waveY + size * 0.28)
          graphics.lineTo(x - size * 0.4, waveY - size * 0.2)
          graphics.lineTo(x + size * 0.15, waveY + size * 0.28)
          graphics.lineTo(x + size, waveY - size * 0.2)
          graphics.strokePath()
        }
      }
    }
  }

  private drawRhythmLane(elapsed: number): void {
    const graphics = this.rhythmGraphics
    const { rhythmLane: lane, targetX } = this.layout
    graphics.clear()
    graphics.setDepth(15)
    // Floating over the water, the panel has to stay see-through enough that
    // the river still reads underneath it.
    graphics.fillStyle(COLORS.ink, this.layout.controlsOverlay ? 0.74 : 0.91)
    graphics.fillRoundedRect(lane.x, lane.y, lane.width, lane.height, 14)
    graphics.lineStyle(2, 0x31545a, 1)
    graphics.strokeRoundedRect(lane.x, lane.y, lane.width, lane.height, 14)

    const midY = lane.y + lane.height / 2
    const inset = lane.height * 0.11
    const gateWidth = Math.max(48, lane.height * 0.58)
    const gateHeight = lane.height - inset * 2
    const pulse = elapsed < 0 ? 0 : (Math.sin(elapsed * 0.012) + 1) / 2
    graphics.lineStyle(2, 0x688e87, 0.55)
    graphics.lineBetween(lane.x + inset, midY, lane.x + lane.width - inset, midY)
    for (let index = 1; index < 8; index += 1) {
      const x = lane.x + (lane.width * index) / 8
      graphics.lineStyle(2, 0x688e87, 0.36)
      graphics.lineBetween(x, midY - 5, x, midY + 5)
    }
    graphics.fillStyle(COLORS.yellow, 0.1 + pulse * 0.06)
    graphics.fillRoundedRect(
      targetX - gateWidth / 2,
      lane.y + inset,
      gateWidth,
      gateHeight,
      10,
    )
    graphics.lineStyle(4, COLORS.yellow, 0.92)
    graphics.strokeRoundedRect(
      targetX - gateWidth / 2,
      lane.y + inset,
      gateWidth,
      gateHeight,
      10,
    )
    graphics.lineStyle(2, COLORS.yellow, 0.2 + pulse * 0.22)
    graphics.strokeCircle(targetX, midY, gateWidth * (0.68 + pulse * 0.18))
    graphics.fillStyle(COLORS.yellow, 1)
    graphics.fillTriangle(
      targetX - 7,
      lane.y + inset + 2,
      targetX + 7,
      lane.y + inset + 2,
      targetX,
      lane.y + inset + 11,
    )

    if (elapsed < 0) return

    // Markers travel so that a target LOOK_AHEAD_MS away sits at the lane's far
    // edge, which keeps the read the same however wide the screen is.
    const speed = (lane.x + lane.width - targetX) / LOOK_AHEAD_MS
    const radius = Math.max(8, Math.min(14, lane.height * 0.16))

    for (const target of this.rhythm.getVisible(elapsed, LOOK_AHEAD_MS)) {
      const x = targetX + (target.targetTime - elapsed) * speed
      if (x < lane.x + radius || x > lane.x + lane.width - radius) continue
      const markerColor = target.direction === 'forward'
        ? hexToNumber(this.level.accent)
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
      if (target.strokeIndex > 0) {
        graphics.fillStyle(COLORS.cream, 0.9)
        graphics.fillCircle(x, midY - radius * 0.68, 2.5)
      }
    }
  }

  private drawRaceRail(): void {
    const graphics = this.raceGraphics
    const { rail, railAxis, type } = this.layout
    graphics.clear()
    if (!this.layout.railVisible) {
      for (const label of this.raceLabels.values()) label.setVisible(false)
      this.raceOverflowText.setVisible(false)
      return
    }
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

    for (const label of this.raceLabels.values()) label.setVisible(false)
    const visibleRacers = selectRailRacers(this.racers, MAX_VISIBLE_RAIL_RACERS)
    const hiddenCount = this.racers.length - visibleRacers.length
    this.raceOverflowText
      .setText(hiddenCount > 0 ? `+${hiddenCount} RACERS` : '')
      .setVisible(hiddenCount > 0)
    const sorted = rankRacers(visibleRacers)
    const placed = sorted.map((racer) => {
      const along = axisFrom + (axisTo - axisFrom) * racer.progress
      return {
        racer,
        radius: racer.isLocal ? 11 : 8,
        size: Math.round(type.label * (racer.isLocal ? 0.95 : 0.85)),
        dot: along,
        label: along,
      }
    })

    // Every racer starts at progress 0, so without this every name lands on the
    // same pixel and the rail reads as one smudge for the first few seconds.
    // Dots stay truthful; only the labels are nudged apart — and only as far as
    // the rail goes, or the last name in a four-boat race is drawn off it.
    // Sorted by progress descending, so the nudge runs one way down the axis:
    // downward in y when vertical, leftward in x when horizontal.
    const spread = spreadRailLabels(
      placed.map((entry) => entry.label),
      {
        minGap: type.label * (vertical ? 1.15 : 3.2),
        // The track's own ends: the same inset that keeps the end caps clear.
        min: Math.min(axisFrom, axisTo),
        max: Math.max(axisFrom, axisTo),
        ascending: vertical,
      },
    )
    for (const [index, entry] of placed.entries()) {
      entry.label = spread[index]
    }

    for (const { racer, radius, size, dot, label: labelAlong } of placed) {
      const x = vertical ? cross : dot
      const y = vertical ? dot : cross

      graphics.fillStyle(racer.color, racer.eliminated ? 0.42 : 1)
      graphics.fillCircle(x, y, radius)
      graphics.lineStyle(
        racer.isLocal ? 3 : 2,
        COLORS.cream,
        racer.eliminated ? 0.32 : (racer.isLocal ? 1 : 0.55),
      )
      graphics.strokeCircle(x, y, radius)

      const name = `racer-${racer.id}`
      const color = `#${racer.color.toString(16).padStart(6, '0')}`
      const labelText = racer.eliminated ? `${racer.name}  OUT` : racer.name
      const labelX = vertical ? cross + radius + 6 : labelAlong
      const labelY = vertical ? labelAlong : cross - radius - size * 1.1
      const existing = this.raceLabels.get(name)
      if (existing) {
        existing
          .setVisible(true)
          .setText(labelText)
          .setColor(color)
          .setFontSize(size)
          .setAlpha(racer.eliminated ? 0.5 : 1)
          .setOrigin(vertical ? 0 : 0.5, vertical ? 0.5 : 0)
          .setPosition(labelX, labelY)
      } else {
        const labelObject = this.add
          .text(labelX, labelY, labelText, headingStyle(size, color))
          .setName(name)
          .setDepth(13)
          .setAlpha(racer.eliminated ? 0.5 : 1)
          .setOrigin(vertical ? 0 : 0.5, vertical ? 0.5 : 0)
        this.raceLabels.set(name, labelObject)
      }
    }
  }

  private updateCue(elapsed: number): void {
    const event = this.survival.getCurrentCall(elapsed, CALL_LEAD_MS)

    if (!event && elapsed <= 0) return

    const { state } = this.survival.getSnapshot(elapsed)
    const cue = event?.cue
    const banner = callBanner(
      state,
      event && cue
        ? { direction: cue.direction, strokes: cue.strokes, obstacle: event.obstacle }
        : undefined,
    )
    const { hero } = this.layout.type
    // The banner supplies the words; the colours and sizes stay here, where the
    // theme and the selected level's accent live.
    const emphasis: Record<BannerTone, { color: string; size: number }> = {
      waiting: { color: TEXT_COLORS.cream, size: Math.round(hero * 0.6) },
      forward: { color: this.level.accent, size: hero },
      backward: { color: TEXT_COLORS.waterLight, size: Math.round(hero * 0.86) },
    }
    const { color, size } = emphasis[banner.tone]

    this.callText.setText(banner.headline).setColor(color).setFontSize(size)
    this.callSubtext.setText(banner.subtext)

    if (!event || !cue) return

    if (event.cueIndex !== this.lastCueIndex) {
      this.lastCueIndex = event.cueIndex
      this.tweens.add({ targets: this.callText, scale: { from: 1.14, to: 1 }, duration: 180 })
      this.speakCall(cue.direction, cue.strokes)
    }
  }

  private updateRaft(elapsed: number): void {
    const { raft, river } = this.layout
    const survival = this.survival.getSnapshot(elapsed)
    const bob = Math.sin(elapsed * 0.004 * survival.intensity) * 3

    this.raft.setPosition(
      raft.x + this.raftLaneMotion.position * raftLaneTravel(river.width),
      raft.y + bob + this.raftStrokeMotion.offsetY,
    )
    this.raft.setRotation(this.raftLaneMotion.lean)

    const overboard = survival.state !== 'aboard'
    this.swimmer
      .setVisible(overboard)
      .setPosition(
        this.raft.x + river.width * 0.11 + Math.sin(elapsed * 0.005) * river.width * 0.018,
        this.raft.y + river.height * 0.06 + Math.cos(elapsed * 0.006) * river.height * 0.012,
      )
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

    this.timeText.setText(formatRunClock(raceClockMs(this.mode, elapsed)))
    const accuracy = this.rhythm.getAccuracy()
    this.statsText.setText(
      this.layout.mode === 'landscape' && this.layout.width >= 760
        ? `ACCURACY ${accuracy}%   SCORE ${this.totalPoints.toLocaleString()}`
        : `${accuracy}%  /  ${this.totalPoints.toLocaleString()}`,
    )

    const survival = this.survival.getSnapshot(elapsed)
    if (survival.state === 'aboard') {
      this.survivalText
        .setText(
          `RAFT HP ${survival.stability}/3  •  FLOW ${survival.intensity.toFixed(1)}×` +
          (this.streak > 1 ? `  •  STREAK ×${this.streak}` : ''),
        )
        .setColor(TEXT_COLORS.cream)
    } else if (survival.state === 'overboard') {
      this.survivalText
        .setText(`OVERBOARD  /  ${survival.recovery}/2 TO RAFT`)
        .setColor(TEXT_COLORS.warning)
    } else {
      this.survivalText.setText('SWEPT AWAY').setColor(TEXT_COLORS.danger)
    }
  }

  private onForwardPaddle(): void {
    this.onPaddle('forward')
  }

  private onBackwardPaddle(): void {
    this.onPaddle('backward')
  }

  private onPaddle(direction: PaddleDirection): void {
    if (this.completed || this.time.now < this.startAt) return

    this.animateRaftStroke()
    const judgment = this.rhythm.judge(this.time.now - this.startAt, direction)
    this.applyJudgment(judgment)
  }

  private animateRaftStroke(): void {
    this.tweens.killTweensOf(this.raftStrokeMotion)
    this.raftStrokeMotion.offsetY = 0
    this.tweens.add({
      targets: this.raftStrokeMotion,
      offsetY: -6,
      duration: 110,
      yoyo: true,
      ease: 'Quad.out',
    })
  }

  private applyJudgment(judgment: StrokeJudgment): void {
    this.totalPoints += judgment.points
    this.streak = judgment.target && judgment.points > 0 ? this.streak + 1 : 0
    this.survival.recordJudgment(judgment)
    this.race.recordStroke(judgment)
    this.showFeedback(judgment.rating === 'wrong' ? 'WRONG WAY' : judgment.rating.toUpperCase(), judgment.rating)

    const dodgeCueIndex = raftDodgeCueIndex(judgment, this.lastRaftCueIndex)
    if (dodgeCueIndex !== undefined) this.moveRaftToLane(dodgeCueIndex)

  }

  private moveRaftToLane(cueIndex: number): void {
    this.lastRaftCueIndex = cueIndex
    const targetLane = raftLaneTarget(cueIndex)
    const turnDirection = Math.sign(targetLane - this.raftLaneMotion.position) || targetLane
    const crossingDuration = raftLaneCrossingDuration(
      this.raftLaneMotion.position,
      targetLane,
    )

    this.tweens.killTweensOf(this.raftLaneMotion)
    this.raftLaneMotion.lean = 0
    this.tweens.add({
      targets: this.raftLaneMotion,
      position: targetLane,
      duration: crossingDuration,
      ease: 'Sine.inOut',
    })
    this.tweens.add({
      targets: this.raftLaneMotion,
      lean: turnDirection * 0.045,
      duration: 180,
      hold: 120,
      yoyo: true,
      ease: 'Sine.inOut',
    })
  }

  private handleSurvivalTransition(transition: SurvivalTransition): void {
    const obstacle = obstacleLabel(transition.event.obstacle)

    if (transition.type === 'impact') {
      const { stability } = this.survival.getSnapshot(0)
      this.showFeedback(`${obstacle} HIT  •  HP ${stability}/3`, 'wrong')
      this.flashRaftDamage()
      this.cameras.main.shake(180, 0.006)
    } else if (transition.type === 'ejected') {
      this.showFeedback('RAFT HP 0/3  •  OVERBOARD', 'wrong')
      this.flashRaftDamage()
      this.cameras.main.shake(320, 0.012)
    } else if (transition.type === 'recovery-progress') {
      this.showFeedback('CLOSING ON THE RAFT', 'good')
    } else if (transition.type === 'drifted') {
      this.showFeedback('RAFT PULLING AWAY', 'late')
    } else if (transition.type === 'recovered') {
      this.showFeedback('BACK ABOARD', 'perfect')
    }
  }

  private flashRaftDamage(): void {
    this.tweens.killTweensOf(this.raft)
    this.raft.setAlpha(1)
    this.tweens.add({
      targets: this.raft,
      alpha: 0.42,
      duration: 70,
      yoyo: true,
      repeat: 2,
    })
  }

  private showFeedback(label: string, rating: StrokeRating): void {
    const { feedback } = this.layout
    this.feedbackText.setText(label).setColor(RATING_COLOR[rating]).setAlpha(1).setScale(1.12)
    this.feedbackPlate
      .setVisible(true)
      .setAlpha(0.86)
      .setStrokeStyle(2, hexToNumber(RATING_COLOR[rating]), 0.72)
    this.tweens.killTweensOf(this.feedbackText)
    this.tweens.killTweensOf(this.feedbackPlate)
    this.tweens.add({
      targets: this.feedbackText,
      alpha: 0,
      scale: 1,
      y: { from: feedback.y, to: feedback.y - 20 },
      duration: 520,
    })
    this.tweens.add({
      targets: this.feedbackPlate,
      alpha: 0,
      y: { from: feedback.y, to: feedback.y - 20 },
      duration: 520,
      onComplete: () => this.feedbackPlate.setVisible(false),
    })
  }

  private speakCall(direction: PaddleDirection, strokes: number): void {
    if (strokes < 1 || strokes > 4) return
    const key = guideAudioKey(this.guideVoiceId, direction, strokes as GuideCallNumber)
    // The clip is preloaded, but a miss must stay silent rather than throw mid-run.
    if (!this.cache.audio.exists(key)) return

    this.activeGuideCall?.stop()
    this.activeGuideCall?.destroy()
    const guideCall = this.sound.add(key, {
      volume: 1,
    })
    this.activeGuideCall = guideCall
    guideCall.once(Phaser.Sound.Events.COMPLETE, () => {
      guideCall.destroy()
      if (this.activeGuideCall === guideCall) this.activeGuideCall = undefined
    })
    guideCall.play()
  }

  private finishRace(elapsed: number, timeExpired = false): void {
    this.completed = true
    this.activeGuideCall?.stop()
    const sorted = rankRacers(this.racers)
    const outcome = timeExpired
      ? timeLimitOutcome(this.racers, elapsed, this.level.name)
      : runOutcome(
        this.mode,
        placeOfLocal(sorted),
        elapsed,
        this.level.name,
      )
    const headingLabel = outcome.heading
    const blurbLabel = outcome.blurb

    const scrim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.9).setOrigin(0).setDepth(50)
    const panel = this.add
      .rectangle(0, 0, 10, 10, COLORS.inkSoft, 1)
      .setOrigin(0)
      .setDepth(50)
      .setStrokeStyle(2, 0x31545a, 1)
    const eyebrow = this.add
      .text(
        0,
        0,
        timeExpired ? 'TIME EXPIRED' : 'RUN COMPLETE',
        headingStyle(this.layout.type.label, TEXT_COLORS.muted),
      )
      .setOrigin(0.5)
      .setDepth(51)
      .setLetterSpacing(2)
    const heading = this.add
      .text(0, 0, headingLabel, headingStyle(this.layout.type.hero, TEXT_COLORS.warning))
      .setOrigin(0.5)
      .setDepth(51)
    const summary = this.add
      .text(
        0,
        0,
        `${formatRunClock(elapsed)}   •   ${this.rhythm.getAccuracy()}% ACCURACY   •   ${this.totalPoints.toLocaleString()} PTS`,
        headingStyle(this.layout.type.heading, TEXT_COLORS.cream),
      )
      .setOrigin(0.5)
      .setDepth(51)
      .setLetterSpacing(1.4)
    const blurb = this.add
      .text(0, 0, blurbLabel, bodyStyle(this.layout.type.body, TEXT_COLORS.muted))
      .setOrigin(0.5)
      .setDepth(51)
      .setWordWrapWidth(this.layout.width * 0.8)
      .setAlign('center')
    const retryButton = this.add
      .rectangle(0, 0, 10, 10, COLORS.yellow, 1)
      .setOrigin(0)
      .setDepth(51)
      .setInteractive({ useHandCursor: true })
    const retryLabel = this.add
      .text(
        0,
        0,
        this.mode === 'multiplayer' ? 'BACK TO SETUP' : 'RETRY RUN',
        headingStyle(this.layout.type.heading, TEXT_COLORS.ink),
      )
      .setOrigin(0.5)
      .setDepth(52)
      .setInteractive({ useHandCursor: true })
    const setupButton = this.add
      .rectangle(0, 0, 10, 10, COLORS.inkSoft, 1)
      .setOrigin(0)
      .setDepth(51)
      .setStrokeStyle(2, COLORS.waterLight, 1)
      .setInteractive({ useHandCursor: true })
    const setupLabel = this.add
      .text(0, 0, 'CHANGE SETUP', headingStyle(this.layout.type.heading, TEXT_COLORS.waterLight))
      .setOrigin(0.5)
      .setDepth(52)
      .setInteractive({ useHandCursor: true })

    this.onLayout((layout) => {
      const modal = layout.modalPanel
      const primary = layout.modalPrimaryButton
      const secondary = layout.modalSecondaryButton
      const cx = modal.x + modal.width / 2
      scrim.setPosition(0, 0).setSize(layout.width, layout.height)
      panel.setPosition(modal.x, modal.y).setSize(modal.width, modal.height)
      eyebrow
        .setFontSize(layout.type.label)
        .setPosition(cx, modal.y + modal.height * 0.11)
      heading
        .setFontSize(layout.type.hero)
        .setPosition(cx, modal.y + modal.height * 0.24)
      summary
        .setFontSize(layout.type.heading)
        .setPosition(cx, modal.y + modal.height * 0.39)
      blurb
        .setFontSize(layout.type.body)
        .setWordWrapWidth(modal.width * 0.78)
        .setPosition(cx, modal.y + modal.height * 0.51)
      retryButton
        .setPosition(primary.x, primary.y)
        .setSize(primary.width, primary.height)
      retryLabel
        .setFontSize(layout.type.heading)
        .setPosition(primary.x + primary.width / 2, primary.y + primary.height / 2)
      setupButton
        .setPosition(secondary.x, secondary.y)
        .setSize(secondary.width, secondary.height)
      setupLabel
        .setFontSize(layout.type.heading)
        .setPosition(secondary.x + secondary.width / 2, secondary.y + secondary.height / 2)
    })

    const retry = (): void => {
      if (this.mode === 'multiplayer') {
        this.returnToMenu()
        return
      }
      this.scene.restart({ levelId: this.level.id, mode: this.mode })
    }
    retryButton.on('pointerdown', retry)
    retryLabel.on('pointerdown', retry)
    retryButton.on('pointerover', () => retryButton.setFillStyle(0xffd979, 1))
    retryButton.on('pointerout', () => retryButton.setFillStyle(COLORS.yellow, 1))
    const setup = (): void => this.returnToMenu()
    setupButton.on('pointerdown', setup)
    setupLabel.on('pointerdown', setup)
  }

  private togglePause(): void {
    if (this.completed) return
    if (this.paused) {
      this.resumeRun()
      return
    }

    this.paused = true
    this.pausedAt = this.time.now
    this.activeGuideCall?.pause()
    for (const object of this.pauseObjects) object.setVisible(true)
  }

  private resumeRun(): void {
    if (!this.paused) return
    this.startAt += this.time.now - this.pausedAt
    this.paused = false
    this.pausedAt = 0
    this.activeGuideCall?.resume()
    for (const object of this.pauseObjects) object.setVisible(false)
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
    this.input.keyboard?.off('keydown-ESC', this.togglePause, this)
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.layoutAppliers = []
    this.raceLabels.clear()
    this.race.destroy()
    this.activeGuideCall?.stop()
    this.activeGuideCall?.destroy()
    this.activeGuideCall = undefined
  }
}
