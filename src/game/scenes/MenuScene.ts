import Phaser from 'phaser'
import {
  getSelectedGuideVoiceId,
  GUIDE_VOICES,
  guideVoicePreviewClip,
  loadGuideVoicePreviews,
  selectGuideVoice,
  type GuideVoiceId,
} from '../audio/guideAudio'
import { LEVELS } from '../levels'
import { isMultiplayerConfigured } from '../multiplayer/multiplayerConfig'
import { isRoomCode, normalizeRoomCode } from '../multiplayer/roomPolicy'
import type { LevelConfig } from '../types'
import { descriptionLineSpacing, levelCardText, menuLayout, type MenuLayout } from '../ui/layout'
import { LevelSelection } from '../ui/levelSelection'
import { bodyStyle, COLORS, headingStyle, hexToNumber, TEXT_COLORS } from '../ui/theme'

interface MenuSceneData {
  /** Carried across a re-layout restart so rotating the device keeps your pick. */
  levelId?: string
  mode?: MenuMode
}

type MenuMode = 'solo' | 'race'

export class MenuScene extends Phaser.Scene {
  private readonly levelSelection = new LevelSelection<Phaser.GameObjects.Rectangle>(LEVELS)
  private layout!: MenuLayout
  private description!: Phaser.GameObjects.Text
  private selectedLabel!: Phaser.GameObjects.Text
  private selectedVoiceId: GuideVoiceId = getSelectedGuideVoiceId()
  private selectedMode: MenuMode = 'solo'
  private modeButtons: Array<{
    mode: MenuMode
    background: Phaser.GameObjects.Rectangle
    title: Phaser.GameObjects.Text
    subtitle: Phaser.GameObjects.Text
  }> = []
  private voiceButtons: Array<{
    voiceId: GuideVoiceId
    background: Phaser.GameObjects.Rectangle
    label: Phaser.GameObjects.Text
  }> = []
  private helpObjects: Phaser.GameObjects.GameObject[] = []
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
    this.modeButtons = []
    this.voiceButtons = []
    this.helpObjects = []
    this.selectedMode = data.mode ?? 'solo'
    this.selectedVoiceId = getSelectedGuideVoiceId()
    this.relayout = undefined

