import { describe, expect, it } from 'vitest'
import type { FontFaceSetLike } from './fontLoading'
import { FONT_LOAD_TIMEOUT_MS, REQUIRED_FONTS, waitForFonts } from './fontLoading'
import { FONT_BODY, FONT_HEADING } from './theme'

/** Stands in for `document.fonts`, which the node-environment suite has no access to. */
const fontSet = (
  behaviour: {
    load?: (font: string) => Promise<unknown>
    ready?: Promise<unknown>
  } = {},
): FontFaceSetLike & { requested: string[] } => {
  const requested: string[] = []

  return {
    requested,
    load(font: string) {
      requested.push(font)
      return behaviour.load ? behaviour.load(font) : Promise.resolve([])
    },
    ready: behaviour.ready ?? Promise.resolve(undefined),
  }
}

/** A timer that never fires, so the load path decides the race unaided. */
const neverFires = (): undefined => undefined

/** A timer that fires on the next microtask drain, so the timeout wins any pending load. */
const firesImmediately = (callback: () => void): undefined => {
  callback()
  return undefined
}

const pending = (): Promise<never> => new Promise(() => {})

describe('waitForFonts', () => {
  it('reports loaded once every required face resolves', async () => {
    const fonts = fontSet()

    await expect(waitForFonts(fonts, { schedule: neverFires })).resolves.toBe('loaded')
  })

  it('asks for every required face', async () => {
    const fonts = fontSet()

    await waitForFonts(fonts, { schedule: neverFires })

    expect(fonts.requested).toEqual([...REQUIRED_FONTS])
  })

  it('reports unavailable when there is no FontFaceSet to ask', async () => {
    await expect(waitForFonts(undefined)).resolves.toBe('unavailable')
  })

  it('reports timed-out rather than hanging when a face never resolves', async () => {
    const fonts = fontSet({ load: pending })

    await expect(waitForFonts(fonts, { schedule: firesImmediately })).resolves.toBe('timed-out')
  })

  it('reports timed-out when the faces load but ready never settles', async () => {
    const fonts = fontSet({ ready: pending() })

    await expect(waitForFonts(fonts, { schedule: firesImmediately })).resolves.toBe('timed-out')
  })

  it('resolves rather than rejecting when a face fails to load', async () => {
    const fonts = fontSet({ load: () => Promise.reject(new Error('network')) })

    // A font that 404s must still boot the game in the fallback, not strand the
    // player on a blank canvas.
    await expect(waitForFonts(fonts, { schedule: neverFires })).resolves.toBe('unavailable')
  })

  it('resolves rather than rejecting when ready rejects', async () => {
    const fonts = fontSet({ ready: Promise.reject(new Error('broken')) })

    await expect(waitForFonts(fonts, { schedule: neverFires })).resolves.toBe('unavailable')
  })

  it('schedules the fallback at the documented timeout by default', async () => {
    const fonts = fontSet({ load: pending })
    const delays: number[] = []

    await waitForFonts(fonts, {
      schedule: (callback, delayMs) => {
        delays.push(delayMs)
        callback()
        return undefined
      },
    })

    expect(delays).toEqual([FONT_LOAD_TIMEOUT_MS])
  })

  it('honours an explicit timeout over the default', async () => {
    const fonts = fontSet({ load: pending })
    const delays: number[] = []

    await waitForFonts(fonts, {
      timeoutMs: 40,
      schedule: (callback, delayMs) => {
        delays.push(delayMs)
        callback()
        return undefined
      },
    })

    expect(delays).toEqual([40])
  })
})

describe('REQUIRED_FONTS', () => {
  it('covers every family the theme resolves text through', () => {
    // If a family is added to theme.ts but not here, the boot gate stops
    // guarding it and that family silently regresses to the fallback.
    const primaryFamily = (stack: string): string =>
      stack.split(',')[0].trim().replace(/^"|"$/g, '')

    for (const stack of [FONT_HEADING, FONT_BODY]) {
      const family = primaryFamily(stack)
      const covered = REQUIRED_FONTS.some((font) => font.includes(family))

      expect(covered, `no required face for ${family}`).toBe(true)
    }
  })

  it('covers each weight the heading and body styles ask for', () => {
    for (const weight of ['600', '700', '800']) {
      expect(REQUIRED_FONTS.some((font) => font.startsWith(`${weight} `))).toBe(true)
    }

    expect(REQUIRED_FONTS.some((font) => font.startsWith('400 '))).toBe(true)
  })
})
