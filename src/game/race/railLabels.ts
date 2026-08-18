/**
 * Spreading racer names along the progress rail.
 *
 * Every racer starts at progress 0, so their names all want the same point on
 * the rail. Pushing each one further from the leader fixes the stack but has
 * to stop somewhere: unbounded, the fourth name in a four-boat race walks off
 * the end of a phone's rail and is never drawn.
 */

/** Where the labels may sit, and how far apart they have to stay. */
export interface RailLabelBounds {
  minGap: number
  min: number
  max: number
  /** True when later entries run toward `max`, false when they run toward `min`. */
  ascending: boolean
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

function spreadAscending(desired: number[], minGap: number, min: number, max: number): number[] {
  const span = max - min
  const needed = (desired.length - 1) * minGap

  // More labels than rail. Everyone gets an equal share rather than the last
  // few getting nothing.
  if (needed > span) {
    const step = desired.length > 1 ? span / (desired.length - 1) : 0
    return desired.map((_, index) => min + step * index)
  }

  const placed: number[] = []
  for (const [index, wanted] of desired.entries()) {
    const floor = index === 0 ? min : placed[index - 1] + minGap
    // Leave the labels after this one room to keep their own gaps.
    const ceiling = max - (desired.length - 1 - index) * minGap
    placed.push(clamp(Math.max(wanted, floor), floor, Math.max(floor, ceiling)))
  }
  return placed
}

/**
 * Nudge labels apart in the order given, without letting any of them leave the
 * rail. Order is preserved, so a racer ahead never renders behind one behind
 * them, and the caller's own positions are kept wherever they already fit.
 */
export function spreadRailLabels(desired: number[], bounds: RailLabelBounds): number[] {
  const { minGap, min, max, ascending } = bounds
  if (desired.length === 0) return []
  if (ascending) return spreadAscending(desired, minGap, min, max)

  // Descending is the same problem read backwards.
  // Subtracting from zero rather than negating, so a label at the origin comes
  // back as 0 and not -0.
  const mirrored = spreadAscending(
    desired.map((value) => 0 - value),
    minGap,
    0 - max,
    0 - min,
  )
  return mirrored.map((value) => 0 - value)
}
