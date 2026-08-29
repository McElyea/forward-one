import { sanitizePlayerName } from './roomPolicy'

const PLAYER_NAME_KEY = 'forward-one-player-name'

const generatedName = (): string =>
  `PADDLER ${crypto.getRandomValues(new Uint16Array(1))[0].toString().padStart(4, '0').slice(-4)}`

/**
 * The half of `Storage` a paddler name needs. Taken as an argument rather than
 * reached for directly so the failure paths below can be covered: the node
 * suite has no `window`, and every one of these guards exists for a browser
 * that has one and still refuses to hand over storage.
 */
export type NameStorage = Pick<Storage, 'getItem' | 'setItem'>

/** The browser's storage, or null where merely reaching for it throws. */
function browserStorage(): NameStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** A usable stored name, or null where storage holds nothing or refuses to be read. */
export function readStoredName(storage: NameStorage | null): string | null {
  if (storage === null) return null
  try {
    return sanitizePlayerName(storage.getItem(PLAYER_NAME_KEY) ?? '') || null
  } catch {
    return null
  }
}

/** Persist a name, or accept that it will not outlive the session. */
export function writeStoredName(storage: NameStorage | null, name: string): void {
  if (storage === null) return
  try {
    storage.setItem(PLAYER_NAME_KEY, name)
  } catch {
    // Storage may be unavailable. The name still stands for this session.
  }
}

export function getPlayerName(): string {
  const storage = browserStorage()
  const stored = readStoredName(storage)
  if (stored) return stored
  const created = generatedName()
  writeStoredName(storage, created)
  return created
}

export function savePlayerName(value: string): string {
  const name = sanitizePlayerName(value)
  if (!name) throw new Error('Enter a paddler name')
  writeStoredName(browserStorage(), name)
  return name
}
