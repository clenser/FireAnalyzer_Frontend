const configuredUrl = import.meta.env.VITE_API_URL ?? ''

// Trim whitespace and any trailing slashes so a sloppy env file cannot break URLs.
export const API_BASE_URL = String(configuredUrl).trim().replace(/\/+$/, '')

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png']

export const ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,.jpg,.jpeg,.png'

export const SUPPORTED_LABEL = 'JPG, JPEG, PNG'

export const SUPPORTED_DETAIL = `${SUPPORTED_LABEL} • Maximum ${Math.round(
  MAX_UPLOAD_BYTES / (1024 * 1024),
)} MB`
