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

  it('matches the selected level by id rather than by object identity', () => {
    const selection = new LevelSelection<string>(LEVELS)
    registerEveryLevel(selection, 'first')

    // A copy carrying the same id, as a level rebuilt from saved data would be.
    selection.select({ ...LEVELS[1] })

    expect(
      selection.entries().filter((entry) => entry.selected).map((entry) => entry.view),
    ).toEqual([`first-${LEVELS[1].id}`])
  })

  it('marks every card registered for the selected level', () => {
    const selection = new LevelSelection<string>(LEVELS)
    registerEveryLevel(selection, 'first')
    registerEveryLevel(selection, 'second')

    selection.select(LEVELS[2])

    expect(
      selection.entries().filter((entry) => entry.selected).map((entry) => entry.view),
    ).toEqual([`first-${LEVELS[2].id}`, `second-${LEVELS[2].id}`])
  })

  it('marks no card when the selected level has none registered', () => {
    const selection = new LevelSelection<string>(LEVELS)
    selection.register(LEVELS[0], view('only'))

    selection.select(LEVELS[1])

    expect(selection.selected).toBe(LEVELS[1])
    expect(selection.entries().map((entry) => entry.selected)).toEqual([false])
  })

  it('returns entries in registration order, not level order', () => {
    const selection = new LevelSelection<string>(LEVELS)
    selection.register(LEVELS[3], view('d'))
    selection.register(LEVELS[0], view('a'))

    expect(selection.entries().map((entry) => entry.level)).toEqual([LEVELS[3], LEVELS[0]])
  })

  it('returns fresh entries that do not write back into the selection', () => {
    const selection = new LevelSelection<string>(LEVELS)
    selection.register(LEVELS[0], view('a'))

    const [first] = selection.entries()
    first.selected = false
    first.level = LEVELS[1]

    expect(selection.entries()).toEqual([{ level: LEVELS[0], view: 'a', selected: true }])
  })

  it('resets to the first level of the list it was constructed with', () => {
    const levels = [LEVELS[2], LEVELS[0]]
    const selection = new LevelSelection<string>(levels)

    selection.select(LEVELS[0])
    selection.reset()

    expect(selection.selected).toBe(LEVELS[2])
  })
})
