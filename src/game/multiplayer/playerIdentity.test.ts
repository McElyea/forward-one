import { describe, expect, it } from 'vitest'
import { type NameStorage, readStoredName, writeStoredName } from './playerIdentity'

/** Storage that works. */
const workingStorage = (seed: Record<string, string> = {}): NameStorage & { seen: Record<string, string> } => {
  const seen = { ...seed }
  return {
    seen,
    getItem: (key: string) => seen[key] ?? null,
    setItem: (key: string, value: string) => {
      seen[key] = value
    },
  }
}

/** Storage that a browser hands over and then refuses to use, as private modes do. */
const refusingStorage = (): NameStorage => ({
  getItem: () => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  },
  setItem: () => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
  },
})

describe('readStoredName', () => {
  it('returns the stored name', () => {
    expect(readStoredName(workingStorage({ 'forward-one-player-name': 'River Rat' })))
      .toBe('River Rat')
  })

  it('reports nothing stored rather than an empty name', () => {
    expect(readStoredName(workingStorage())).toBeNull()
    expect(readStoredName(workingStorage({ 'forward-one-player-name': '   ' }))).toBeNull()
  })

  it('survives storage that throws on read', () => {
    // The lobby calls this from create(); a throw here left the screen half-drawn.
    expect(() => readStoredName(refusingStorage())).not.toThrow()
    expect(readStoredName(refusingStorage())).toBeNull()
  })

  it('survives storage the browser would not hand over at all', () => {
    expect(readStoredName(null)).toBeNull()
  })
})

describe('writeStoredName', () => {
  it('persists the name under the key the game reads back', () => {
    const storage = workingStorage()
    writeStoredName(storage, 'River Rat')

    expect(storage.seen['forward-one-player-name']).toBe('River Rat')
    expect(readStoredName(storage)).toBe('River Rat')
  })

  it('survives storage that throws on write', () => {
    expect(() => writeStoredName(refusingStorage(), 'River Rat')).not.toThrow()
  })

  it('survives storage the browser would not hand over at all', () => {
    expect(() => writeStoredName(null, 'River Rat')).not.toThrow()
  })
})
