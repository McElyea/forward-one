import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageEvent } from './usageEvents'
import { deliverUsageEvent, markVisited, type VisitStorage } from './usageTransport'

const event: UsageEvent = {
  type: 'error',
  message: 'TypeError: bad',
  source: '',
  stack: '',
  userAgent: 'Firefox',
  url: 'https://fwdone.com/',
}

/** A `fetch` that answers, keeping what it was asked to send. */
const recordingFetch = () => {
  const calls: { url: string; init: RequestInit }[] = []
  return {
    calls,
    fetch: (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return Promise.resolve()
    },
  }
}

/** A `sendBeacon` that accepts, keeping what it was asked to send. */
const recordingBeacon = () => {
  const calls: { url: string; data: Blob }[] = []
  return {
    calls,
    sendBeacon: (url: string, data: Blob) => {
      calls.push({ url, data })
      return true
    },
  }
}

describe('deliverUsageEvent', () => {
  it('posts the event as JSON to the game\'s own origin, surviving the tab closing', () => {
    const { calls, fetch } = recordingFetch()

    deliverUsageEvent(event, { fetch })

    expect(calls).toEqual([{
      url: '/api/river-log',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        keepalive: true,
      },
    }])
  })

  it('leaves the beacon alone wherever fetch exists', () => {
    // Load-bearing: content blockers drop beacons while sendBeacon() still answers true.
    const beacon = recordingBeacon()

    deliverUsageEvent(event, { fetch: recordingFetch().fetch, sendBeacon: beacon.sendBeacon })

    expect(beacon.calls).toEqual([])
  })

  it('falls back to a JSON beacon in a browser with no fetch', async () => {
    const { calls, sendBeacon } = recordingBeacon()

    deliverUsageEvent(event, { sendBeacon })

    expect(calls.map((call) => call.url)).toEqual(['/api/river-log'])
    expect(calls[0].data.type).toBe('application/json')
    expect(await calls[0].data.text()).toBe(JSON.stringify(event))
  })

  it('sends nothing, and does not throw, with neither', () => {
    expect(() => deliverUsageEvent(event, {})).not.toThrow()
  })

  it('swallows a rejected fetch', async () => {
    // The suite fails on an unhandled rejection, so the tick below is the assertion.
    deliverUsageEvent(event, { fetch: () => Promise.reject(new Error('offline')) })

    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('swallows a fetch that throws, and does not fall through to the beacon', () => {
    const beacon = recordingBeacon()
    const fetch = () => {
      throw new TypeError('bad request')
    }

    expect(() => deliverUsageEvent(event, { fetch, sendBeacon: beacon.sendBeacon })).not.toThrow()
    expect(beacon.calls).toEqual([])
  })

  it('swallows a beacon that throws', () => {
    const sendBeacon = () => {
      throw new TypeError('payload too large')
    }

    expect(() => deliverUsageEvent(event, { sendBeacon })).not.toThrow()
  })
})

/** Storage that works. */
const workingStorage = (
  seed: Record<string, string> = {},
): VisitStorage & { seen: Record<string, string> } => {
  const seen = { ...seed }
  return {
    seen,
    getItem: (key: string) => seen[key] ?? null,
    setItem: (key: string, value: string) => {
      seen[key] = value
    },
  }
}

describe('markVisited', () => {
  it('reads a first visit as new and flags the browser for next time', () => {
    const storage = workingStorage()

    expect(markVisited(storage)).toBe(false)
    expect(storage.seen).toEqual({ 'forward-one.visited': '1' })
  })

  it('reads the next visit as returning', () => {
    const storage = workingStorage()
    markVisited(storage)

    expect(markVisited(storage)).toBe(true)
  })

  it('counts any stored flag as returning and leaves it as found', () => {
    const storage = workingStorage({ 'forward-one.visited': 'old' })

    expect(markVisited(storage)).toBe(true)
    expect(storage.seen).toEqual({ 'forward-one.visited': 'old' })
  })

  it('reads as a first visit where storage refuses to be read', () => {
    const storage: VisitStorage = {
      getItem: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
      setItem: () => undefined,
    }

    expect(markVisited(storage)).toBe(false)
  })

  it('reads as a first visit where storage refuses to be written', () => {
    const storage: VisitStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      },
    }

    expect(markVisited(storage)).toBe(false)
  })

  it('reads as a first visit where the browser will not hand storage over', () => {
    expect(markVisited(null)).toBe(false)
  })

  it('reaches for the browser\'s storage by default, surviving its absence', () => {
    // The node suite has no `window`, so this is the same path as a refused one.
    expect(markVisited()).toBe(false)
  })
})

/**
 * The browser the module reads when nothing is injected: where the page is,
 * what the visitor asked for, and every listener and request it was handed.
 */
interface PageSetup {
  hostname?: string
  doNotTrack?: string | null
  globalPrivacyControl?: boolean
  dev?: boolean
  withFetch?: boolean
}

