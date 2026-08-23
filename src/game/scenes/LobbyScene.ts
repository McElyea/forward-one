import Phaser from 'phaser'
import { getLevel } from '../levels'
import { getPlayerName, savePlayerName } from '../multiplayer/playerIdentity'
import {
  DEFAULT_ROOM_CAPACITY,
  isRoomCode,
  normalizeRoomCode,
  ROOM_CAPACITY_OPTIONS,
} from '../multiplayer/roomPolicy'
import type { LobbySnapshot } from '../multiplayer/roomProtocol'
import { SupabaseRoomConnection } from '../multiplayer/SupabaseRoomConnection'
import { lobbyLayout, type LobbyLayout, type Rect } from '../ui/layout'
import {
  bodyStyle,
  COLORS,
  FONT_BODY,
  headingStyle,
  TEXT_COLORS,
} from '../ui/theme'

interface LobbySceneData {
  levelId?: string
}

interface LobbyButton {
  background: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
}

type LobbyViewObject = Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text

const colorHex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

const messageFrom = (error: unknown): string =>
  error instanceof Error ? error.message : 'The room service could not complete that request'

export class LobbyScene extends Phaser.Scene {
  private levelId = 'class-ii'
  private layout!: LobbyLayout
  private layoutAppliers: Array<(layout: LobbyLayout) => void> = []
  private setupObjects: LobbyViewObject[] = []
  private roomObjects: LobbyViewObject[] = []
  private capacityButtons: Array<LobbyButton & { capacity: number }> = []
  private selectedCapacity = DEFAULT_ROOM_CAPACITY
  private nameInput?: HTMLInputElement
  private codeInput?: HTMLInputElement
  private connection?: SupabaseRoomConnection
  private stopLobbyListener?: () => void
  private stopStartListener?: () => void
  private statusText!: Phaser.GameObjects.Text
  private roomHeading!: Phaser.GameObjects.Text
  private roomSubheading!: Phaser.GameObjects.Text
  private membersText!: Phaser.GameObjects.Text
  private readyButton!: LobbyButton
  private startButton!: LobbyButton
  private copyButton!: LobbyButton
  private leaveButton!: LobbyButton
  private localReady = false
  private busy = false
  private inRoom = false
  private transferringConnection = false

  constructor() {
    super('lobby')
  }

  init(data: LobbySceneData): void {
    this.levelId = getLevel(data.levelId ?? 'class-ii').id
    this.layoutAppliers = []
    this.setupObjects = []
    this.roomObjects = []
    this.capacityButtons = []
    this.selectedCapacity = DEFAULT_ROOM_CAPACITY
    this.nameInput = undefined
    this.codeInput = undefined
    this.connection = undefined
    this.stopLobbyListener = undefined
    this.stopStartListener = undefined
    this.localReady = false
    this.busy = false
    this.inRoom = false
    this.transferringConnection = false
  }

