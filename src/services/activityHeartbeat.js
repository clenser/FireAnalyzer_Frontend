/**
 * EC2 inactivity watchdog heartbeat (`POST /activity`).
 *
 * This is a distinct concern from `services/connectionManager` (Lambda wake,
 * health polling, the dynamic API URL) and deliberately does not touch it: the
 * backend never resets its inactivity countdown from an analysis request, only
 * from an explicit heartbeat the frontend sends while a person is actually
 * using the app.
 *
 * Rules this module enforces:
 *  - A heartbeat is sent only in response to real activity (`notifyActivity`),
 *    never on a timer that runs merely because the tab is open.
 *  - Heartbeats are throttled to at most one per `MIN_INTERVAL_MS`.
 *  - Once idle for `ACTIVE_WINDOW_MS`, the periodic re-send stops; new activity
 *    restarts it.
 *  - A hidden tab stops sending; becoming visible does not resume on its own -
 *    it takes a new real interaction, exactly like any other activity.
 *  - A failed heartbeat is swallowed. It never changes connection state and
 *    never interferes with image/video analysis.
 */

import { pingActivity } from './api.js'
import { getConnectionState } from './connectionManager.js'

const MIN_INTERVAL_MS = 30000
const ACTIVE_WINDOW_MS = 120000

let lastSentAt = -Infinity
let lastActivityAt = -Infinity
let timer = null

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function send() {
  lastSentAt = Date.now()
  pingActivity().catch(() => {})
}

function tick() {
  if (Date.now() - lastActivityAt > ACTIVE_WINDOW_MS) {
    stopTimer()
    return
  }
  if (getConnectionState() === 'ready') send()
}

/** Call on any real user interaction (pointer, keyboard, touch, file picked, analysis started, ...). */
export function notifyActivity() {
  lastActivityAt = Date.now()

  if (typeof document !== 'undefined' && document.hidden) return
  if (getConnectionState() !== 'ready') return

  if (Date.now() - lastSentAt >= MIN_INTERVAL_MS) send()
  if (!timer) timer = setInterval(tick, MIN_INTERVAL_MS)
}

export function stopActivityHeartbeat() {
  stopTimer()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer()
  })
}
