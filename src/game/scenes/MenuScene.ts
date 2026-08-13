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
import { menuLayout, type MenuLayout } from '../ui/layout'
import { LevelSelection } from '../ui/levelSelection'
import { bodyStyle, COLORS, headingStyle, hexToNumber } from '../ui/theme'

interface MenuSceneData {
  /** Carried across a re-layout restart so rotating the device keeps your pick. */
  levelId?: string
}

export class MenuScene extends Phaser.Scene {
  private readonly levelSelection = new LevelSelection<Phaser.GameObjects.Rectangle>(LEVELS)
  private layout!: MenuLayout
  private description!: Phaser.GameObjects.Text
  private selectedLabel!: Phaser.GameObjects.Text
  private selectedVoiceId: GuideVoiceId = getSelectedGuideVoiceId()
  private voiceButtons: Array<{
    voiceId: GuideVoiceId
    background: Phaser.GameObjects.Rectangle
    label: Phaser.GameObjects.Text
  }> = []
  private voicePreview?: Phaser.Sound.BaseSound
  private relayout?: Phaser.Time.TimerEvent

  constructor() {
    super('menu')
  }

  /**
   * Phaser reuses one instance of this scene for every `scene.start()`, so the
   * field initializers above run exactly once. Everything `create()` rebuilds
   * has to be cleared here instead, or it accumulates on every visit.
   */
  init(data: MenuSceneData): void {
    this.levelSelection.reset()
    this.voiceButtons = []
    this.selectedVoiceId = getSelectedGuideVoiceId()
    this.relayout = undefined

    const restored = LEVELS.find((level) => level.id === data.levelId)
    if (restored) this.levelSelection.select(restored)
  }

  preload(): void {
    loadGuideAudio(this)
  }

