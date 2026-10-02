/**
 * Client-side video metadata reading.
 *
 * The backend now samples and analyses its own frames (`POST /analyze-video`),
 * so the frontend no longer extracts frames itself - it only reads a selected
 * file's duration and resolution locally, for display before the upload.
 */

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

/** Error carrying a stable `code`, so the UI can map it to plain wording. */
export class VideoError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'VideoError'
    this.code = code
  }
}

/** Plain-language wording for every failure mode the video source read can hit. */
export function describeVideoError(error) {
  const code = error?.code
  switch (code) {
    case 'UNSUPPORTED':
      return 'This video type is not supported. Please choose an MP4, WebM or MOV file.'
    case 'METADATA_FAILED':
      return 'This video could not be read. It may be corrupted, or the format may not be supported by your browser.'
    case 'NO_FRAMES':
      return 'This video has no readable picture data. Please try a different file.'
    default:
      return error?.message || 'Video analysis failed. Please try again.'
  }
}

const canUseVideoElement = () =>
  typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'

/**
 * Reads a video's metadata from a local file. The element is disposed once the
 * metadata has been read - the frontend never decodes or draws video frames.
 */
export function loadVideoSource(file, { timeoutMs = 30000 } = {}) {
  if (!canUseVideoElement()) {
    return Promise.reject(new VideoError('UNSUPPORTED', 'Video reading is not available.'))
  }

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true
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
