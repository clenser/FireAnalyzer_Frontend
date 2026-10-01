import {
  ACCEPTED_MIME_TYPES,
  ACCEPTED_VIDEO_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
} from '../config.js'
import { formatBytes } from './format.js'

const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png)$/i
const VIDEO_EXTENSION_PATTERN = /\.(mp4|webm|mov|m4v)$/i

/**
 * Client-side pre-flight validation. Mirrors the server's constraints so the
 * user gets an immediate, specific message instead of a round-trip error.
 */
export function validateImageFile(file) {
  if (!file) return { ok: false, message: 'No file was selected.' }

  const looksLikeImage =
    ACCEPTED_MIME_TYPES.includes(file.type) || IMAGE_EXTENSION_PATTERN.test(file.name ?? '')

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

/**
 * The same pre-flight for video. Size is the only hard limit here; decodability
 * is proven by actually reading the metadata in `loadVideoSource`.
 */
export function validateVideoFile(file) {
  if (!file) return { ok: false, message: 'No file was selected.' }

  const looksLikeVideo =
    ACCEPTED_VIDEO_MIME_TYPES.includes(file.type) || VIDEO_EXTENSION_PATTERN.test(file.name ?? '')

  if (!looksLikeVideo) {
    return {
      ok: false,
      message: 'Unsupported file type. Please select an MP4, WebM or MOV video.',
    }
  }

  if (file.size === 0) {
    return { ok: false, message: 'This file is empty. Please select a valid video.' }
  }

  if (file.size > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      message: `Video is ${formatBytes(file.size)}. The maximum allowed size is ${formatBytes(
        MAX_VIDEO_BYTES,
      )}.`,
    }
  }

  return { ok: true }
}
