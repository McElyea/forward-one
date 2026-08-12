import Phaser from 'phaser'
import {
  getSelectedGuideVoiceId,
  GUIDE_VOICES,
  guideAudioKey,
  loadGuideAudio,
  selectGuideVoice,
  type GuideVoiceId,
} from '../audio/guideAudio'
import { LEVELS } from '../levels'
import type { LevelConfig, RaceMode } from '../types'
import { bodyStyle, COLORS, headingStyle, hexToNumber } from '../ui/theme'

export class MenuScene extends Phaser.Scene {
  private selectedLevel: LevelConfig = LEVELS[0]
  private levelCards: Phaser.GameObjects.Container[] = []
  private description!: Phaser.GameObjects.Text
  private selectedLabel!: Phaser.GameObjects.Text
  private selectedVoiceId: GuideVoiceId = getSelectedGuideVoiceId()
  private voiceButtons: Array<{
    voiceId: GuideVoiceId
    background: Phaser.GameObjects.Rectangle
    label: Phaser.GameObjects.Text
  }> = []
  private voicePreview?: Phaser.Sound.BaseSound

  constructor() {
    super('menu')
  }

  preload(): void {
    loadGuideAudio(this)
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.ink)
    this.drawBackdrop()

    this.add.text(78, 68, 'FORWARD', headingStyle(88, '#f5f1df')).setLetterSpacing(-2)
    this.add.text(365, 62, 'ONE', headingStyle(28, '#ffc857')).setLetterSpacing(5)
    this.add.text(
      82,
      158,
      'HEAR THE CALL.  FIND THE LINE.  DRIVE TOGETHER.',
      headingStyle(20, '#9bb9b4'),
    ).setLetterSpacing(2)

    this.add.text(82, 238, 'CHOOSE YOUR WATER', headingStyle(20, '#ffc857')).setLetterSpacing(2)

    LEVELS.forEach((level, index) => this.createLevelCard(level, index))

    this.selectedLabel = this.add.text(82, 444, '', headingStyle(34))
    this.description = this.add.text(82, 488, '', {
      ...bodyStyle(16, '#9bb9b4'),
      wordWrap: { width: 560 },
      lineSpacing: 7,
    })
    this.renderSelection()

    this.createModeButton(82, 590, 236, 'SOLO RUN', 'Practice your line', 'solo')
    this.createModeButton(334, 590, 270, 'RACE PREVIEW', '3 simulated rivals', 'multiplayer-preview')
    this.createVoiceSelector(620, 590, 390)

