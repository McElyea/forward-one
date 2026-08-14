/**
 * Phaser draws every Text object into a canvas texture once, when the scene
 * creates it, and only redraws when the text or style changes. MenuScene never
 * changes either, so whatever font is resolved at create() time is the font the
 * put-in screen keeps until the scene restarts. Booting before the faces are
 * ready is therefore not a brief flash of the fallback — it is permanent.
 *
 * This module is the pure half of the fix: it says when the faces are usable,
 * and it never rejects, so a missing or broken font degrades to the old
 * behaviour (render in the fallback) instead of leaving the player on a blank
 * canvas.
 */

/** Every family/weight combination `theme.ts` can ask for. */
export const REQUIRED_FONTS = [
  '600 16px "Barlow Condensed"',
  '700 16px "Barlow Condensed"',
  '800 16px "Barlow Condensed"',
  '400 16px Inter',
  '600 16px Inter',
  '700 16px Inter',
] as const

/**
 * Long enough for a same-origin woff2 to land on a slow connection, short
 * enough that a player never watches a blank canvas wondering if it hung.
 */
export const FONT_LOAD_TIMEOUT_MS = 2500

export type FontReadyOutcome =
  /** Every required face resolved; text will rasterize in the real font. */
  | 'loaded'
  /** The faces did not arrive in time. Boot anyway, in the fallback. */
  | 'timed-out'
  /** No FontFaceSet to ask, or it threw. Boot anyway, in the fallback. */
  | 'unavailable'

/**
 * The slice of `document.fonts` this module uses. Declared structurally so the
 * node-environment test suite can drive it without a DOM.
 */
export interface FontFaceSetLike {
  load(font: string): Promise<unknown>
  ready: Promise<unknown>
}

export interface WaitForFontsOptions {
  timeoutMs?: number
  /** Injectable for tests; defaults to the ambient `setTimeout`. */
  schedule?: (callback: () => void, delayMs: number) => unknown
}

/**
 * Resolve once the required faces are usable, the timeout elapses, or the
 * FontFaceSet API is unavailable — whichever comes first. Never rejects.
 */
export function waitForFonts(
  fonts: FontFaceSetLike | undefined,
  options: WaitForFontsOptions = {},
): Promise<FontReadyOutcome> {
  if (!fonts) {
    return Promise.resolve('unavailable')
  }

  const { timeoutMs = FONT_LOAD_TIMEOUT_MS, schedule = setTimeout } = options

  const loaded = (async (): Promise<FontReadyOutcome> => {
    // load() resolves per face; ready() covers any face the stylesheet started
    // on its own. Both, because either alone leaves a gap.
    await Promise.all(REQUIRED_FONTS.map((font) => fonts.load(font)))
    await fonts.ready
    return 'loaded'
  })().catch((): FontReadyOutcome => 'unavailable')

  const timedOut = new Promise<FontReadyOutcome>((resolve) => {
    schedule(() => resolve('timed-out'), timeoutMs)
  })

  return Promise.race([loaded, timedOut])
}
