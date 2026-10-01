export function formatPercent(value, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return `${(value * 100).toFixed(digits)}%`
}

export function formatMs(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${value.toFixed(value < 10 ? 1 : 0)} ms`
}

export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function formatCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

/**
 * A measured wall-clock duration, e.g. `12.4s`.
 *
 * Only ever fed a real measurement of the request lifecycle - never a constant -
 * so a displayed time always matches what the user actually waited.
 */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** `mm:ss` for a video timestamp in seconds. */
export function formatTimestamp(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '--:--'
  const total = Math.floor(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/**
 * A coarse "about N to M seconds" range for an estimate, e.g. `~20-30 sec`.
 * The band is proportional so it stays honest for both 5 and 20 frames.
 */
export function formatDurationRange(ms, { lowFactor = 0.75, highFactor = 1.3 } = {}) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null
  const low = Math.max(1, Math.round((ms * lowFactor) / 1000))
  const high = Math.max(low, Math.round((ms * highFactor) / 1000))
  return `~${low}-${high} sec`
}

/** A short, human duration for counts and captions, e.g. `~9 sec`. */
export function formatApproxSeconds(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null
  const seconds = Math.max(1, Math.round(ms / 1000))
  return `~${seconds} sec`
}
