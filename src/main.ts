import './style.css'
import { startGame } from './game/startGame'
import { waitForFonts } from './game/ui/fontLoading'

const host = document.querySelector<HTMLDivElement>('#app')

if (!host) {
  throw new Error('Missing #app game mount')
}

// Phaser bakes each Text object into a texture at create() time and never
// restyles it, so booting before Barlow Condensed and Inter are usable leaves
// the menu in Impact and Arial for the rest of the session. waitForFonts never
// rejects and always settles, so a font that fails or stalls costs a short
// delay and the fallback — never a blank canvas.
void waitForFonts(document.fonts).then(() => {
  startGame(host)
})
