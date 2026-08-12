import './style.css'
import { startGame } from './game/startGame'

const host = document.querySelector<HTMLDivElement>('#app')

if (!host) {
  throw new Error('Missing #app game mount')
}

startGame(host)