const stubBrowser = ({
  hostname = 'fwdone.com',
  doNotTrack = null,
  globalPrivacyControl,
  dev = false,
  withFetch = true,
}: PageSetup = {}) => {
  const listeners: { type: string; listener: (event: unknown) => void }[] = []
  const fetched: { url: string; init: RequestInit }[] = []
  const beacons: { url: string; data: Blob; owner: unknown }[] = []
  const location = { hostname, href: `https://${hostname}/?level=1` }
  const nav = {
    userAgent: 'Firefox',
    doNotTrack,
    globalPrivacyControl,
    sendBeacon(this: unknown, url: string, data: Blob) {
      beacons.push({ url, data, owner: this })
      return true
    },
  }

  vi.stubEnv('DEV', dev)
  vi.stubGlobal('window', {
    location,
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners.push({ type, listener })
    },
  })
  vi.stubGlobal('navigator', nav)
  vi.stubGlobal(
    'fetch',
    withFetch
      ? (url: string, init: RequestInit) => {
        fetched.push({ url, init })
        return Promise.resolve()
      }
      : undefined,
  )

  return { listeners, fetched, beacons, location, nav }
}

/** A fresh copy of the module, so its once-per-page decision never leaks between tests. */
const loadTransport = () => import('./usageTransport')

describe('sendUsageEvent', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('posts the event through the browser\'s fetch from a deployed page', async () => {
    const { fetched } = stubBrowser()
    const { sendUsageEvent } = await loadTransport()

    sendUsageEvent(event)

    expect(fetched).toEqual([{
      url: '/api/river-log',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        keepalive: true,
      },
    }])
  })

  it('sends nothing from a dev server', async () => {
    const { fetched } = stubBrowser({ dev: true })
    const { sendUsageEvent } = await loadTransport()

    sendUsageEvent(event)

    expect(fetched).toEqual([])
  })

  it('sends nothing from a local host', async () => {
    const { fetched } = stubBrowser({ hostname: 'localhost' })
    const { sendUsageEvent } = await loadTransport()

    sendUsageEvent(event)

    expect(fetched).toEqual([])
  })

  it('reads Do Not Track from the navigator', async () => {
    const { fetched } = stubBrowser({ doNotTrack: '1' })
    const { sendUsageEvent } = await loadTransport()

    sendUsageEvent(event)

    expect(fetched).toEqual([])
  })

  it('reads Global Privacy Control from the navigator', async () => {
    const { fetched } = stubBrowser({ globalPrivacyControl: true })
    const { sendUsageEvent } = await loadTransport()

    sendUsageEvent(event)

    expect(fetched).toEqual([])
  })

  it('decides once per page, ignoring a later change of mind', async () => {
    const page = stubBrowser()
    const { sendUsageEvent } = await loadTransport()
    sendUsageEvent(event)

    page.nav.doNotTrack = '1'
    sendUsageEvent(event)

    expect(page.fetched, 'the first answer is cached').toHaveLength(2)
  })

  it('keeps a refusal for the rest of the page', async () => {
    const page = stubBrowser({ doNotTrack: '1' })
    const { sendUsageEvent } = await loadTransport()
    sendUsageEvent(event)

    page.nav.doNotTrack = null
    sendUsageEvent(event)

    expect(page.fetched).toEqual([])
  })

  it('falls back to the navigator\'s own beacon in a browser with no fetch', async () => {
    const { beacons, nav } = stubBrowser({ withFetch: false })
    const { sendUsageEvent } = await loadTransport()

    sendUsageEvent(event)

    expect(beacons.map((beacon) => beacon.url)).toEqual(['/api/river-log'])
    expect(await beacons[0].data.text()).toBe(JSON.stringify(event))
    expect(beacons[0].owner, 'called on the navigator, not detached from it').toBe(nav)
  })
})

describe('installErrorReporting', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('listens for uncaught errors and unhandled rejections on a deployed page', async () => {
    const { listeners } = stubBrowser()
    const { installErrorReporting } = await loadTransport()

    installErrorReporting()

    expect(listeners.map((entry) => entry.type)).toEqual(['error', 'unhandledrejection'])
  })

  it('installs nothing where reporting is off', async () => {
    const { listeners } = stubBrowser({ doNotTrack: 'yes' })
    const { installErrorReporting } = await loadTransport()

    installErrorReporting()

    expect(listeners).toEqual([])
  })

  it('reports an uncaught error with where it was thrown and the page it happened on', async () => {
    const { listeners, fetched } = stubBrowser()
    const { installErrorReporting } = await loadTransport()
    installErrorReporting()

    listeners[0].listener({
      error: undefined,
      message: 'Script error.',
      filename: 'https://fwdone.com/assets/index.js',
      lineno: 3,
      colno: 17,
    })

    expect(fetched.map((request) => JSON.parse(String(request.init.body)))).toEqual([{
      type: 'error',
      message: 'Script error.',
      source: 'https://fwdone.com/assets/index.js:3:17',
      stack: '',
      userAgent: 'Firefox',
      url: 'https://fwdone.com/?level=1',
    }])
  })

  it('reports an unhandled rejection by its reason', async () => {
    const { listeners, fetched } = stubBrowser()
    const { installErrorReporting } = await loadTransport()
    installErrorReporting()

    listeners[1].listener({ reason: 'room closed' })

    expect(fetched.map((request) => JSON.parse(String(request.init.body)))).toEqual([{
      type: 'error',
      message: 'Unhandled rejection — room closed',
      source: '',
      stack: '',
      userAgent: 'Firefox',
      url: 'https://fwdone.com/?level=1',
    }])
  })
})
