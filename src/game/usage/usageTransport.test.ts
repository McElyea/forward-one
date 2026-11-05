import { describe, expect, it } from 'vitest'
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
