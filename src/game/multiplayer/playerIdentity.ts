import { sanitizePlayerName } from './roomPolicy'

const PLAYER_NAME_KEY = 'forward-one-player-name'

const generatedName = (): string =>
  `PADDLER ${crypto.getRandomValues(new Uint16Array(1))[0].toString().padStart(4, '0').slice(-4)}`

/** A usable stored name, or null where storage holds nothing or refuses to be read. */
function readStoredName(): string | null {
  try {
    return sanitizePlayerName(window.localStorage.getItem(PLAYER_NAME_KEY) ?? '') || null
  } catch {
    return null
  }
}

/** Persist a name, or accept that it will not outlive the session. */
function writeStoredName(name: string): void {
  try {
    window.localStorage.setItem(PLAYER_NAME_KEY, name)
  } catch {
    // Storage may be unavailable. The name still stands for this session.
  }
}

export function getPlayerName(): string {
  const stored = readStoredName()
  if (stored) return stored
  const created = generatedName()
  writeStoredName(created)
  return created
}

export function savePlayerName(value: string): string {
  const name = sanitizePlayerName(value)
  if (!name) throw new Error('Enter a paddler name')
  writeStoredName(name)
  return name
}
