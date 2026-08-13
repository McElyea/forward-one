import type { LevelConfig } from '../types'

/** A level paired with whatever the scene drew to represent it. */
export interface LevelCard<TView> {
  level: LevelConfig
  view: TView
}

export interface LevelCardState<TView> extends LevelCard<TView> {
  selected: boolean
}

/**
 * Per-visit level-card bookkeeping for the put-in menu.
 *
 * Phaser constructs each scene once and reuses that instance for every
 * `scene.start()`, so a scene rebuilds its display objects on each `create()`
 * and has to discard the previous visit's first. Two related mistakes are easy
 * to make there, and both live here so they can be tested without a canvas:
 *
 * 1. Forgetting to clear last visit's cards, so they accumulate every visit.
 * 2. Correlating cards to levels by array position, which stops being true the
 *    moment (1) happens.
 *
 * Each card therefore carries its own `level`, and `reset()` is the single
 * place a visit's state is cleared.
 */
export class LevelSelection<TView> {
  private cards: LevelCard<TView>[] = []
  // Declared explicitly rather than as a constructor parameter property:
  // `erasableSyntaxOnly` in tsconfig.json rejects that syntax, because it is
  // the one class feature that emits runtime code rather than being erased.
  private readonly levels: readonly LevelConfig[]
  private selectedLevel: LevelConfig

  constructor(levels: readonly LevelConfig[]) {
    if (levels.length === 0) {
      throw new Error(
        'LevelSelection was constructed with an empty level list. Pass the LEVELS array from src/game/levels.ts.',
      )
    }
    this.levels = levels
    this.selectedLevel = levels[0]
  }

  /** Discard the previous visit's cards. Call this from the scene's `init()`. */
  reset(): void {
    this.cards = []
    this.selectedLevel = this.levels[0]
  }

  register(level: LevelConfig, view: TView): void {
    this.cards.push({ level, view })
  }

  select(level: LevelConfig): void {
    this.selectedLevel = level
  }

  get selected(): LevelConfig {
    return this.selectedLevel
  }

  get size(): number {
    return this.cards.length
  }

  /** Every registered card, each with its own level and selection state. */
  entries(): LevelCardState<TView>[] {
    return this.cards.map((card) => ({
      ...card,
      selected: card.level.id === this.selectedLevel.id,
    }))
  }
}
