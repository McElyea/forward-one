import './style.css'
import { startGame } from './game/startGame'
import { waitForFonts } from './game/ui/fontLoading'
import { visitEvent } from './game/usage/usageEvents'
import { installErrorReporting, markVisited, sendUsageEvent } from './game/usage/usageTransport'

const host = document.querySelector<HTMLDivElement>('#app')

if (!host) {
  throw new Error('Missing #app game mount')
}

// Before anything that can fail, so that a failure is reported and not only
// logged. A page that has opted out (Do Not Track, GPC, a dev server) installs
// nothing here and sends nothing below.
installErrorReporting()

// Phaser bakes each Text object into a texture at create() time and never
// restyles it, so booting before Barlow Condensed and Inter are usable leaves
// the menu in Impact and Arial for the rest of the session. waitForFonts never
// rejects and always settles, so a font that fails or stalls costs a short
// delay and the fallback — never a blank canvas.
void waitForFonts(document.fonts).then((fonts) => {
  startGame(host)
  // After the game is up, so a boot failure is one error event rather than a
  // visit that never went anywhere. The size is the viewport's, not the
  // canvas's: this is what device the player is holding, not how the scene
  // was laid out.
  sendUsageEvent(
    visitEvent({
      touch: navigator.maxTouchPoints > 0,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      referrer: document.referrer,
      ownHost: window.location.host,
      returning: markVisited(),
      fonts,
    }),
  )
})
