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
})

describe('runStartedEvent', () => {
  it('names the water, the voice and the input', () => {
    expect(
      runStartedEvent({ levelName: 'Grand Canyon', rapidClass: 4, mode: 'solo', voiceName: 'Bella', touch: false }),
    ).toEqual({ type: 'run-started', level: 'Grand Canyon', rapidClass: 4, mode: 'solo', voice: 'Bella', device: 'pointer' })
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
