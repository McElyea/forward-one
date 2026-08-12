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

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

export class RiverScene extends Phaser.Scene {
  private level!: LevelConfig
  private mode: RaceMode = 'solo'
  private rhythm!: RhythmEngine
  private race!: RaceAdapter
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
  }

  create(): void {
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
    raftBody.fillStyle(0xf05a3d, 1)
    raftBody.fillRoundedRect(-46, -24, 92, 48, 21)
    raftBody.lineStyle(5, 0xffa56e, 1)
    raftBody.strokeRoundedRect(-42, -20, 84, 40, 18)
    raftBody.fillStyle(0x17343a, 1)
    raftBody.fillEllipse(0, 0, 59, 24)

    const crew = this.add.graphics()
    crew.fillStyle(0xffc857, 1)
    crew.fillCircle(-19, -5, 6)
    crew.fillCircle(19, -5, 6)
    crew.fillStyle(0xf5f1df, 1)
    crew.fillCircle(-19, 9, 5)
    crew.fillCircle(19, 9, 5)

    this.raft = this.add.container(520, 390, [raftBody, crew])
    this.raft.setDepth(5)
  }

  private createHud(): void {
    const topBar = this.add.rectangle(0, 0, 1280, 76, COLORS.ink, 0.94).setOrigin(0).setDepth(10)
    topBar.setStrokeStyle(0)
    this.add.text(28, 17, 'FORWARD / ONE', headingStyle(23)).setDepth(11).setLetterSpacing(1)
    this.add.text(230, 20, `CLASS ${this.level.rapidClass}`, headingStyle(20, this.level.accent)).setDepth(11)
    this.add.text(332, 22, this.mode === 'solo' ? 'SOLO RUN' : 'RACE PREVIEW', headingStyle(16, '#9bb9b4')).setDepth(11)
    this.timeText = this.add.text(1002, 18, '00:00', headingStyle(25)).setDepth(11)
    this.statsText = this.add.text(1092, 23, '100%  /  0', bodyStyle(13, '#9bb9b4')).setDepth(11)

    this.callText = this.add.text(520, 115, 'GET READY', headingStyle(56, '#ffc857'))
      .setOrigin(0.5)
      .setDepth(9)
      .setShadow(0, 4, '#071f26', 7, true, true)
    this.callSubtext = this.add.text(520, 158, 'Listen for the guide', headingStyle(16, '#d7e8e1'))
      .setOrigin(0.5)
      .setDepth(9)
      .setLetterSpacing(1.3)
    this.feedbackText = this.add.text(370, 520, '', headingStyle(23))
      .setOrigin(0.5)
      .setDepth(20)

    this.add.text(1072, 96, 'RACE LINE', headingStyle(15, '#9bb9b4')).setDepth(12).setLetterSpacing(1.5)
    this.add.text(1067, 652, 'START', headingStyle(11, '#688e87')).setDepth(12)
    this.add.text(1062, 128, 'FINISH', headingStyle(11, '#688e87')).setDepth(12)
    this.add.text(30, 667, 'ESC  MENU', headingStyle(13, '#9bb9b4')).setDepth(20).setLetterSpacing(1)
    this.createPaddleButton(185, 650, 330, 'FORWARD', 'SPACE  /  F', 'forward')
    this.createPaddleButton(530, 650, 345, 'BACKWARDS', 'B  /  ↓', 'backward')
  }

  private createPaddleButton(
    x: number,
    y: number,
    width: number,
    label: string,
    keyLabel: string,
    direction: PaddleDirection,
  ): void {
    const color = direction === 'forward' ? COLORS.yellow : COLORS.waterLight
    const button = this.add.rectangle(x, y, width, 54, color, 1).setOrigin(0).setDepth(21)
    button.setInteractive({ useHandCursor: true })
    this.add.text(x + 18, y + 13, label, headingStyle(20, '#071f26')).setDepth(22)
    this.add.text(x + width - 18, y + 17, keyLabel, headingStyle(13, '#16424a'))
      .setOrigin(1, 0)
      .setDepth(22)
    button.on('pointerdown', () => this.onPaddle(direction))
    button.on('pointerover', () => button.setAlpha(0.84))
    button.on('pointerout', () => button.setAlpha(1))
  }

  private drawRiver(elapsed: number): void {
    const graphics = this.riverGraphics
    const riverTop = 76
    const riverBottom = 720
    const riverHeight = riverBottom - riverTop
    const currentSpeed = 0.17 + this.level.rapidClass * 0.025
    const flowDistance = elapsed * currentSpeed
    const wrapFlowY = (offset: number, speedMultiplier = 1): number => {
      const distance = (offset + flowDistance * speedMultiplier) % riverHeight
      return riverTop + (distance < 0 ? distance + riverHeight : distance)
    }

    graphics.clear()
    graphics.fillStyle(COLORS.bank, 1)
    graphics.fillRect(0, 76, 1040, 644)

    graphics.fillStyle(COLORS.bankLight, 1)
    graphics.beginPath()
    graphics.moveTo(0, 76)
    graphics.lineTo(165, 76)
    graphics.lineTo(205, 175)
    graphics.lineTo(145, 305)
    graphics.lineTo(185, 450)
    graphics.lineTo(218, 535)
    graphics.lineTo(150, 635)
    graphics.lineTo(180, 720)
    graphics.lineTo(0, 720)
    graphics.closePath()
    graphics.fillPath()

    graphics.beginPath()
    graphics.moveTo(875, 76)
    graphics.lineTo(1040, 76)
    graphics.lineTo(1040, 720)
    graphics.lineTo(870, 720)
    graphics.lineTo(825, 615)
    graphics.lineTo(905, 500)
    graphics.lineTo(850, 370)
    graphics.lineTo(805, 270)
    graphics.lineTo(900, 165)
    graphics.lineTo(875, 76)
    graphics.closePath()
    graphics.fillPath()

    graphics.fillStyle(COLORS.water, 1)
    graphics.beginPath()
    graphics.moveTo(165, 76)
    graphics.lineTo(875, 76)
    graphics.lineTo(900, 165)
    graphics.lineTo(805, 270)
    graphics.lineTo(850, 370)
    graphics.lineTo(905, 500)
    graphics.lineTo(825, 615)
    graphics.lineTo(870, 720)
    graphics.lineTo(180, 720)
    graphics.lineTo(150, 635)
    graphics.lineTo(218, 535)
    graphics.lineTo(185, 450)
    graphics.lineTo(145, 305)
    graphics.lineTo(205, 175)
    graphics.lineTo(165, 76)
    graphics.closePath()
    graphics.fillPath()

    // Long current streaks provide the strongest sense that the camera is
    // following the raft while the river surface travels underneath it.
    for (let i = 0; i < 18; i += 1) {
      const y = wrapFlowY((i * 149) % riverHeight, 0.82 + (i % 4) * 0.08)
      const length = 48 + (i % 5) * 15
      const laneX = 250 + ((i * 163) % 540)
      const bend = Math.sin(elapsed * 0.0011 + i * 1.7) * 29
      const x = laneX + bend
      const tailY = Math.max(riverTop + 3, y - length)
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
        graphics.fillEllipse(x + 5, y, 17, 4)
      }
    }

    // Small wave crests move a little faster than the deeper current bands.
    for (let i = 0; i < 10; i += 1) {
      const y = wrapFlowY(42 + i * 83, 1.14)
      const x = 315 + ((i * 127) % 400) + Math.sin(elapsed * 0.0015 + i) * 38
      const width = 34 + (i % 4) * 11

      graphics.lineStyle(3, COLORS.cream, 0.55)
      graphics.beginPath()
      graphics.moveTo(x - width / 2, y - 5)
      graphics.lineTo(x, y)
      graphics.lineTo(x + width / 2, y - 5)
      graphics.strokePath()
    }

    // Fast flecks make the closest layer of water visibly rush past the boat.
    graphics.fillStyle(0xe9f7ef, 0.8)
    const rapidStrength = this.level.rapidClass - 1
    for (let i = 0; i < 12 + rapidStrength * 2; i += 1) {
      const y = wrapFlowY((i * 97) % riverHeight, 1.32 + (i % 3) * 0.07)
      const x = 270 + ((i * 157) % 500) + Math.sin(elapsed * 0.001 + i) * 24
      graphics.fillEllipse(x, y, 18 + (i % 4) * 9, 3 + (i % 2) * 2)
    }

    // A widening wake anchors all of that motion to the player's raft.
    const raftX = 520 + Math.sin(elapsed * 0.0013) * 76
    const wakeOffset = flowDistance % 27
    for (let i = 0; i < 5; i += 1) {
      const y = 424 + i * 24 + wakeOffset
      if (y > 544) continue
      const spread = 30 + i * 8
      graphics.lineStyle(3, COLORS.cream, 0.42 - i * 0.045)
      graphics.lineBetween(raftX - 24, y - 10, raftX - spread, y)
      graphics.lineBetween(raftX + 24, y - 10, raftX + spread, y)
    }

    // Minimal bank markers scroll more slowly, creating inexpensive parallax.
    for (let i = 0; i < 8; i += 1) {
      const y = wrapFlowY(30 + i * 91, 0.54)
      const radius = 7 + (i % 3) * 3
      graphics.fillStyle(i % 2 === 0 ? 0x244b3d : 0x5f8066, 0.9)
      graphics.fillCircle(72 + (i % 3) * 27, y, radius)
      graphics.fillCircle(944 + (i % 3) * 24, y + 18, radius + 1)
    }
  }

  private drawRhythmLane(elapsed: number): void {
    const graphics = this.rhythmGraphics
    graphics.clear()
    graphics.setDepth(15)
    graphics.fillStyle(COLORS.ink, 0.91)
    graphics.fillRoundedRect(185, 548, 690, 92, 14)
    graphics.lineStyle(2, 0x31545a, 1)
    graphics.strokeRoundedRect(185, 548, 690, 92, 14)

    const targetX = 370
    graphics.lineStyle(4, COLORS.yellow, 1)
    graphics.lineBetween(targetX, 558, targetX, 628)
    graphics.fillStyle(COLORS.yellow, 1)
    graphics.fillTriangle(targetX - 8, 558, targetX + 8, 558, targetX, 570)

    if (elapsed < 0) return

    for (const target of this.rhythm.getVisible(elapsed)) {
      const x = targetX + (target.targetTime - elapsed) * 0.29
      if (x < 195 || x > 862) continue
      const markerColor = target.direction === 'forward'
        ? (target.strokeIndex === 0 ? hexToNumber(this.level.accent) : COLORS.cream)
        : COLORS.waterLight
      graphics.fillStyle(markerColor, 1)
      graphics.fillCircle(x, 594, 14)
      graphics.lineStyle(3, COLORS.ink, 0.55)
      graphics.strokeCircle(x, 594, 14)
      graphics.fillStyle(COLORS.ink, 0.78)
      if (target.direction === 'forward') {
        graphics.fillTriangle(x - 4, 587, x - 4, 601, x + 6, 594)
      } else {
        graphics.fillTriangle(x + 4, 587, x + 4, 601, x - 6, 594)
      }
    }
  }

  private drawRaceRail(): void {
    const graphics = this.raceGraphics
    graphics.clear()
    graphics.setDepth(11)
    graphics.fillStyle(COLORS.ink, 0.92)
    graphics.fillRoundedRect(1040, 76, 240, 644, 0)
    graphics.lineStyle(4, 0x31545a, 1)
    graphics.lineBetween(1114, 148, 1114, 638)

    const sorted = [...this.racers].sort((a, b) => b.progress - a.progress)
    for (const racer of sorted) {
      const y = 638 - racer.progress * 490
      graphics.fillStyle(racer.color, 1)
      graphics.fillCircle(1114, y, racer.isLocal ? 11 : 8)
      graphics.lineStyle(racer.isLocal ? 3 : 2, COLORS.cream, racer.isLocal ? 1 : 0.55)
      graphics.strokeCircle(1114, y, racer.isLocal ? 11 : 8)

      const label = this.children.getByName(`racer-${racer.id}`) as Phaser.GameObjects.Text | null
      if (label) {
        label.setPosition(1136, y - 8)
      } else {
        this.add.text(1136, y - 8, racer.name, headingStyle(racer.isLocal ? 15 : 13, `#${racer.color.toString(16).padStart(6, '0')}`))
          .setName(`racer-${racer.id}`)
          .setDepth(13)
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
        this.callText.setText('READ THE WATER').setColor('#f5f1df').setFontSize(34)
        this.callSubtext.setText('Hold the line')
      }
      return
    }

    const cue = this.level.cues[cueIndex]
    const directionLabel = cue.direction === 'forward' ? 'FORWARD' : 'BACKWARDS'
    this.callText
      .setText(`${directionLabel} ${cue.strokes}!`)
      .setColor(cue.direction === 'forward' ? this.level.accent : '#55c3cc')
      .setFontSize(cue.direction === 'forward' ? 56 : 48)
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
    const wave = Math.sin(elapsed * 0.004)
    this.raft.setPosition(520 + Math.sin(elapsed * 0.0013) * 76, 390 + wave * 8)
    this.raft.setRotation(wave * 0.055)
  }

  private updateHud(elapsed: number, countingDown: boolean): void {
    if (countingDown) {
      const seconds = Math.ceil((this.startAt - this.time.now) / 1000)
      this.callText.setText(seconds > 0 ? `${seconds}` : 'GO!').setFontSize(72).setColor('#ffc857')
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
    this.feedbackText.setText(label).setColor(RATING_COLOR[rating]).setAlpha(1).setScale(1.12)
    this.tweens.killTweensOf(this.feedbackText)
    this.tweens.add({
      targets: this.feedbackText,
      alpha: 0,
      scale: 1,
      y: { from: 520, to: 500 },
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

    this.add.rectangle(0, 0, 1280, 720, COLORS.ink, 0.82).setOrigin(0).setDepth(50)
    this.add.text(640, 235, this.mode === 'solo' ? 'TAKE OUT' : `${placeLabel} PLACE`, headingStyle(70, this.level.accent))
      .setOrigin(0.5)
      .setDepth(51)
    this.add.text(640, 322, `${(elapsed / 1000).toFixed(2)} SEC   /   ${this.rhythm.getAccuracy()}% ACCURACY`, headingStyle(21, '#f5f1df'))
      .setOrigin(0.5)
      .setDepth(51)
      .setLetterSpacing(1.4)
    this.add.text(640, 372, `${this.level.name} complete. Clean lines beat raw speed.`, bodyStyle(15, '#9bb9b4'))
      .setOrigin(0.5)
      .setDepth(51)
    const button = this.add.rectangle(640, 456, 230, 60, COLORS.yellow, 1)
      .setDepth(51)
      .setInteractive({ useHandCursor: true })
    const buttonLabel = this.add.text(640, 456, 'BACK TO PUT-IN', headingStyle(20, '#071f26'))
      .setOrigin(0.5)
      .setDepth(52)
      .setInteractive({ useHandCursor: true })
    const activateButton = (): void => this.returnToMenu()
    button.on('pointerdown', activateButton)
    buttonLabel.on('pointerdown', activateButton)
    button.on('pointerover', () => button.setFillStyle(0xffd979, 1))
    button.on('pointerout', () => button.setFillStyle(COLORS.yellow, 1))
  }

  private returnToMenu(): void {
    if (this.returningToMenu) return
    this.returningToMenu = true
    this.scene.start('menu')
  }

  private cleanUp(): void {
    this.input.keyboard?.off('keydown-SPACE', this.onForwardPaddle, this)
    this.input.keyboard?.off('keydown-F', this.onForwardPaddle, this)
    this.input.keyboard?.off('keydown-UP', this.onForwardPaddle, this)
    this.input.keyboard?.off('keydown-B', this.onBackwardPaddle, this)
    this.input.keyboard?.off('keydown-DOWN', this.onBackwardPaddle, this)
    this.input.keyboard?.off('keydown-ESC', this.returnToMenu, this)
    this.race.destroy()
    this.activeGuideCall?.stop()
    this.activeGuideCall?.destroy()
    this.activeGuideCall = undefined
  }
}
