/**
 * Client-side video frame sampling.
 *
 * The backend only analyses still images, so a video is analysed by sampling a
 * user-chosen number of *randomly distributed* frames and sending each one to the
 * existing `/analyze` endpoint. Nothing here claims continuous analysis.
 *
 * Two halves live in this module so they can be tested independently:
 *  - pure functions (timestamp generation, frame-count resolution, error wording)
 *    with no DOM access, unit-tested in node;
 *  - browser-only helpers (metadata read, canvas frame extraction) that are only
 *    called from a real user gesture flow.
 */

import {
  DEFAULT_FRAME_COUNT,
  FRAME_MAX_WIDTH,
  MAX_FRAME_COUNT,
  MIN_FRAME_COUNT,
} from '../config.js'

/** Never sample the very last instant of a file (some decoders return nothing). */
const END_GUARD_SEC = 0.08

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

/** Error carrying a stable `code`, so the UI can map it to plain wording. */
export class VideoError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'VideoError'
    this.code = code
  }
}

/* --------------------------------- Pure ---------------------------------- */

/**
 * Clamps a requested frame count into the supported range. Anything unusable
 * falls back to the default, so the UI can never request an unbounded batch.
 */
export function resolveFrameCount(value) {
  if (!isFiniteNumber(value)) return DEFAULT_FRAME_COUNT
  const rounded = Math.round(value)
  if (rounded < MIN_FRAME_COUNT) return MIN_FRAME_COUNT
  return clamp(rounded, MIN_FRAME_COUNT, MAX_FRAME_COUNT)
}

export function isValidFrameCount(value) {
  return (
    isFiniteNumber(value) &&
    Number.isInteger(value) &&
    value >= MIN_FRAME_COUNT &&
    value <= MAX_FRAME_COUNT
  )
}

/**
 * Picks `frameCount` random timestamps spread across the whole video.
 *
 * The duration is split into `frameCount` equal buckets and one timestamp is
 * drawn from the middle 60% of each bucket, so the sample covers the entire clip,
 * is genuinely random (rather than a fixed 0%/10%/.../90% grid), and is
 * structurally unable to produce near-duplicate neighbours. `random` is injected
 * for deterministic tests.
 */
export function generateRandomTimestamps(durationSec, frameCount, { random = Math.random } = {}) {
  if (!isFiniteNumber(durationSec) || durationSec <= 0) {
    throw new VideoError('NO_FRAMES', 'The video has no readable duration.')
  }

  const count = resolveFrameCount(frameCount)
  const usable = Math.max(0, durationSec - Math.min(END_GUARD_SEC, durationSec / 2))
  const bucketSize = usable / count

  const stamps = []
  for (let index = 0; index < count; index += 1) {
    const draw = typeof random === 'function' ? random() : Math.random()
    const offset = clamp(isFiniteNumber(draw) ? draw : 0, 0, 1) * 0.6 + 0.2
    stamps.push(index * bucketSize + offset * bucketSize)
  }

  stamps.sort((a, b) => a - b)

  // Safety net for degenerate input: keep every sample, in order, inside the
  // usable range, and never let two of them land on the same instant.
  const result = []
  let previous = -Infinity
  for (const stamp of stamps) {
    const value = Math.min(Math.max(stamp, previous + bucketSize / 2), usable)
    result.push(value)
    previous = value
  }

  return result
}

/** Plain-language wording for every failure mode the video flow can hit. */
export function describeVideoError(error) {
  const code = error?.code
  switch (code) {
    case 'UNSUPPORTED':
      return 'This video type is not supported. Please choose an MP4 or WebM file.'
    case 'METADATA_FAILED':
      return 'This video could not be read. It may be corrupted, or the format may not be supported by your browser.'
    case 'NO_FRAMES':
      return 'No frames could be extracted from this video. Please try a different file.'
    case 'BACKEND_UNAVAILABLE':
      return 'The analysis service is not available. Please wait for it to come online and try again.'
    case 'INSUFFICIENT_FRAMES':
      return 'Not enough valid frames to produce a reliable result.'
    default:
      return error?.message || 'Video analysis failed. Please try again.'
  }
}

/* ------------------------------- Browser --------------------------------- */

const canUseVideoElement = () =>
  typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'

/**
 * Reads a video's metadata from a local file and keeps the element alive so the
 * same decoded resource can be seeked for frame extraction.
 */
