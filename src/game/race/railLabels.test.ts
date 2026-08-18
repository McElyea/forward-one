import { describe, expect, it } from 'vitest'
import { spreadRailLabels } from './railLabels'

const RAIL = { minGap: 40, min: 0, max: 300, ascending: true }

describe('spreadRailLabels', () => {
  it('leaves labels that already fit where they are', () => {
    expect(spreadRailLabels([10, 100, 200], RAIL)).toEqual([10, 100, 200])
  })

  it('pushes a stack apart by the minimum gap', () => {
    expect(spreadRailLabels([50, 50, 50, 50], RAIL)).toEqual([50, 90, 130, 170])
  })

  it('keeps every label on the rail when the stack starts near the end', () => {
    const placed = spreadRailLabels([290, 290, 290], RAIL)

    for (const position of placed) {
      expect(position, `label placed off the rail at ${position}`).toBeLessThanOrEqual(RAIL.max)
      expect(position).toBeGreaterThanOrEqual(RAIL.min)
    }
    expect(placed).toEqual([220, 260, 300])
  })

  it('compresses evenly rather than overflowing when the rail is too short', () => {
    const placed = spreadRailLabels([0, 0, 0, 0], { ...RAIL, max: 60 })

    expect(placed).toEqual([0, 20, 40, 60])
  })

  it('keeps the order it was given', () => {
    const placed = spreadRailLabels([200, 150, 40, 30], RAIL)

    for (let index = 1; index < placed.length; index += 1) {
      expect(
        placed[index],
        'a label overtook the one in front of it',
      ).toBeGreaterThanOrEqual(placed[index - 1])
    }
  })

  it('runs the other way when the axis descends', () => {
    const placed = spreadRailLabels([250, 250, 250], { ...RAIL, ascending: false })

    expect(placed).toEqual([250, 210, 170])
  })

  it('slides a descending stack up the rail rather than off the near end', () => {
    // Four labels need 120 of rail below 50, and there are only 50 — so the
    // whole stack moves up instead of the last one falling off.
    const placed = spreadRailLabels([50, 50, 50, 50], { ...RAIL, ascending: false })

    expect(placed).toEqual([120, 80, 40, 0])
    for (const position of placed) {
      expect(position).toBeGreaterThanOrEqual(RAIL.min)
      expect(position).toBeLessThanOrEqual(RAIL.max)
    }
  })

  it('places a lone label where it was asked for', () => {
    expect(spreadRailLabels([120], RAIL)).toEqual([120])
    expect(spreadRailLabels([], RAIL)).toEqual([])
  })
})
