import { describe, expect, it } from 'vitest'
import {
  describeThrown,
  errorEvent,
  orientationOf,
  referrerHost,
  runEndReason,
  runEndedEvent,
  runStartedEvent,
  shouldReportUsage,
  uncaughtErrorEvent,
  unhandledRejectionEvent,
  visitEvent,
} from './usageEvents'

const deployed = {
  hostname: 'fwdone.com',
  doNotTrack: null,
  globalPrivacyControl: undefined,
  dev: false,
}

describe('shouldReportUsage', () => {
  it('reports from a deployed page with no opt-out signal', () => {
    expect(shouldReportUsage(deployed)).toBe(true)
    expect(shouldReportUsage({ ...deployed, doNotTrack: '0' })).toBe(true)
    expect(shouldReportUsage({ ...deployed, doNotTrack: 'unspecified' })).toBe(true)
    expect(shouldReportUsage({ ...deployed, globalPrivacyControl: false })).toBe(true)
  })

  it('honours Do Not Track in each spelling browsers use', () => {
    expect(shouldReportUsage({ ...deployed, doNotTrack: '1' })).toBe(false)
    expect(shouldReportUsage({ ...deployed, doNotTrack: 'yes' })).toBe(false)
  })

  it('honours Global Privacy Control', () => {
    expect(shouldReportUsage({ ...deployed, globalPrivacyControl: true })).toBe(false)
  })

  it('never reports from a dev server or a local host', () => {
    expect(shouldReportUsage({ ...deployed, dev: true })).toBe(false)
    expect(shouldReportUsage({ ...deployed, hostname: 'localhost' })).toBe(false)
    expect(shouldReportUsage({ ...deployed, hostname: '127.0.0.1' })).toBe(false)
    expect(shouldReportUsage({ ...deployed, hostname: '[::1]' }), 'IPv6 loopback').toBe(false)
    expect(shouldReportUsage({ ...deployed, hostname: '0.0.0.0' }), 'all-interfaces bind').toBe(false)
    expect(shouldReportUsage({ ...deployed, hostname: 'dans-laptop.local' })).toBe(false)
  })
})

describe('referrerHost', () => {
  it('keeps the host and drops everything that could identify someone', () => {
    expect(referrerHost('https://t.co/abc123?u=me', 'fwdone.com')).toBe('t.co')
    expect(referrerHost('https://www.reddit.com/r/gamedev/comments/x', 'fwdone.com')).toBe('www.reddit.com')
  })

  it('treats the game itself, nothing, and junk as direct', () => {
    expect(referrerHost('https://fwdone.com/', 'fwdone.com')).toBe('')
    expect(referrerHost('', 'fwdone.com')).toBe('')
    expect(referrerHost('not a url', 'fwdone.com')).toBe('')
  })

  it('caps a referring host at the 120 characters the relay accepts', () => {
    const longHost = `${'a'.repeat(50)}.${'b'.repeat(50)}.${'c'.repeat(50)}.com`
    expect(referrerHost(`https://${longHost}/page`, 'fwdone.com')).toBe(longHost.slice(0, 120))
  })
})

describe('orientationOf', () => {
  it('is portrait only when taller than wide', () => {
    expect(orientationOf(390, 844)).toBe('portrait')
    expect(orientationOf(844, 390)).toBe('landscape')
    expect(orientationOf(500, 500)).toBe('landscape')
  })
})

describe('visitEvent', () => {
  it('shapes the visit the relay expects', () => {
    expect(
      visitEvent({
        touch: true,
        width: 390.4,
        height: 843.6,
        referrer: 'https://news.ycombinator.com/item?id=1',
        ownHost: 'fwdone.com',
        returning: false,
        fonts: 'loaded',
      }),
    ).toEqual({
      type: 'visit',
      device: 'touch',
      orientation: 'portrait',
      viewport: '390x844',
      referrer: 'news.ycombinator.com',
      returning: false,
      fonts: 'loaded',
    })
  })

  it('reports a pointer device in landscape with a direct visit', () => {
    expect(
      visitEvent({
        touch: false,
        width: 1440,
        height: 900,
        referrer: '',
        ownHost: 'fwdone.com',
        returning: true,
        fonts: 'timed-out',
      }),
    ).toEqual({
      type: 'visit',
      device: 'pointer',
      orientation: 'landscape',
      viewport: '1440x900',
      referrer: '',
      returning: true,
      fonts: 'timed-out',
    })
  })
})

