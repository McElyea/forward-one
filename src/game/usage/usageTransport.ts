import {
  shouldReportUsage,
  unhandledRejectionEvent,
  uncaughtErrorEvent,
  USAGE_EVENTS_PATH,
  RETURNING_VISITOR_KEY,
  type PageContext,
  type UsageEvent,
} from './usageEvents'

/**
 * The browser half of usage reporting: decides once per page whether this
 * page reports, and delivers events without ever making the game wait on the
 * answer. Storage and the delivery calls are taken as arguments so the suite
 * can reach them; what is left reads `window` itself, which is why every
 * decision made there is delegated to `usageEvents.ts`.
 */

let reportingEnabled: boolean | undefined

function enabled(): boolean {
  if (reportingEnabled === undefined) {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
    reportingEnabled = shouldReportUsage({
      hostname: window.location.hostname,
      doNotTrack: nav.doNotTrack,
      globalPrivacyControl: nav.globalPrivacyControl,
      dev: import.meta.env.DEV,
    })
  }
  return reportingEnabled
}

/** The ways out of the browser, each absent where the browser lacks it. */
export interface UsageDelivery {
  fetch?: (url: string, init: RequestInit) => Promise<unknown>
  sendBeacon?: (url: string, data: Blob) => boolean
}

/** Wrapped, not passed bare: both throw if called detached from their owner. */
function browserDelivery(): UsageDelivery {
  return {
    fetch: typeof fetch === 'function' ? (url, init) => fetch(url, init) : undefined,
    sendBeacon:
      typeof navigator.sendBeacon === 'function'
        ? (url, data) => navigator.sendBeacon(url, data)
        : undefined,
  }
}

/**
 * Fire and forget. `fetch` with `keepalive` survives the tab closing mid-run,
 * which is exactly when an abandoned-run event is sent, and a failure is the
 * server's problem to notice, never the player's.
 *
 * `fetch`, not `navigator.sendBeacon`: a beacon is a `ping`-type request, and
 * content blockers drop that type wholesale — uBlock Origin does by default,
 * and EasyPrivacy's `$ping` rules do the rest — while `sendBeacon()` still
 * answers `true`, so no fallback ever ran. Measured on 2026-09-20: a real
 * Chrome played a full session and nothing arrived. The beacon is kept only
 * for a browser with no `fetch` at all.
 */
export function deliverUsageEvent(
  event: UsageEvent,
  delivery: UsageDelivery = browserDelivery(),
): void {
  const body = JSON.stringify(event)
  try {
    if (delivery.fetch) {
      void delivery
        .fetch(USAGE_EVENTS_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        })
        .catch(() => undefined)
      return
    }
    delivery.sendBeacon?.(USAGE_EVENTS_PATH, new Blob([body], { type: 'application/json' }))
  } catch {
    // Reporting must never be the thing that throws.
  }
}

export function sendUsageEvent(event: UsageEvent): void {
  if (!enabled()) return
  deliverUsageEvent(event)
}

/** The half of `Storage` the returning-visitor flag needs. */
export type VisitStorage = Pick<Storage, 'getItem' | 'setItem'>

/** The browser's storage, or null where merely reaching for it throws. */
function browserStorage(): VisitStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Whether this browser has opened the game before, flipping the flag on the
 * way out so the next visit reads as returning. localStorage may be absent or
 * refused (private windows, storage quotas); either reads as a first visit.
 */
export function markVisited(storage: VisitStorage | null = browserStorage()): boolean {
  if (storage === null) return false
  try {
    const seen = storage.getItem(RETURNING_VISITOR_KEY) !== null
    if (!seen) storage.setItem(RETURNING_VISITOR_KEY, '1')
    return seen
  } catch {
    return false
  }
}

const pageContext = (): PageContext => ({
  userAgent: navigator.userAgent,
  url: window.location.href,
})

/**
 * Report uncaught errors and unhandled rejections. Installed once at boot,
 * before Phaser starts, so a failure inside the game loop is reported rather
 * than only logged to a console nobody is watching.
 */
export function installErrorReporting(): void {
  if (!enabled()) return
  window.addEventListener('error', (event) => {
    sendUsageEvent(uncaughtErrorEvent(event, pageContext()))
  })
  window.addEventListener('unhandledrejection', (event) => {
    sendUsageEvent(unhandledRejectionEvent(event.reason, pageContext()))
  })
}