    this.add.text(84, 675, 'SPACE / F  FORWARD     B  BACKWARDS', headingStyle(15, '#688e87')).setLetterSpacing(1.2)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.voicePreview?.stop()
      this.voicePreview?.destroy()
      this.voicePreview = undefined
    })
  }

  private drawBackdrop(): void {
    const graphics = this.add.graphics()
    graphics.fillStyle(0x0b3540, 1)
    graphics.beginPath()
    graphics.moveTo(750, -20)
    graphics.lineTo(700, 110)
    graphics.lineTo(725, 185)
    graphics.lineTo(875, 255)
    graphics.lineTo(830, 390)
    graphics.lineTo(775, 505)
    graphics.lineTo(950, 625)
    graphics.lineTo(920, 760)
    graphics.lineTo(1280, 760)
    graphics.lineTo(1280, -20)
    graphics.closePath()
    graphics.fillPath()

    graphics.lineStyle(3, 0x55c3cc, 0.34)
    for (let y = 45; y < 760; y += 74) {
      graphics.beginPath()
      graphics.moveTo(920 + Math.sin(y) * 25, y)
      graphics.lineTo(995, y - 18)
      graphics.lineTo(1060, y + 18)
      graphics.lineTo(1150, y)
      graphics.strokePath()
    }

    for (let i = 0; i < 15; i += 1) {
      const x = 720 + ((i * 83) % 550)
      const y = 25 + ((i * 137) % 680)
      graphics.fillStyle(i % 2 ? 0x47775c : 0x2d5947, 0.8)
      graphics.fillCircle(x, y, 13 + (i % 3) * 4)
    }
  }

  private createLevelCard(level: LevelConfig, index: number): void {
    const x = 82 + index * 148
    const card = this.add.container(x, 278)
    const background = this.add.rectangle(0, 0, 132, 132, COLORS.inkSoft, 0.96).setOrigin(0)
    background.setStrokeStyle(2, index === 0 ? hexToNumber(level.accent) : 0x31545a, 1)
    background.setInteractive({ useHandCursor: true })

    const classLabel = this.add.text(16, 14, 'CLASS', headingStyle(14, '#9bb9b4')).setLetterSpacing(1.5)
    const number = this.add.text(15, 26, `${level.rapidClass}`, headingStyle(67, level.accent))
    const name = this.add.text(16, 103, level.name.toUpperCase(), headingStyle(13, '#f5f1df'))

    background.on('pointerdown', () => {
      this.selectedLevel = level
      this.renderSelection()
    })
    background.on('pointerover', () => background.setFillStyle(0x16424a, 1))
    background.on('pointerout', () => background.setFillStyle(COLORS.inkSoft, 0.96))

    card.add([background, classLabel, number, name])
    this.levelCards.push(card)
  }

  private renderSelection(): void {
    this.levelCards.forEach((card, index) => {
      const background = card.first as Phaser.GameObjects.Rectangle
      const level = LEVELS[index]
      const selected = level.id === this.selectedLevel.id
      background.setStrokeStyle(2, selected ? hexToNumber(level.accent) : 0x31545a, selected ? 1 : 0.8)
    })

    if (this.selectedLabel && this.description) {
      this.selectedLabel.setText(`CLASS ${this.selectedLevel.rapidClass}  /  ${this.selectedLevel.name.toUpperCase()}`)
      this.description.setText(this.selectedLevel.description)
    }
  }

  private createModeButton(
    x: number,
    y: number,
    width: number,
    title: string,
    subtitle: string,
    mode: RaceMode,
  ): void {
    const fill = mode === 'solo' ? COLORS.yellow : 0x1a4a52
    const titleColor = mode === 'solo' ? '#071f26' : '#f5f1df'
    const button = this.add.rectangle(x, y, width, 64, fill, 1).setOrigin(0)
    button.setInteractive({ useHandCursor: true })
    this.add.text(x + 18, y + 10, title, headingStyle(20, titleColor))
    this.add.text(x + 18, y + 37, subtitle, bodyStyle(11, mode === 'solo' ? '#31545a' : '#9bb9b4'))

    button.on('pointerdown', () => {
      this.scene.start('river', { levelId: this.selectedLevel.id, mode })
    })
    button.on('pointerover', () => button.setAlpha(0.84))
    button.on('pointerout', () => button.setAlpha(1))
  }

  private createVoiceSelector(x: number, y: number, width: number): void {
    this.add.rectangle(x, y, width, 64, 0x102f36, 1)
      .setOrigin(0)
      .setStrokeStyle(2, 0x31545a, 1)
    this.add.text(x + 14, y + 7, 'GUIDE VOICE  /  SELECT + PREVIEW', headingStyle(12, '#9bb9b4'))
      .setLetterSpacing(1)

    const gap = 6
    const buttonWidth = (width - 28 - gap * (GUIDE_VOICES.length - 1)) / GUIDE_VOICES.length
    GUIDE_VOICES.forEach((voice, index) => {
      const buttonX = x + 14 + index * (buttonWidth + gap)
      const background = this.add.rectangle(buttonX, y + 28, buttonWidth, 27, 0x1a4a52, 1)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
      const label = this.add.text(buttonX + buttonWidth / 2, y + 34, voice.name.toUpperCase(), headingStyle(12))
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
      const chooseVoice = (): void => this.chooseAndPreviewVoice(voice.id)
      background.on('pointerdown', chooseVoice)
      label.on('pointerdown', chooseVoice)
      this.voiceButtons.push({ voiceId: voice.id, background, label })
    })

    this.renderVoiceSelection()
  }

  private chooseAndPreviewVoice(voiceId: GuideVoiceId): void {
    this.selectedVoiceId = voiceId
    selectGuideVoice(voiceId)
    this.renderVoiceSelection()

    this.voicePreview?.stop()
    this.voicePreview?.destroy()
    const preview = this.sound.add(guideAudioKey(voiceId, 'forward', 4), { volume: 1 })
    this.voicePreview = preview
    preview.once(Phaser.Sound.Events.COMPLETE, () => {
      preview.destroy()
      if (this.voicePreview === preview) this.voicePreview = undefined
    })
    preview.play()
  }

  private renderVoiceSelection(): void {
    for (const button of this.voiceButtons) {
      const selected = button.voiceId === this.selectedVoiceId
      button.background.setFillStyle(selected ? COLORS.yellow : 0x1a4a52, 1)
      button.label.setColor(selected ? '#071f26' : '#f5f1df')
    }
  }
}