describe('runStartedEvent', () => {
  it('names the water, the voice and the input', () => {
    expect(
      runStartedEvent({ levelName: 'Grand Canyon', rapidClass: 4, mode: 'solo', voiceName: 'Bella', touch: false }),
    ).toEqual({ type: 'run-started', level: 'Grand Canyon', rapidClass: 4, mode: 'solo', voice: 'Bella', device: 'pointer' })
  })

  it('reports a touch device', () => {
    expect(
      runStartedEvent({ levelName: 'Grand Canyon', rapidClass: 4, mode: 'solo', voiceName: 'Bella', touch: true }).device,
    ).toBe('touch')
  })

  it('caps the level and voice names at what the relay accepts', () => {
    const event = runStartedEvent({
      levelName: 'L'.repeat(80),
      rapidClass: 4,
      mode: 'solo',
      voiceName: 'V'.repeat(40),
      touch: false,
    })
    expect(event.level, 'level name').toBe('L'.repeat(60))
    expect(event.voice, 'voice name').toBe('V'.repeat(24))
  })
})

describe('runEndedEvent', () => {
  const base = {
    levelName: 'Grand Canyon',
    rapidClass: 4 as const,
    mode: 'solo' as const,
    elapsedMs: 87_432,
    place: 1,
    accuracy: 91.25,
    points: 4200,
    outcome: 'swept-away' as const,
  }

  it('converts the clock to seconds and passes the rest through', () => {
    expect(runEndedEvent(base)).toEqual({
      type: 'run-ended',
      level: 'Grand Canyon',
      rapidClass: 4,
      mode: 'solo',
      seconds: 87.432,
      place: 1,
      accuracy: 91.25,
      points: 4200,
      outcome: 'swept-away',
    })
  })

  it('clamps what the relay would otherwise reject', () => {
    const event = runEndedEvent({ ...base, elapsedMs: -5, place: 0, accuracy: 104, points: 12.6 })
    expect(event.seconds).toBe(0)
    expect(event.place).toBe(1)
    expect(event.accuracy).toBe(100)
    expect(event.points).toBe(13)
    expect(runEndedEvent({ ...base, place: 40 }).place).toBe(8)
  })

  it('caps the level name at what the relay accepts', () => {
    expect(runEndedEvent({ ...base, levelName: 'L'.repeat(80) }).level).toBe('L'.repeat(60))
  })
})

describe('runEndReason', () => {
  it('reads the scene state', () => {
    expect(runEndReason(false, false)).toBe('abandoned')
    expect(runEndReason(true, false)).toBe('swept-away')
    expect(runEndReason(true, true)).toBe('time-expired')
  })
})

