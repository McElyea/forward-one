import { sanitizePlayerName } from './roomPolicy'

const PLAYER_NAME_KEY = 'forward-one-player-name'

const generatedName = (): string =>
  `PADDLER ${crypto.getRandomValues(new Uint16Array(1))[0].toString().padStart(4, '0').slice(-4)}`

export function getPlayerName(): string {
  const stored = sanitizePlayerName(window.localStorage.getItem(PLAYER_NAME_KEY) ?? '')
  if (stored) return stored
  const created = generatedName()
  window.localStorage.setItem(PLAYER_NAME_KEY, created)
  return created
}

export function savePlayerName(value: string): string {
  const name = sanitizePlayerName(value)
  if (!name) throw new Error('Enter a paddler name')
  window.localStorage.setItem(PLAYER_NAME_KEY, name)
  return name
}
