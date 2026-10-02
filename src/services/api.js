import { getApiUrl } from './connectionManager.js'
import { normaliseImageResponse, normaliseVideoResponse } from './normalize.js'
import { recordRequestDuration } from './performanceStore.js'

export class ApiError extends Error {
  constructor(message, { code = null, status = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

const NETWORK_MESSAGE = 'Could not reach the analysis service. Check your connection and try again.'

const GENERIC_MESSAGE = 'The analysis service could not process this request.'

/** `performance.now()` where available, so durations are monotonic. */
const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

function endpoint(path) {
  // Always the dynamically discovered URL from the connection manager; no host
  // is ever baked into the app.
  const baseUrl = getApiUrl()
  if (!baseUrl) {
    throw new ApiError('The analysis service is still starting up. Please wait a moment.', {
      code: 'NOT_READY',
    })
  }
  return `${baseUrl}${path}`
}

/**
 * Reads the backend's structured error envelope ({ error: { code, message } }).
 * Falls back to a safe generic message so raw stack traces never reach the UI.
 */
async function toApiError(response) {
  let code = null
  let message = null

  try {
    const body = await response.json()
    code = body?.error?.code ?? null
    message = body?.error?.message ?? null
  } catch {
    // Non-JSON error body (proxy, gateway, HTML error page) — stay generic.
  }

  return new ApiError(message || GENERIC_MESSAGE, { code, status: response.status })
}

export async function checkHealth({ signal } = {}) {
  const response = await fetch(endpoint('/health'), { method: 'GET', signal })

  if (!response.ok) throw await toApiError(response)

  const body = await response.json()
  return {
    status: body?.status ?? null,
    modelsLoaded: body?.models_loaded === true,
    segmentationAvailable: body?.segmentation_available === true,
    device: typeof body?.device === 'string' ? body.device : null,
  }
}

/**
 * Best-effort EC2 inactivity heartbeat (`POST /activity`).
 *
 * This is deliberately silent: a failure here must never surface as an error or
 * otherwise interfere with image/video analysis, so it never throws. The caller
 * (`services/activityHeartbeat`) decides when it is actually worth sending one.
 */
export async function pingActivity() {
  try {
    const baseUrl = getApiUrl()
    if (!baseUrl) return false
    const response = await fetch(`${baseUrl}/activity`, { method: 'POST' })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Uploads a single image to the `/analyze` endpoint.
 * Content-Type is intentionally left unset so the browser sets the multipart boundary.
 *
 * `force_new_analysis` bypasses the backend's 48-hour cache and replaces the
 * cached entry. `onDuration` receives the measured wall-clock time of the
 * request lifecycle, which the caller may display instead of guessing.
 */
export async function analyzeImage(file, { signal, forceNewAnalysis = false, onDuration } = {}) {
  const formData = new FormData()
  formData.append('image', file)
  if (forceNewAnalysis) formData.append('force_new_analysis', 'true')

  const startedAt = now()
  let response
  try {
    response = await fetch(endpoint('/analyze'), { method: 'POST', body: formData, signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    recordRequestDuration(now() - startedAt)
    throw new ApiError(NETWORK_MESSAGE, { code: 'NETWORK_ERROR' })
  }

  // A response that arrives after the caller aborted is discarded, so a cancelled
  // run never renders a result.
  if (signal?.aborted) {
    const aborted = new Error('Analysis cancelled.')
    aborted.name = 'AbortError'
    throw aborted
  }

  let payload = null
  let responseError = null
  if (!response.ok) {
    responseError = await toApiError(response)
  } else {
    try {
      payload = await response.json()
    } catch {
      responseError = new ApiError('The analysis service returned a malformed response.', {
        code: 'BAD_RESPONSE',
        status: response.status,
      })
    }
  }

  // Measured across the whole request lifecycle, body included: this is the wait
  // the user actually experienced, so it is the only figure worth displaying.
  const durationMs = now() - startedAt
  recordRequestDuration(durationMs)

  if (responseError) throw responseError

  if (payload?.success !== true) {
    throw new ApiError(payload?.error?.message || GENERIC_MESSAGE, {
      code: payload?.error?.code ?? 'ANALYSIS_FAILED',
      status: response.status,
    })
  }

  if (typeof onDuration === 'function') onDuration(durationMs)
  return { raw: payload, data: normaliseImageResponse(payload), durationMs }
}

/**
 * Uploads a video to `/analyze-video`. The backend samples its own frames,
 * analyses each one and returns a deterministic, Python-fused consolidated
 * result plus the representative and full per-frame breakdowns - there is no
 * client-side frame extraction or aggregation any more.
 *
 * `force_new_analysis` bypasses the backend's 48-hour cache and replaces the
 * cached entry, exactly as for an image.
 *
 * `frameCount` is the exact backend parameter name `frame_count`: the total
 * number of evenly spaced frames to sample from the clip. It is only sent
 * when it is a finite integer - omitting it preserves the backend's own
 * default (`FLAME_VIDEO_MAX_FRAMES`). The backend validates and clamps it
 * server-side (`MIN_FRAMES_LIMIT`-`MAX_FRAMES_LIMIT`); this layer does not
 * second-guess that, it only forwards what the caller chose.
 */
export async function analyzeVideo(
  file,
  { signal, forceNewAnalysis = false, frameCount = null, onDuration } = {},
) {
  const formData = new FormData()
  formData.append('video', file)
  if (forceNewAnalysis) formData.append('force_new_analysis', 'true')
  if (Number.isInteger(frameCount)) formData.append('frame_count', String(frameCount))

  const startedAt = now()
  let response
  try {
    response = await fetch(endpoint('/analyze-video'), { method: 'POST', body: formData, signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    recordRequestDuration(now() - startedAt)
    throw new ApiError(NETWORK_MESSAGE, { code: 'NETWORK_ERROR' })
  }

  if (signal?.aborted) {
    const aborted = new Error('Analysis cancelled.')
    aborted.name = 'AbortError'
    throw aborted
  }

  let payload = null
  let responseError = null
  if (!response.ok) {
    responseError = await toApiError(response)
  } else {
    try {
      payload = await response.json()
    } catch {
      responseError = new ApiError('The analysis service returned a malformed response.', {
        code: 'BAD_RESPONSE',
        status: response.status,
      })
    }
  }

  const durationMs = now() - startedAt
  recordRequestDuration(durationMs)

  if (responseError) throw responseError

  if (payload?.success !== true) {
    throw new ApiError(payload?.error?.message || GENERIC_MESSAGE, {
      code: payload?.error?.code ?? 'ANALYSIS_FAILED',
      status: response.status,
    })
  }

  if (typeof onDuration === 'function') onDuration(durationMs)
  return { raw: payload, data: normaliseVideoResponse(payload), durationMs }
}