describe('errorEvent / describeThrown', () => {
  it('bounds every field and never sends an empty message', () => {
    const event = errorEvent({ message: '', source: 'x'.repeat(300), stack: 'y'.repeat(2000), userAgent: '', url: '' })
    expect(event.message).toBe('Unknown error')
    expect(event.source).toHaveLength(200)
    expect(event.stack).toHaveLength(1500)
  })

  it('caps the message, user agent and page address too', () => {
    const event = errorEvent({
      message: 'm'.repeat(400),
      source: '',
      stack: '',
      userAgent: 'u'.repeat(400),
      url: 'p'.repeat(400),
    })
    expect(event.message, 'message').toHaveLength(300)
    expect(event.userAgent, 'user agent').toHaveLength(300)
    expect(event.url, 'page address').toHaveLength(200)
  })

  it('passes a short error through unchanged', () => {
    expect(
      errorEvent({
        message: 'TypeError: bad',
        source: 'main.js:1:2',
        stack: 'at main.js:1:2',
        userAgent: 'Firefox',
        url: 'https://fwdone.com/',
      }),
    ).toEqual({
      type: 'error',
      message: 'TypeError: bad',
      source: 'main.js:1:2',
      stack: 'at main.js:1:2',
      userAgent: 'Firefox',
      url: 'https://fwdone.com/',
    })
  })

  it('reports an empty stack for an error that carries none', () => {
    const stackless = new Error('lost')
    stackless.stack = undefined
    expect(describeThrown(stackless)).toEqual({ message: 'Error: lost', stack: '' })
  })

  it('treats an object whose message is not text, and null, as a non-error', () => {
    expect(describeThrown({ message: 42 })).toEqual({ message: 'Non-error thrown: [object Object]', stack: '' })
    expect(describeThrown(null)).toEqual({ message: 'Non-error thrown: null', stack: '' })
  })

  it('describes whatever was thrown', () => {
    const error = new TypeError('bad')
    expect(describeThrown(error).message).toBe('TypeError: bad')
    expect(describeThrown(error).stack).toBe(error.stack)
    expect(describeThrown('plain string')).toEqual({ message: 'plain string', stack: '' })
    expect(describeThrown({ message: 'object-ish' })).toEqual({ message: 'object-ish', stack: '' })
    expect(describeThrown(42)).toEqual({ message: 'Non-error thrown: 42', stack: '' })
    expect(describeThrown(undefined).message).toContain('undefined')
  })
})

describe('uncaughtErrorEvent', () => {
  const page = { userAgent: 'Firefox', url: 'https://fwdone.com/' }
  const uncaught = { error: null, message: '', filename: '', lineno: 0, colno: 0 }

  it('reports what was thrown and where', () => {
    const error = new TypeError('bad')
    error.stack = 'at main.js:12:7'

    expect(
      uncaughtErrorEvent({ error, message: 'Uncaught TypeError: bad', filename: 'main.js', lineno: 12, colno: 7 }, page),
    ).toEqual({
      type: 'error',
      message: 'TypeError: bad',
      source: 'main.js:12:7',
      stack: 'at main.js:12:7',
      userAgent: 'Firefox',
      url: 'https://fwdone.com/',
    })
  })

  it('falls back to the event\'s message where nothing was handed over', () => {
    expect(uncaughtErrorEvent({ ...uncaught, message: 'Script error.' }, page).message, 'null error')
      .toBe('Script error.')
    expect(
      uncaughtErrorEvent({ ...uncaught, error: undefined, message: 'Script error.' }, page).message,
      'undefined error',
    ).toBe('Script error.')
  })

  it('reports a falsy throw as itself rather than the event\'s message', () => {
    expect(uncaughtErrorEvent({ ...uncaught, error: 0, message: 'Uncaught 0' }, page).message)
      .toBe('Non-error thrown: 0')
  })

  it('reports no source where the browser names no file', () => {
    expect(uncaughtErrorEvent({ ...uncaught, lineno: 12, colno: 7 }, page).source).toBe('')
  })

  it('bounds the report like any other error', () => {
    const event = uncaughtErrorEvent({ ...uncaught, message: '', filename: 'f'.repeat(300) }, page)

    expect(event.message, 'an empty message').toBe('Unknown error')
    expect(event.source, 'a long file name').toHaveLength(200)
  })
})

describe('unhandledRejectionEvent', () => {
  const page = { userAgent: 'Firefox', url: 'https://fwdone.com/' }

  it('marks the report as a rejection and carries the page', () => {
    const reason = new Error('offline')
    reason.stack = 'at fetch'

    expect(unhandledRejectionEvent(reason, page)).toEqual({
      type: 'error',
      message: 'Unhandled rejection — Error: offline',
      source: '',
      stack: 'at fetch',
      userAgent: 'Firefox',
      url: 'https://fwdone.com/',
    })
  })

  it('describes a rejection reason of any shape', () => {
    expect(unhandledRejectionEvent('timed out', page).message)
      .toBe('Unhandled rejection — timed out')
    expect(unhandledRejectionEvent(undefined, page).message)
      .toBe('Unhandled rejection — Non-error thrown: undefined')
  })
})
