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
