import Phaser from 'phaser'
import { MenuScene } from './scenes/MenuScene'
import { RiverScene } from './scenes/RiverScene'

export function startGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1280,
    height: 720,
    backgroundColor: '#071f26',
    scene: [MenuScene, RiverScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      pixelArt: false,
    },
  })
}