export function loadVideoSource(file, { timeoutMs = 30000 } = {}) {
  if (!canUseVideoElement()) {
    return Promise.reject(new VideoError('UNSUPPORTED', 'Video reading is not available.'))
  }

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.crossOrigin = 'anonymous'
  video.setAttribute('aria-hidden', 'true')
  video.src = url

  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
      clearTimeout(timer)
    }

    const finish = (fn, value) => {
      if (settled) return
      settled = true
      cleanup()
      fn(value)
    }

    const onLoaded = () => {
      const duration = isFiniteNumber(video.duration) ? video.duration : 0
      if (duration <= 0) {
        URL.revokeObjectURL(url)
        finish(reject, new VideoError('NO_FRAMES', 'The video has no readable duration.'))
        return
      }
      finish(resolve, {
        url,
        video,
        metadata: {
          durationSec: duration,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
        },
        dispose: () => {
          try {
            video.removeAttribute('src')
            video.load()
          } catch {
            // A detached element may refuse to reload; revoking the URL is enough.
          }
          URL.revokeObjectURL(url)
        },
      })
    }

    const onError = () => {
      URL.revokeObjectURL(url)
      finish(reject, new VideoError('METADATA_FAILED', 'This video could not be decoded.'))
    }

    const timer = setTimeout(() => {
      URL.revokeObjectURL(url)
      finish(reject, new VideoError('METADATA_FAILED', 'Timed out while reading the video.'))
    }, timeoutMs)

    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('error', onError)
    video.load()
  })
}

/** Reads only the duration/size, for callers that do not need the element. */
export function readVideoMetadata(file, options) {
  return loadVideoSource(file, options).then((source) => {
    const { metadata } = source
    source.dispose()
    return metadata
  })
}

function seekTo(video, time, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (fn, value) => {
      if (settled) return
      settled = true
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      clearTimeout(timer)
      fn(value)
    }
    const onSeeked = () => done(resolve, true)
    const onError = () => done(reject, new Error('seek-failed'))
    const timer = setTimeout(() => done(reject, new Error('seek-timeout')), timeoutMs)

    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    try {
      video.currentTime = time
    } catch (error) {
      done(reject, error)
    }
  })
}

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('canvas-unsupported'))
      return
    }
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode-failed'))),
      type,
      quality,
    )
  })

/**
 * Draws each requested timestamp onto a canvas and returns one JPEG `File` per
 * frame, ready for the image endpoint.
 *
 * A frame that cannot be decoded is reported as `{ timestamp, error }` instead of
 * throwing, so a single bad frame degrades the result rather than the run.
 */
export async function extractFrames(
  video,
  timestamps,
  { maxWidth = FRAME_MAX_WIDTH, quality = 0.92, onFrame, timeoutMs = 15000 } = {},
) {
  if (typeof document === 'undefined') {
    throw new VideoError('UNSUPPORTED', 'Frame extraction is not available.')
  }
  if (!video || !Array.isArray(timestamps) || timestamps.length === 0) {
    throw new VideoError('NO_FRAMES', 'No frames were selected for analysis.')
  }

  const sourceWidth = video.videoWidth || 0
  const sourceHeight = video.videoHeight || 0
  if (!sourceWidth || !sourceHeight) {
    throw new VideoError('NO_FRAMES', 'The video has no readable picture data.')
  }

  const scale = maxWidth > 0 ? Math.min(1, maxWidth / sourceWidth) : 1
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new VideoError('UNSUPPORTED', 'This browser cannot decode video frames.')
  }

  const frames = []
  let succeeded = 0

  for (const [index, timestamp] of timestamps.entries()) {
    try {
      await seekTo(video, timestamp, timeoutMs)
      context.clearRect(0, 0, width, height)
      context.drawImage(video, 0, 0, width, height)
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      const label = `frame-${String(index + 1).padStart(3, '0')}.jpg`
      const file = new File([blob], label, { type: 'image/jpeg', lastModified: Date.now() })
      succeeded += 1
      frames.push({ index, timestamp, file, dataUrl: URL.createObjectURL(blob), width, height, error: null })
    } catch (error) {
      frames.push({ index, timestamp, file: null, dataUrl: null, width, height, error: error?.message ?? 'frame-failed' })
    }

    if (typeof onFrame === 'function') {
      onFrame({ index, completed: index + 1, total: timestamps.length, timestamp, succeeded })
    }
  }

  if (succeeded === 0) {
    throw new VideoError('NO_FRAMES', 'No frames could be extracted from this video.')
  }

  return frames
}
