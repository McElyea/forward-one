import type { RaceMode, RapidClass } from '../types'

/**
 * What the game tells its own server about being played.
 *
 * Each event is a small JSON object POSTed to `/api/river-log` on the game's own
 * origin. The deployment routes that one path to a relay that turns events
 * into Discord posts for the people running the game; the bundle itself holds
 * no webhook, no key, and no address other than its own. Nothing here
 * identifies a player: no id, no name, no address, and the only thing kept in
 * the browser is a flag that says "this browser has been here before".
 *
 * This module is the plain, testable half: it decides whether to report at all
 * and shapes each event. `usageTransport.ts` is the half that touches the
 * browser. The relay validates every field again with the same bounds, so
 * keep the two in step — an event the relay rejects is dropped silently.
 */

/**
 * Not `/api/events`: EasyPrivacy carries `/api/events|$ping,~third-party`, a
 * rule for exactly that path, so under uBlock Origin, AdGuard or Brave a
 * beacon to it never left the browser. Checked against EasyPrivacy, EasyList
 * and uBO's privacy list on 2026-09-20; re-check before renaming.
 */
export const USAGE_EVENTS_PATH = '/api/river-log'

export const RETURNING_VISITOR_KEY = 'forward-one.visited'

export type UsageDevice = 'touch' | 'pointer'
export type UsageOrientation = 'portrait' | 'landscape'
export type FontsOutcome = 'loaded' | 'timed-out' | 'unavailable'
export type RunEndReason = 'swept-away' | 'time-expired' | 'abandoned'

export interface VisitEvent {
  type: 'visit'
  device: UsageDevice
  orientation: UsageOrientation
  /** `WxH` in CSS pixels. */
  viewport: string
  /** Host of the referring page, or empty for a direct visit. */
  referrer: string
  returning: boolean
  fonts: FontsOutcome
}

export interface RunStartedEvent {
  type: 'run-started'
  level: string
  rapidClass: RapidClass
  mode: RaceMode
  voice: string
  device: UsageDevice
}

export interface RunEndedEvent {
  type: 'run-ended'
  level: string
  rapidClass: RapidClass
  mode: RaceMode
  seconds: number
  place: number
  accuracy: number
  points: number
  outcome: RunEndReason
}

export interface ErrorEvent {
  type: 'error'
  message: string
  source: string
  stack: string
  userAgent: string
  url: string
}

export type UsageEvent = VisitEvent | RunStartedEvent | RunEndedEvent | ErrorEvent

/** The inputs to the "should this page report at all" decision. */
export interface ReportingContext {
  hostname: string
  /** `navigator.doNotTrack`, which browsers spell three ways. */
  doNotTrack: string | null | undefined
  /** `navigator.globalPrivacyControl`, present only where GPC is implemented. */
  globalPrivacyControl: boolean | undefined
  /** `import.meta.env.DEV`: the Vite dev server, never a deployment. */
  dev: boolean
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])

/**
 * Report from a deployed page whose visitor has not asked not to be tracked.
 *
 * Do Not Track and Global Privacy Control are the two signals a browser has
 * for "leave me out"; either one wins. A dev server or a local build is a
 * developer, not a player, and reports nothing.
 */
export function shouldReportUsage(context: ReportingContext): boolean {
  if (context.dev) return false
  if (LOCAL_HOSTS.has(context.hostname) || context.hostname.endsWith('.local')) return false
  if (context.doNotTrack === '1' || context.doNotTrack === 'yes') return false
  if (context.globalPrivacyControl === true) return false
  return true
}

export function orientationOf(width: number, height: number): UsageOrientation {
  return height > width ? 'portrait' : 'landscape'
}

/**
 * The host of the referring page — enough to see where visitors arrive from,
 * never the path or the query, which can carry someone else's identifiers.
 */
export function referrerHost(referrer: string, ownHost: string): string {
  if (referrer === '') return ''
  let host: string
  try {
    host = new URL(referrer).host
  } catch {
    return ''
  }
  return host === ownHost ? '' : host.slice(0, 120)
}

export interface VisitInput {
  touch: boolean
  width: number
  height: number
  referrer: string
  ownHost: string
  returning: boolean
  fonts: FontsOutcome
}

export function visitEvent(input: VisitInput): VisitEvent {
  return {
    type: 'visit',
    device: input.touch ? 'touch' : 'pointer',
    orientation: orientationOf(input.width, input.height),
    viewport: `${Math.round(input.width)}x${Math.round(input.height)}`,
    referrer: referrerHost(input.referrer, input.ownHost),
    returning: input.returning,
    fonts: input.fonts,
  }
}

export interface RunStartedInput {
  levelName: string
  rapidClass: RapidClass
  mode: RaceMode
  voiceName: string
  touch: boolean
}

export function runStartedEvent(input: RunStartedInput): RunStartedEvent {
  return {
    type: 'run-started',
    level: input.levelName.slice(0, 60),
    rapidClass: input.rapidClass,
    mode: input.mode,
    voice: input.voiceName.slice(0, 24),
    device: input.touch ? 'touch' : 'pointer',
  }
}

export interface RunEndedInput {
  levelName: string
  rapidClass: RapidClass
  mode: RaceMode
  elapsedMs: number
  place: number
  accuracy: number
  points: number
  outcome: RunEndReason
}

export function runEndedEvent(input: RunEndedInput): RunEndedEvent {
  return {
    type: 'run-ended',
    level: input.levelName.slice(0, 60),
    rapidClass: input.rapidClass,
    mode: input.mode,
    seconds: Math.round(Math.max(0, input.elapsedMs)) / 1000,
    place: Math.max(1, Math.min(8, Math.round(input.place))),
    accuracy: Math.max(0, Math.min(100, input.accuracy)),
    points: Math.round(input.points),
    outcome: input.outcome,
  }
}

/** How a run ended, from what `RiverScene` knows when it stops the clock. */
export function runEndReason(completed: boolean, timeExpired: boolean): RunEndReason {
  if (!completed) return 'abandoned'
  return timeExpired ? 'time-expired' : 'swept-away'
}

export interface ErrorInput {
  message: string
  source: string
  stack: string
  userAgent: string
  url: string
}

export function errorEvent(input: ErrorInput): ErrorEvent {
  return {
    type: 'error',
    message: input.message.slice(0, 300) || 'Unknown error',
    source: input.source.slice(0, 200),
    stack: input.stack.slice(0, 1500),
    userAgent: input.userAgent.slice(0, 300),
    url: input.url.slice(0, 200),
  }
}

/**
 * One line of "what and where" from whatever the browser hands an error
 * handler: an `Error`, a string, a rejection reason of any shape.
 */
export function describeThrown(thrown: unknown): { message: string; stack: string } {
  if (thrown instanceof Error) {
    return { message: `${thrown.name}: ${thrown.message}`, stack: thrown.stack ?? '' }
  }
  if (typeof thrown === 'string') return { message: thrown, stack: '' }
  if (thrown && typeof thrown === 'object' && 'message' in thrown && typeof thrown.message === 'string') {
    return { message: thrown.message, stack: '' }
  }
  return { message: `Non-error thrown: ${String(thrown)}`, stack: '' }
}
