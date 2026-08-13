import { describe, expect, it } from 'vitest'
import { LEVELS } from '../levels'
import { LevelSelection } from './levelSelection'

/** Stands in for the Phaser Rectangle the scene registers; the view type is opaque here. */
const view = (label: string): string => label

const registerEveryLevel = (
  selection: LevelSelection<string>,
  visit: string,
): void => {
  for (const level of LEVELS) {
    selection.register(level, view(`${visit}-${level.id}`))
  }
}

describe('LevelSelection', () => {
  it('starts on the first level', () => {
    const selection = new LevelSelection(LEVELS)

    expect(selection.selected).toBe(LEVELS[0])
    expect(selection.size).toBe(0)
  })

  it('rejects an empty level list with an actionable message', () => {
    expect(() => new LevelSelection([])).toThrowError(/empty level list/)
  })

  it('discards the previous visit\'s cards on reset', () => {
    const selection = new LevelSelection<string>(LEVELS)

    registerEveryLevel(selection, 'first')
    expect(selection.size).toBe(LEVELS.length)

    selection.reset()
    registerEveryLevel(selection, 'second')

    // Without the reset this would be LEVELS.length * 2 — the accumulation
    // that made the put-in screen throw on a second visit.
    expect(selection.size).toBe(LEVELS.length)
    expect(selection.entries().map((entry) => entry.view)).toEqual(
      LEVELS.map((level) => `second-${level.id}`),
    )
  })

  it('resets the selection back to the first level', () => {
    const selection = new LevelSelection<string>(LEVELS)

    selection.select(LEVELS[2])
    expect(selection.selected).toBe(LEVELS[2])

    selection.reset()

    expect(selection.selected).toBe(LEVELS[0])
  })

  it('pairs every card with its own level rather than correlating by position', () => {
    const selection = new LevelSelection<string>(LEVELS)

    // Deliberately skip the reset, the way the unfixed scene did, and register
    // a second visit's worth of cards on top of the first.
    registerEveryLevel(selection, 'first')
    registerEveryLevel(selection, 'second')

    const entries = selection.entries()

    expect(entries).toHaveLength(LEVELS.length * 2)
    // The unfixed scene read LEVELS[index] here, which was undefined for every
    // index past the third and threw on `.id`. Each card carries its own level,
    // so there is no index to run off the end of.
    for (const entry of entries) {
      expect(LEVELS).toContain(entry.level)
    }
  })

  it('marks exactly the selected level, once per registered card', () => {
    const selection = new LevelSelection<string>(LEVELS)
    registerEveryLevel(selection, 'first')

    selection.select(LEVELS[3])
    const entries = selection.entries()

    expect(entries.filter((entry) => entry.selected).map((entry) => entry.level)).toEqual([
      LEVELS[3],
    ])
  })
})
