import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES } from '../config'
import { formatBytes } from './format'

const EXTENSION_PATTERN = /\.(jpe?g|png)$/i

/**
 * Client-side pre-flight validation. Mirrors the server's constraints so the
 * user gets an immediate, specific message instead of a round-trip error.
 */
export function validateImageFile(file) {
  if (!file) return { ok: false, message: 'No file was selected.' }

  const looksLikeImage =
    ACCEPTED_MIME_TYPES.includes(file.type) || EXTENSION_PATTERN.test(file.name ?? '')

  if (!looksLikeImage) {
    return { ok: false, message: 'Unsupported file type. Please select a JPG, JPEG or PNG image.' }
  }

  if (file.size === 0) {
    return { ok: false, message: 'This file is empty. Please select a valid image.' }
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `Image is ${formatBytes(file.size)}. The maximum allowed size is ${formatBytes(
        MAX_UPLOAD_BYTES,
      )}.`,
    }
  }

  return { ok: true }
}