  create(): void {
    this.layout = menuLayout(
      this.scale.width,
      this.scale.height,
      LEVELS.length,
      GUIDE_VOICES.length,
    )
    const { type, gutter } = this.layout

    this.cameras.main.setBackgroundColor(COLORS.ink)
    this.drawBackdrop()

    this.add.text(gutter, this.layout.title.y, 'FORWARD', headingStyle(type.hero, '#f5f1df'))
      .setLetterSpacing(-2)
    this.add.text(
      gutter + type.hero * 3.35,
      this.layout.title.y + type.hero * 0.08,
      'ONE',
      headingStyle(type.heading, '#ffc857'),
    ).setLetterSpacing(5)
    this.add.text(
      gutter,
      this.layout.subtitle.y,
      this.layout.mode === 'portrait'
        ? 'HEAR THE CALL.\nFIND THE LINE.'
        : 'HEAR THE CALL.  FIND THE LINE.  DRIVE TOGETHER.',
      headingStyle(type.heading, '#9bb9b4'),
    ).setLetterSpacing(2)

    this.add.text(
      gutter,
      this.layout.sectionLabel.y,
      'CHOOSE YOUR WATER',
      headingStyle(type.heading, '#ffc857'),
    ).setLetterSpacing(2)

    LEVELS.forEach((level, index) => this.createLevelCard(level, index))

    this.selectedLabel = this.add.text(
      this.layout.detail.x,
      this.layout.detail.y,
      '',
      headingStyle(type.title),
    )
    this.description = this.add.text(
      this.layout.detail.x,
      this.layout.detail.y + type.title * 1.25,
      '',
      {
        ...bodyStyle(type.body, '#9bb9b4'),
        wordWrap: { width: this.layout.detail.width },
        lineSpacing: Math.round(type.body * 0.4),
      },
    )
    this.renderSelection()

    this.createModeButton(this.layout.modeButtons[0], 'SOLO RUN', 'Practice your line', 'solo')
    this.createModeButton(
      this.layout.modeButtons[1],
      'RACE PREVIEW',
      '3 simulated rivals',
      'multiplayer-preview',
    )
    this.createVoiceSelector()

    this.add.text(
      gutter,
      this.layout.hint.y,
      this.layout.mode === 'portrait'
        ? 'TAP THE PADDLE BUTTONS TO PLAY'
        : 'SPACE / F  FORWARD     B  BACKWARDS',
      headingStyle(type.label, '#688e87'),
    ).setLetterSpacing(1.2)

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanUp, this)
  }

  /**
   * A menu holds no run state, so the cheapest correct response to a rotate is
   * to rebuild it from the new viewport — carrying the chosen level across so
   * the player does not lose their pick. Debounced, because a desktop window
   * drag fires this continuously.
   */
  private handleResize(): void {
    this.relayout?.remove()
    this.relayout = this.time.delayedCall(120, () => {
      if (!this.scene.isActive()) return
      this.scene.restart({ levelId: this.levelSelection.selected.id })
    })
  }

  private drawBackdrop(): void {
    const { width, height } = this.layout
    const graphics = this.add.graphics()
    const px = (fx: number): number => fx * width
    const py = (fy: number): number => fy * height

    graphics.fillStyle(0x0b3540, 1)
    graphics.beginPath()
    graphics.moveTo(px(0.586), py(-0.028))
    graphics.lineTo(px(0.547), py(0.153))
    graphics.lineTo(px(0.566), py(0.257))
    graphics.lineTo(px(0.684), py(0.354))
    graphics.lineTo(px(0.648), py(0.542))
    graphics.lineTo(px(0.605), py(0.701))
    graphics.lineTo(px(0.742), py(0.868))
    graphics.lineTo(px(0.719), py(1.056))
    graphics.lineTo(px(1.02), py(1.056))
    graphics.lineTo(px(1.02), py(-0.028))
    graphics.closePath()
    graphics.fillPath()

    graphics.lineStyle(3, 0x55c3cc, 0.34)
    const step = Math.max(48, height * 0.103)
    for (let y = height * 0.06; y < height; y += step) {
      graphics.beginPath()
      graphics.moveTo(px(0.719) + Math.sin(y) * (width * 0.02), y)
      graphics.lineTo(px(0.777), y - height * 0.025)
      graphics.lineTo(px(0.828), y + height * 0.025)
      graphics.lineTo(px(0.898), y)
      graphics.strokePath()
    }

    for (let i = 0; i < 15; i += 1) {
      const x = px(0.563) + ((i * 83) % Math.max(1, width * 0.43))
      const y = py(0.035) + ((i * 137) % Math.max(1, height * 0.944))
      graphics.fillStyle(i % 2 ? 0x47775c : 0x2d5947, 0.8)
      graphics.fillCircle(x, y, Math.max(6, width * 0.01) + (i % 3) * 4)
    }
  }

  private createLevelCard(level: LevelConfig, index: number): void {
    const rect = this.layout.cards[index]
    const card = this.add.container(rect.x, rect.y)
    const background = this.add
      .rectangle(0, 0, rect.width, rect.height, COLORS.inkSoft, 0.96)
      .setOrigin(0)
    background.setInteractive({ useHandCursor: true })

    // Card type is sized from the card, not the viewport, so a short landscape
    // card does not overflow with a numeral meant for a tall one.
    const numberSize = Math.round(rect.height * 0.46)
    const labelSize = Math.round(Math.max(10, rect.height * 0.11))
    const pad = Math.round(rect.width * 0.09)

    const classLabel = this.add
      .text(pad, pad * 0.7, 'CLASS', headingStyle(labelSize, '#9bb9b4'))
      .setLetterSpacing(1.5)
    const number = this.add.text(
      pad - 1,
      pad * 0.7 + labelSize * 1.1,
      `${level.rapidClass}`,
      headingStyle(numberSize, level.accent),
    )
    const name = this.add.text(
      pad,
      rect.height - pad * 0.7 - labelSize * 1.2,
      level.name.toUpperCase(),
      headingStyle(labelSize, '#f5f1df'),
    )

    background.on('pointerdown', () => {
      this.levelSelection.select(level)
      this.renderSelection()
    })
    background.on('pointerover', () => background.setFillStyle(0x16424a, 1))
    background.on('pointerout', () => background.setFillStyle(COLORS.inkSoft, 0.96))

    card.add([background, classLabel, number, name])
    this.levelSelection.register(level, background)
  }

  private renderSelection(): void {
    for (const { level, view, selected } of this.levelSelection.entries()) {
      view.setStrokeStyle(2, selected ? hexToNumber(level.accent) : 0x31545a, selected ? 1 : 0.8)
    }

    const selectedLevel = this.levelSelection.selected
    if (this.selectedLabel && this.description) {
      this.selectedLabel.setText(
        `CLASS ${selectedLevel.rapidClass}  /  ${selectedLevel.name.toUpperCase()}`,
      )
      this.description.setText(selectedLevel.description)
    }
  }

  private createModeButton(
    rect: { x: number; y: number; width: number; height: number },
    title: string,
    subtitle: string,
    mode: RaceMode,
  ): void {
    const { type } = this.layout
    const fill = mode === 'solo' ? COLORS.yellow : 0x1a4a52
    const titleColor = mode === 'solo' ? '#071f26' : '#f5f1df'
    const button = this.add.rectangle(rect.x, rect.y, rect.width, rect.height, fill, 1).setOrigin(0)
    button.setInteractive({ useHandCursor: true })

    const pad = Math.round(rect.width * 0.06)
    this.add.text(rect.x + pad, rect.y + rect.height * 0.16, title, headingStyle(type.heading, titleColor))
    this.add.text(
      rect.x + pad,
      rect.y + rect.height * 0.16 + type.heading * 1.2,
      subtitle,
      bodyStyle(Math.round(type.label * 0.9), mode === 'solo' ? '#31545a' : '#9bb9b4'),
    )

    button.on('pointerdown', () => {
      this.scene.start('river', { levelId: this.levelSelection.selected.id, mode })
    })
    button.on('pointerover', () => button.setAlpha(0.84))
    button.on('pointerout', () => button.setAlpha(1))
  }

  private createVoiceSelector(): void {
    const { type, voicePanel, voiceButtons } = this.layout

    this.add
      .rectangle(voicePanel.x, voicePanel.y, voicePanel.width, voicePanel.height, 0x102f36, 1)
      .setOrigin(0)
      .setStrokeStyle(2, 0x31545a, 1)
    this.add
      .text(
        voicePanel.x + Math.round(voicePanel.width * 0.03),
        voicePanel.y + Math.round(type.label * 0.5),
        this.layout.mode === 'portrait' ? 'GUIDE VOICE' : 'GUIDE VOICE  /  SELECT + PREVIEW',
        headingStyle(Math.round(type.label * 0.92), '#9bb9b4'),
      )
      .setLetterSpacing(1)

    GUIDE_VOICES.forEach((voice, index) => {
      const rect = voiceButtons[index]
      const background = this.add
        .rectangle(rect.x, rect.y, rect.width, rect.height, 0x1a4a52, 1)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
      const label = this.add
        .text(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          voice.name.toUpperCase(),
          headingStyle(Math.round(type.label * 0.95)),
        )
        .setOrigin(0.5)
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

  private cleanUp(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.relayout?.remove()
    this.relayout = undefined
    this.voicePreview?.stop()
    this.voicePreview?.destroy()
    this.voicePreview = undefined
  }
}
