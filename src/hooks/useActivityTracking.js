import { useEffect } from 'react'
import { notifyActivity } from '../services/activityHeartbeat.js'

/** Window-level signals that count as "the user is actually using the app". */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart']

/**
 * Wires real user interaction to the EC2 inactivity heartbeat.
 *
 * Mounted once at the app root. A click, key press or touch anywhere in the
 * app - choosing a file, pressing Analyze, toggling a control, paging through
 * results - counts as activity; an idle open tab does not.
 */
export default function useActivityTracking() {
  useEffect(() => {
    const handleActivity = () => notifyActivity()

    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, handleActivity, { passive: true })
    }

    return () => {
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, handleActivity)
      }
    }
  }, [])
}
