import {
  describeThrown,
  errorEvent,
  shouldReportUsage,
  USAGE_EVENTS_PATH,
  RETURNING_VISITOR_KEY,
  type UsageEvent,
} from './usageEvents'

/**
 * The browser half of usage reporting: decides once per page whether this
 * page reports, and delivers events without ever making the game wait on the
 * answer. Nothing in here is covered by the suite (it reads `window`), which is
 * why every decision it makes is delegated to `usageEvents.ts`.
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
export function sendUsageEvent(event: UsageEvent): void {
  if (!enabled()) return
  const body = JSON.stringify(event)
  try {
    if (typeof fetch === 'function') {
      void fetch(USAGE_EVENTS_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => undefined)
      return
    }
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(USAGE_EVENTS_PATH, new Blob([body], { type: 'application/json' }))
    }
  } catch {
    // Reporting must never be the thing that throws.
  }
}

/**
 * Whether this browser has opened the game before, flipping the flag on the
 * way out so the next visit reads as returning. localStorage may be absent or
 * refused (private windows, storage quotas); either reads as a first visit.
 */
export function markVisited(): boolean {
  try {
    const seen = window.localStorage.getItem(RETURNING_VISITOR_KEY) !== null
    if (!seen) window.localStorage.setItem(RETURNING_VISITOR_KEY, '1')
    return seen
  } catch {
    return false
  }
}

/**
 * Report uncaught errors and unhandled rejections. Installed once at boot,
 * before Phaser starts, so a failure inside the game loop is reported rather
 * than only logged to a console nobody is watching.
 */
export function installErrorReporting(): void {
  if (!enabled()) return
  window.addEventListener('error', (event) => {
    const described = describeThrown(event.error ?? event.message)
    sendUsageEvent(
      errorEvent({
        message: described.message,
        source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '',
        stack: described.stack,
        userAgent: navigator.userAgent,
        url: window.location.href,
      }),
    )
  })
  window.addEventListener('unhandledrejection', (event) => {
    const described = describeThrown(event.reason)
    sendUsageEvent(
      errorEvent({
        message: `Unhandled rejection — ${described.message}`,
        source: '',
        stack: described.stack,
        userAgent: navigator.userAgent,
        url: window.location.href,
      }),
    )
  })
}