    const restored = LEVELS.find((level) => level.id === data.levelId)
    if (restored) this.levelSelection.select(restored)
  }

  preload(): void {
    // The put-in screen only ever plays a preview, so one clip per voice is enough.
    loadGuideVoicePreviews(this)
  }

  create(): void {
    const invitedCode = normalizeRoomCode(
      new URL(window.location.href).searchParams.get('room') ?? '',
    )
    if (isMultiplayerConfigured() && isRoomCode(invitedCode)) {
      this.scene.start('lobby', { levelId: this.levelSelection.selected.id })
      return
    }

    this.layout = menuLayout(
      this.scale.width,
      this.scale.height,
      LEVELS.length,
      GUIDE_VOICES.length,
    )
    const { type } = this.layout

    this.cameras.main.setBackgroundColor(COLORS.ink)
    this.drawBackdrop()

    if (this.layout.split) {
      const { setupPanel } = this.layout
      this.add
        .rectangle(
          setupPanel.x,
          setupPanel.y,
          setupPanel.width,
          setupPanel.height,
          COLORS.inkSoft,
          0.97,
        )
        .setOrigin(0)
        .setStrokeStyle(2, 0x31545a, 1)
    }

    this.add.text(this.layout.title.x, this.layout.title.y, 'FORWARD', headingStyle(type.hero, '#f5f1df'))
      .setLetterSpacing(-2)
    this.add.text(
      this.layout.title.x + type.hero * 3.35,
      this.layout.title.y + type.hero * 0.08,
      'ONE',
      headingStyle(type.heading, '#ffc857'),
    ).setLetterSpacing(5)
    this.add.text(
      this.layout.subtitle.x,
      this.layout.subtitle.y,
      this.layout.split
        ? 'HEAR THE CALL.\nFIND THE LINE.'
        : this.layout.mode === 'portrait'
        ? 'HEAR THE CALL.\nFIND THE LINE.'
        : 'HEAR THE CALL.  FIND THE LINE.',
      headingStyle(
        this.layout.split ? Math.round(type.hero * 1.02) : type.heading,
        this.layout.split ? TEXT_COLORS.cream : TEXT_COLORS.muted,
      ),
    )
      .setLetterSpacing(this.layout.split ? -1 : 2)
      .setLineSpacing(this.layout.split ? -Math.round(type.hero * 0.08) : 0)

    if (this.layout.split) {
      this.add.text(
        this.layout.heroBody.x,
        this.layout.heroBody.y,
        'A river rhythm game about listening early,\nholding your nerve, and paddling on the beat.',
        {
          ...bodyStyle(type.body, TEXT_COLORS.muted),
          lineSpacing: Math.round(type.body * 0.55),
        },
      )
    }

    this.add.text(
      this.layout.sectionLabel.x,
      this.layout.sectionLabel.y,
      'CHOOSE YOUR RUN',
      headingStyle(type.heading, TEXT_COLORS.cream),
    ).setLetterSpacing(2)

    LEVELS.forEach((level, index) => this.createLevelCard(level, index))

    this.selectedLabel = this.add.text(
      this.layout.detail.x,
      this.layout.detail.y,
      '',
      headingStyle(this.layout.detailLabel),
    )
    this.description = this.add.text(
      this.layout.detail.x,
      this.layout.detail.y + this.layout.detailLabel * 1.25,
      '',
      {
        ...bodyStyle(type.body, '#9bb9b4'),
        wordWrap: { width: this.layout.detail.width },
        lineSpacing: descriptionLineSpacing(type.body),
      },
    )
    this.renderSelection()

    const online = isMultiplayerConfigured()
    this.createModeButton(
      this.layout.modeButtons[0],
      'SOLO SURVIVAL',
      'Last as long as you can',
      'solo',
    )
    this.createModeButton(
      this.layout.modeButtons[1],
      online ? 'ONLINE RACE' : 'SURVIVAL RACE',
      online ? '8 default / rooms up to 64' : 'Outlast 3 simulated rivals',
      'race',
    )
    this.renderModeSelection()
    this.createVoiceSelector()
    this.createStartButton()
    this.createHowToPlayButton()

    this.add.text(
      this.layout.hint.x,
      this.layout.hint.y,
      this.layout.mode === 'portrait'
        ? 'PADDLE CONTROLS  /  FORWARD + BACKWARDS'
        : 'SPACE / F  FORWARD     B / ↓  BACKWARDS',
      headingStyle(type.label, TEXT_COLORS.mutedDark),
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
      this.scene.restart({
        levelId: this.levelSelection.selected.id,
        mode: this.selectedMode,
      })
    })
  }

  private drawBackdrop(): void {
    const { width, height } = this.layout
    const graphics = this.add.graphics()
    const px = (fx: number): number => fx * width
    const py = (fy: number): number => fy * height

    if (this.layout.split) {
      graphics.fillStyle(COLORS.water, 0.38)
      graphics.beginPath()
      graphics.moveTo(px(-0.03), py(0.14))
      graphics.lineTo(px(0.24), py(0.08))
      graphics.lineTo(px(0.44), py(0.34))
      graphics.lineTo(px(0.34), py(0.61))
      graphics.lineTo(px(0.46), py(0.91))
      graphics.lineTo(px(0.18), py(1.04))
      graphics.lineTo(px(-0.03), py(0.78))
      graphics.closePath()
      graphics.fillPath()

      graphics.lineStyle(3, COLORS.waterLight, 0.32)
      for (let i = 0; i < 8; i += 1) {
        const y = py(0.11 + i * 0.11)
        graphics.beginPath()
        graphics.moveTo(px(0.03), y)
        graphics.lineTo(px(0.14), y + py(0.025))
        graphics.lineTo(px(0.27), y - py(0.018))
        graphics.lineTo(px(0.4), y + py(0.01))
        graphics.strokePath()
      }
    }

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
    const text = levelCardText(rect)

    const classLabel = this.add
      .text(
        text.classLabel.x,
        text.classLabel.y,
        'CLASS',
        headingStyle(text.classLabel.size, '#9bb9b4'),
      )
      .setLetterSpacing(1.5)
    const number = this.add.text(
      text.number.x,
      text.number.y,
      `${level.rapidClass}`,
      headingStyle(text.number.size, level.accent),
    )
    const name = this.add.text(
      text.name.x,
      text.name.y,
      level.name.toUpperCase(),
      headingStyle(text.name.size, '#f5f1df'),
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
    mode: MenuMode,
  ): void {
    const { type } = this.layout
    const button = this.add
      .rectangle(rect.x, rect.y, rect.width, rect.height, COLORS.inkSoft, 1)
      .setOrigin(0)
    button.setInteractive({ useHandCursor: true })

    const pad = Math.round(rect.width * 0.06)
    const titleObject = this.add.text(
      rect.x + pad,
      rect.y + rect.height * 0.16,
      title,
      headingStyle(type.heading, TEXT_COLORS.cream),
    )
    const subtitleObject = this.add.text(
      rect.x + pad,
      rect.y + rect.height * 0.16 + type.heading * 1.2,
      subtitle,
      bodyStyle(Math.round(type.label * 0.9), TEXT_COLORS.muted),
    )

    button.on('pointerdown', () => {
      this.selectedMode = mode
      this.renderModeSelection()
    })
    button.on('pointerover', () => button.setAlpha(0.84))
    button.on('pointerout', () => button.setAlpha(1))
    this.modeButtons.push({
      mode,
      background: button,
      title: titleObject,
      subtitle: subtitleObject,
    })
  }

  private renderModeSelection(): void {
    for (const button of this.modeButtons) {
      const selected = button.mode === this.selectedMode
      button.background
        .setFillStyle(selected ? COLORS.control : COLORS.inkSoft, 1)
        .setStrokeStyle(selected ? 3 : 2, selected ? COLORS.waterLight : 0x31545a, 1)
      button.title.setColor(selected ? TEXT_COLORS.waterLight : TEXT_COLORS.cream)
      button.subtitle.setColor(selected ? TEXT_COLORS.cream : TEXT_COLORS.muted)
    }
  }

  private createStartButton(): void {
    const { startButton: rect, type } = this.layout
    const button = this.add
      .rectangle(rect.x, rect.y, rect.width, rect.height, COLORS.yellow, 1)
      .setOrigin(0)
      .setStrokeStyle(2, 0xffdd82, 1)
      .setInteractive({ useHandCursor: true })
    const label = this.add
      .text(
        rect.x + rect.width * 0.06,
        rect.y + rect.height / 2,
        'START RUN',
        headingStyle(Math.round(type.title * 1.08), TEXT_COLORS.ink),
      )
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
    const arrow = this.add
      .text(
        rect.x + rect.width * 0.94,
        rect.y + rect.height / 2,
        '→',
        headingStyle(Math.round(type.title * 1.18), TEXT_COLORS.ink),
      )
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
    const start = (): void => this.startSelectedMode()
    button.on('pointerdown', start)
    label.on('pointerdown', start)
    arrow.on('pointerdown', start)
    button.on('pointerover', () => button.setFillStyle(0xffd979, 1))
    button.on('pointerout', () => button.setFillStyle(COLORS.yellow, 1))
  }

  private startSelectedMode(): void {
    if (this.selectedMode === 'solo') {
      this.scene.start('river', {
        levelId: this.levelSelection.selected.id,
        mode: 'solo',
      })
      return
    }

    if (isMultiplayerConfigured()) {
      this.scene.start('lobby', { levelId: this.levelSelection.selected.id })
      return
    }

    this.scene.start('river', {
      levelId: this.levelSelection.selected.id,
      mode: 'multiplayer-preview',
    })
  }

  private createHowToPlayButton(): void {
    const { howToPlayButton: rect, split, type } = this.layout
    const button = this.add
      .rectangle(rect.x, rect.y, rect.width, rect.height, COLORS.inkSoft, 0.96)
      .setOrigin(0)
      .setStrokeStyle(2, COLORS.waterLight, 1)
      .setInteractive({ useHandCursor: true })
    const label = this.add
      .text(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        split ? '▶  HOW TO PLAY' : '?',
        headingStyle(split ? type.heading : type.title, TEXT_COLORS.waterLight),
      )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
    const show = (): void => this.showHowToPlay()
    button.on('pointerdown', show)
    label.on('pointerdown', show)
  }

  private showHowToPlay(): void {
    if (this.helpObjects.length > 0) return
    const { howToPlayPanel: panel, howToPlayCloseButton: close, type } = this.layout
    const pad = Math.round(Math.max(18, panel.width * 0.06))
    const scrim = this.add
      .rectangle(0, 0, this.layout.width, this.layout.height, COLORS.ink, 0.88)
      .setOrigin(0)
      .setDepth(50)
      .setInteractive()
    const panelObject = this.add
      .rectangle(panel.x, panel.y, panel.width, panel.height, COLORS.inkSoft, 1)
      .setOrigin(0)
      .setDepth(51)
      .setStrokeStyle(2, COLORS.waterLight, 1)
    const title = this.add
      .text(panel.x + pad, panel.y + pad, 'HOW TO PLAY', headingStyle(type.title, TEXT_COLORS.cream))
      .setDepth(52)
    const intro = this.add
      .text(
        panel.x + pad,
        panel.y + pad + type.title * 1.5,
        'The guide calls early. Your job is to wait for the beat.',
        bodyStyle(type.body, TEXT_COLORS.muted),
      )
      .setDepth(52)
      .setWordWrapWidth(panel.width - pad * 2)
    const steps = [
      ['1  HEAR THE CALL', 'Read the direction and number of strokes.'],
      ['2  WATCH THE MARKERS', 'Each marker is one paddle stroke.'],
      ['3  HIT THE YELLOW GATE', 'Paddle when a marker reaches the gate—not before.'],
    ] as const
    const stepObjects = steps.flatMap(([heading, copy], index) => {
      const y = panel.y + pad + type.title * 2.75 + index * type.body * 4.1
      return [
        this.add
          .text(panel.x + pad, y, heading, headingStyle(type.heading, TEXT_COLORS.yellow))
          .setDepth(52),
        this.add
          .text(panel.x + pad, y + type.heading * 1.1, copy, bodyStyle(type.body, TEXT_COLORS.cream))
          .setDepth(52)
          .setWordWrapWidth(panel.width - pad * 2),
      ]
    })
    const closeButton = this.add
      .rectangle(close.x, close.y, close.width, close.height, COLORS.yellow, 1)
      .setOrigin(0)
      .setDepth(52)
      .setInteractive({ useHandCursor: true })
    const closeLabel = this.add
      .text(
        close.x + close.width / 2,
        close.y + close.height / 2,
        'GOT IT',
        headingStyle(type.heading, TEXT_COLORS.ink),
      )
      .setOrigin(0.5)
      .setDepth(53)
      .setInteractive({ useHandCursor: true })
    this.helpObjects = [
      scrim,
      panelObject,
      title,
      intro,
      ...stepObjects,
      closeButton,
      closeLabel,
    ]
    const dismiss = (): void => this.dismissHowToPlay()
    closeButton.on('pointerdown', dismiss)
    closeLabel.on('pointerdown', dismiss)
  }

  private dismissHowToPlay(): void {
    for (const object of this.helpObjects) object.destroy()
    this.helpObjects = []
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
        voicePanel.y + Math.round(type.label * 0.28),
        this.layout.mode === 'portrait' ? 'GUIDE VOICE' : 'GUIDE VOICE  /  SELECT + PREVIEW',
        headingStyle(Math.round(type.label * 0.82), '#9bb9b4'),
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
    this.voicePreview = undefined

    // Ask guideAudio for the clip it queued rather than naming one again here, so
    // the preview that is fetched and the preview that is played cannot drift
    // apart. A clip that never arrived leaves the voice chosen, and stays silent.
    const key = guideVoicePreviewClip(voiceId).key
    if (!this.cache.audio.exists(key)) return

    const preview = this.sound.add(key, { volume: 1 })
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
