/**
 * Rolling record of how long real image-analysis requests actually took.
 *
 * This is the only source of timing truth in the app. The video estimate is
 * derived from it, so a displayed duration or estimate always reflects measured
 * behaviour rather than a hard-coded number.
 */

const MAX_SAMPLES = 8

const state = {
  samples: [],
}

/** Records one completed request duration. Aborted or non-finite values ignored. */
export function recordRequestDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return false
  state.samples.push(ms)
  if (state.samples.length > MAX_SAMPLES) state.samples.shift()
  return true
}

export function getSampleCount() {
  return state.samples.length
}

/**
 * Mean duration of the recorded samples, or null while nothing has been measured.
 */
export function getAverageRequestDurationMs() {
  if (state.samples.length === 0) return null
  const total = state.samples.reduce((sum, value) => sum + value, 0)
  return total / state.samples.length
}

/** Most recent sample, or null. */
export function getLastRequestDurationMs() {
  if (state.samples.length === 0) return null
  return state.samples[state.samples.length - 1]
}

export function resetPerformanceStore() {
  state.samples = []
}
