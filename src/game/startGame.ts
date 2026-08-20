import Phaser from 'phaser'
import { LobbyScene } from './scenes/LobbyScene'
import { MenuScene } from './scenes/MenuScene'
import { RiverScene } from './scenes/RiverScene'

export function startGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#071f26',
    scene: [MenuScene, LobbyScene, RiverScene],
    scale: {
      // RESIZE rather than FIT: the canvas matches the viewport, so one game
      // unit is one CSS pixel and the sizes in ui/layout.ts are the sizes the
      // player actually sees and touches. Under the old fixed 1280x720 canvas
      // a phone scaled everything down by ~0.3, putting body text at 4px.
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: '100%',
      height: '100%',
    },
    render: {
      antialias: true,
      pixelArt: false,
    },
  })
}