  create(): void {
    this.layout = lobbyLayout(this.scale.width, this.scale.height)
    this.cameras.main.setBackgroundColor(COLORS.ink)
    this.createBackdrop()
    this.createHeading()
    this.createSetupView()
    this.createRoomView()
    this.renderCapacity()
    this.renderView()

    const invitedCode = normalizeRoomCode(
      new URL(window.location.href).searchParams.get('room') ?? '',
    )
    if (this.codeInput && isRoomCode(invitedCode)) this.codeInput.value = invitedCode

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanUp, this)
  }

  private onLayout(apply: (layout: LobbyLayout) => void): void {
    this.layoutAppliers.push(apply)
    apply(this.layout)
  }

  private handleResize(): void {
    this.layout = lobbyLayout(this.scale.width, this.scale.height)
    for (const apply of this.layoutAppliers) apply(this.layout)
  }

  private createBackdrop(): void {
    const graphics = this.add.graphics()
    this.onLayout((layout) => {
      graphics.clear()
      graphics.fillStyle(COLORS.inkSoft, 1)
      graphics.fillRoundedRect(
        layout.content.x,
        layout.content.y,
        layout.content.width,
        layout.content.height,
        Math.max(layout.gutter, layout.content.width * 0.025),
      )
      graphics.lineStyle(2, COLORS.waterLight, 0.35)
      graphics.strokeRoundedRect(
        layout.content.x,
        layout.content.y,
        layout.content.width,
        layout.content.height,
        Math.max(layout.gutter, layout.content.width * 0.025),
      )
    })
  }

  private createHeading(): void {
    const title = this.add.text(0, 0, 'RACE LOBBY', headingStyle(this.layout.type.hero))
      .setLetterSpacing(-1)
    const water = this.add.text(
      0,
      0,
      getLevel(this.levelId).name.toUpperCase(),
      headingStyle(this.layout.type.heading, TEXT_COLORS.yellow),
    ).setOrigin(1, 0.5).setLetterSpacing(1.5)
    this.onLayout((layout) => {
      title.setPosition(layout.title.x, layout.title.y).setFontSize(layout.type.hero)
      water
        .setPosition(layout.width - layout.gutter, layout.title.y + layout.type.hero * 0.52)
        .setFontSize(layout.type.heading)
    })
  }

  private createSetupView(): void {
    const nameLabel = this.add.text(
      0,
      0,
      'PADDLER NAME',
      headingStyle(this.layout.type.heading, TEXT_COLORS.muted),
    ).setLetterSpacing(1)
    const capacityLabel = this.add.text(
      0,
      0,
      'PRIVATE ROOM CAPACITY',
      headingStyle(this.layout.type.heading, TEXT_COLORS.muted),
    ).setLetterSpacing(1)
    const joinLabel = this.add.text(
      0,
      0,
      'JOIN WITH INVITE CODE',
      headingStyle(this.layout.type.heading, TEXT_COLORS.muted),
    ).setLetterSpacing(1)
    this.setupObjects.push(nameLabel, capacityLabel, joinLabel)

    this.nameInput = this.createInput('Paddler name', 18, 'text')
    this.nameInput.value = getPlayerName()
    this.codeInput = this.createInput('6-letter code', 6, 'text')
    this.codeInput.addEventListener('input', () => {
      if (this.codeInput) this.codeInput.value = normalizeRoomCode(this.codeInput.value)
    })

    for (const capacity of ROOM_CAPACITY_OPTIONS) {
      const button = this.createButton(
        `${capacity}`,
        () => {
          this.selectedCapacity = capacity
          this.renderCapacity()
        },
        this.setupObjects,
      )
      this.capacityButtons.push({ ...button, capacity })
    }

    this.createButton('QUICK MATCH', () => void this.quickMatch(), this.setupObjects, true)
    this.createButton('CREATE PRIVATE ROOM', () => void this.createRoom(), this.setupObjects)
    this.createButton('JOIN ROOM', () => void this.joinRoom(), this.setupObjects)
    this.createButton('BACK TO PUT-IN', () => this.scene.start('menu', { levelId: this.levelId }), this.setupObjects)

    this.statusText = this.add.text(
      0,
      0,
      '',
      bodyStyle(this.layout.type.body, TEXT_COLORS.warning),
    ).setAlign('center').setOrigin(0.5, 1)

    this.onLayout((layout) => {
      nameLabel
        .setPosition(layout.nameInput.x, layout.nameInput.y - layout.type.heading * 1.15)
        .setFontSize(layout.type.heading)
      capacityLabel
        .setPosition(
          layout.capacityButtons[0].x,
          layout.capacityButtons[0].y - layout.type.heading * 1.15,
        )
        .setFontSize(layout.type.heading)
      joinLabel
        .setPosition(layout.codeInput.x, layout.codeInput.y - layout.type.heading * 1.15)
        .setFontSize(layout.type.heading)
      this.placeInput(this.nameInput, layout.nameInput, layout.type.body)
      this.placeButton(
        this.buttonAt(this.setupObjects, 'QUICK MATCH'),
        layout.quickMatchButton,
        layout.type.heading,
      )
      this.placeInput(this.codeInput, layout.codeInput, layout.type.body)
      this.capacityButtons.forEach((button, index) => {
        this.placeButton(button, layout.capacityButtons[index], layout.type.heading)
      })
      this.placeButton(
        this.buttonAt(this.setupObjects, 'CREATE PRIVATE ROOM'),
        layout.createButton,
        layout.type.heading,
      )
      this.placeButton(this.buttonAt(this.setupObjects, 'JOIN ROOM'), layout.joinButton, layout.type.heading)
      this.placeButton(this.buttonAt(this.setupObjects, 'BACK TO PUT-IN'), layout.backButton, layout.type.heading)
      this.statusText
        .setFontSize(layout.type.body)
        .setWordWrapWidth(layout.content.width * 0.9)
        .setPosition(layout.content.x + layout.content.width / 2, layout.content.y + layout.content.height)
    })
  }

  private createRoomView(): void {
    this.roomHeading = this.add.text(
      0,
      0,
      '',
      headingStyle(this.layout.type.title, TEXT_COLORS.yellow),
    ).setLetterSpacing(2)
    this.roomSubheading = this.add.text(
      0,
      0,
      '',
      bodyStyle(this.layout.type.body, TEXT_COLORS.muted),
    )
    this.membersText = this.add.text(
      0,
      0,
      '',
      bodyStyle(this.layout.type.body, TEXT_COLORS.cream),
    )
    this.roomObjects.push(this.roomHeading, this.roomSubheading, this.membersText)

    this.readyButton = this.createButton(
      'READY',
      () => void this.toggleReady(),
      this.roomObjects,
      true,
    )
    this.startButton = this.createButton(
      'START RACE',
      () => void this.startRace(),
      this.roomObjects,
    )
    this.copyButton = this.createButton(
      'COPY INVITE',
      () => void this.copyInvite(),
      this.roomObjects,
    )
    this.leaveButton = this.createButton(
      'LEAVE ROOM',
      () => void this.leaveRoom(),
      this.roomObjects,
    )

    this.onLayout((layout) => {
      this.roomHeading
        .setPosition(layout.content.x + layout.gutter, layout.content.y + layout.gutter * 0.7)
        .setFontSize(layout.type.title)
      this.roomSubheading
        .setPosition(
          layout.content.x + layout.gutter,
          layout.content.y + layout.gutter * 0.7 + layout.type.title * 1.15,
        )
        .setFontSize(layout.type.body)
      this.membersText
        .setPosition(layout.members.x + layout.gutter, layout.members.y)
        .setFontSize(layout.type.body)
        .setWordWrapWidth(layout.members.width - layout.gutter * 2)
      this.placeButton(this.readyButton, layout.roomButtons[0], layout.type.heading)
      this.placeButton(this.startButton, layout.roomButtons[1], layout.type.heading)
      this.placeButton(this.copyButton, layout.roomButtons[2], layout.type.heading)
      this.placeButton(
        this.leaveButton,
        this.connection?.room.matchmaking ? layout.queueLeaveButton : layout.roomButtons[3],
        layout.type.heading,
      )
    })
  }

  private createInput(
    placeholder: string,
    maxLength: number,
    inputMode: 'text',
  ): HTMLInputElement {
    const input = document.createElement('input')
    input.className = 'lobby-input'
    input.placeholder = placeholder
    input.maxLength = maxLength
    input.inputMode = inputMode
    input.autocomplete = 'off'
    input.spellcheck = false
    input.style.position = 'absolute'
    input.style.zIndex = '10'
    input.style.border = `2px solid ${colorHex(COLORS.waterLight)}`
    input.style.borderRadius = '6px'
    input.style.background = colorHex(COLORS.ink)
    input.style.color = TEXT_COLORS.cream
    input.style.fontFamily = FONT_BODY
    input.style.outline = 'none'
    input.style.setProperty('--lobby-placeholder', TEXT_COLORS.mutedDark)
    input.style.setProperty('--lobby-focus', TEXT_COLORS.yellow)
    this.game.canvas.parentElement?.append(input)
    return input
  }

  private createButton(
    label: string,
    activate: () => void,
    collection: LobbyViewObject[],
    primary = false,
  ): LobbyButton {
    const fill = primary ? COLORS.yellow : COLORS.control
    const color = primary ? TEXT_COLORS.ink : TEXT_COLORS.cream
    const background = this.add.rectangle(0, 0, 10, 10, fill, 1).setOrigin(0)
      .setName(`button:${label}`).setInteractive({ useHandCursor: true })
    const text = this.add.text(0, 0, label, headingStyle(this.layout.type.heading, color))
      .setName(`label:${label}`).setOrigin(0.5).setInteractive({ useHandCursor: true })
    background.on('pointerdown', activate)
    text.on('pointerdown', activate)
    background.on('pointerover', () => background.setAlpha(0.82))
    background.on('pointerout', () => background.setAlpha(1))
    collection.push(background, text)
    return { background, label: text }
  }

  private buttonAt(collection: LobbyViewObject[], label: string): LobbyButton {
    const background = collection.find((object) => object.name === `button:${label}`)
    const text = collection.find((object) => object.name === `label:${label}`)
    if (!(background instanceof Phaser.GameObjects.Rectangle) || !(text instanceof Phaser.GameObjects.Text)) {
      throw new Error(`Lobby button ${label} was not created`)
    }
    return { background, label: text }
  }

  private placeInput(input: HTMLInputElement | undefined, rect: Rect, fontSize: number): void {
    if (!input) return
    input.style.left = `${rect.x}px`
    input.style.top = `${rect.y}px`
    input.style.width = `${rect.width}px`
    input.style.height = `${rect.height}px`
    input.style.fontSize = `${fontSize}px`
    input.style.padding = `0 ${Math.round(rect.height * 0.22)}px`
  }

  private placeButton(button: LobbyButton, rect: Rect, fontSize: number): void {
    button.background
      .setPosition(rect.x, rect.y)
      .setSize(rect.width, rect.height)
      .setDisplaySize(rect.width, rect.height)
      .setInteractive({ useHandCursor: true })
    button.label
      .setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2)
      .setFontSize(fontSize)
  }

  private renderCapacity(): void {
    for (const button of this.capacityButtons) {
      const selected = button.capacity === this.selectedCapacity
      button.background.setFillStyle(selected ? COLORS.yellow : COLORS.control, 1)
      button.label.setColor(selected ? TEXT_COLORS.ink : TEXT_COLORS.cream)
    }
  }

  private renderView(): void {
    for (const object of this.setupObjects) object.setVisible(!this.inRoom)
    for (const object of this.roomObjects) object.setVisible(this.inRoom)
    this.statusText.setVisible(!this.inRoom)
    if (this.nameInput) this.nameInput.style.display = this.inRoom ? 'none' : 'block'
    if (this.codeInput) this.codeInput.style.display = this.inRoom ? 'none' : 'block'
    const privateControlsVisible = this.inRoom && !this.connection?.room.matchmaking
    for (const button of [this.readyButton, this.startButton, this.copyButton]) {
      button.background.setVisible(privateControlsVisible)
      button.label.setVisible(privateControlsVisible)
    }
    this.placeButton(
      this.leaveButton,
      this.connection?.room.matchmaking
        ? this.layout.queueLeaveButton
        : this.layout.roomButtons[3],
      this.layout.type.heading,
    )
  }

  private renderLobby(snapshot: LobbySnapshot): void {
    const connected = snapshot.members.filter((member) => member.connected)
    if (snapshot.room.matchmaking) {
      this.roomHeading.setText('QUICK MATCH')
      this.roomSubheading.setText(
        `${connected.length} IN QUEUE  /  AUTO-STARTS AT 2`,
      )
    } else {
      this.roomHeading.setText(`ROOM ${snapshot.room.code}`)
      this.roomSubheading.setText(
        `${connected.length} / ${snapshot.room.maxPlayers} PADDLERS  /  ` +
        `${this.connection?.isHost ? 'YOU ARE HOST' : 'WAITING FOR HOST'}`,
      )
    }

    const lineHeight = this.layout.type.body * 1.4
    const lineLimit = Math.max(2, Math.floor(this.layout.members.height / lineHeight))
    const shown = connected.slice(0, lineLimit)
    const lines = shown.map((member) => {
      const host = !snapshot.room.matchmaking && member.playerId === snapshot.room.hostPlayerId
        ? '  HOST'
        : ''
      const ready = snapshot.room.matchmaking
        ? 'IN QUEUE'
        : member.ready ? 'READY' : 'SETTING UP'
      return `${member.name.toUpperCase()}  /  ${ready}${host}`
    })
    if (connected.length > shown.length) lines.push(`+ ${connected.length - shown.length} MORE PADDLERS`)
    this.membersText.setText(lines.join('\n'))

    this.readyButton.label.setText(this.localReady ? 'NOT READY' : 'READY')
    this.readyButton.background.setFillStyle(this.localReady ? COLORS.success : COLORS.yellow, 1)
    this.startButton.background.setFillStyle(this.connection?.canStart ? COLORS.yellow : COLORS.ink, 1)
    this.startButton.label.setColor(this.connection?.canStart ? TEXT_COLORS.ink : TEXT_COLORS.muted)
    this.startButton.background.setAlpha(this.connection?.canStart ? 1 : 0.65)
  }

  private async createRoom(): Promise<void> {
    if (this.busy || !this.nameInput) return
    await this.runRoomAction(async () => {
      const playerName = savePlayerName(this.nameInput?.value ?? '')
      return SupabaseRoomConnection.create({
        levelId: this.levelId,
        playerName,
        maxPlayers: this.selectedCapacity,
      })
    })
  }

  private async quickMatch(): Promise<void> {
    if (this.busy || !this.nameInput) return
    await this.runRoomAction(async () => {
      const playerName = savePlayerName(this.nameInput?.value ?? '')
      return SupabaseRoomConnection.quickMatch({
        levelId: this.levelId,
        playerName,
      })
    })
  }

  private async joinRoom(): Promise<void> {
    if (this.busy || !this.nameInput || !this.codeInput) return
    const code = normalizeRoomCode(this.codeInput.value)
    this.codeInput.value = code
    if (!isRoomCode(code)) {
      this.statusText.setText('ENTER A VALID 6-CHARACTER INVITE CODE')
      return
    }
    await this.runRoomAction(async () => {
      const playerName = savePlayerName(this.nameInput?.value ?? '')
      return SupabaseRoomConnection.join({ code, playerName })
    })
  }

  private async runRoomAction(
    action: () => Promise<SupabaseRoomConnection>,
  ): Promise<void> {
    this.busy = true
    this.statusText.setText('CONNECTING TO THE RIVER...')
    try {
      const connection = await action()
      this.connection = connection
      this.inRoom = true
      this.statusText.setText('')
      this.stopLobbyListener = connection.onLobbyChange((snapshot) => this.renderLobby(snapshot))
      this.stopStartListener = connection.onStart(() => this.enterRace())
      const roomUrl = new URL(window.location.href)
      if (connection.room.matchmaking) roomUrl.searchParams.delete('room')
      else roomUrl.searchParams.set('room', connection.room.code)
      window.history.replaceState({}, '', roomUrl)
      this.renderView()
    } catch (error) {
      this.showStatus(messageFrom(error).toUpperCase())
    } finally {
      this.busy = false
    }
  }

  private async toggleReady(): Promise<void> {
    if (!this.connection || this.busy) return
    this.busy = true
    try {
      this.localReady = !this.localReady
      await this.connection.setReady(this.localReady)
    } catch (error) {
      this.localReady = !this.localReady
      this.showStatus(messageFrom(error).toUpperCase())
    } finally {
      this.busy = false
    }
  }

  private async startRace(): Promise<void> {
    if (!this.connection || this.busy || !this.connection.canStart) return
    this.busy = true
    try {
      await this.connection.startRace()
    } catch (error) {
      this.showStatus(messageFrom(error).toUpperCase())
      this.busy = false
    }
  }

  private enterRace(): void {
    const connection = this.connection
    if (!connection || this.transferringConnection) return
    this.transferringConnection = true
    this.stopLobbyListener?.()
    this.stopStartListener?.()
    this.stopLobbyListener = undefined
    this.stopStartListener = undefined
    this.connection = undefined
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    window.history.replaceState({}, '', url)
    this.scene.start('river', {
      levelId: connection.room.levelId,
      mode: 'multiplayer',
      hostedSession: connection,
    })
  }

  private async copyInvite(): Promise<void> {
    if (!this.connection) return
    const invite = new URL(window.location.href)
    invite.searchParams.set('room', this.connection.room.code)
    try {
      await navigator.clipboard.writeText(invite.toString())
      this.roomSubheading.setText(`INVITE COPIED  /  ${this.connection.room.code}`)
    } catch {
      this.roomSubheading.setText(`SHARE CODE ${this.connection.room.code}`)
    }
  }

  private showStatus(message: string): void {
    if (this.inRoom) {
      this.roomSubheading.setText(message)
    } else {
      this.statusText.setText(message)
    }
  }

  private async leaveRoom(): Promise<void> {
    if (this.busy) return
    this.busy = true
    const connection = this.connection
    this.connection = undefined
    try {
      await connection?.leave()
    } finally {
      const url = new URL(window.location.href)
      url.searchParams.delete('room')
      window.history.replaceState({}, '', url)
      this.scene.start('menu', { levelId: this.levelId })
    }
  }

  private cleanUp(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.stopLobbyListener?.()
    this.stopStartListener?.()
    this.nameInput?.remove()
    this.codeInput?.remove()
    this.nameInput = undefined
    this.codeInput = undefined
    if (!this.transferringConnection) this.connection?.destroy()
    this.connection = undefined
    this.layoutAppliers = []
  }
}
