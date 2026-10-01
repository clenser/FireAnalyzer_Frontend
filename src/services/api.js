import { getApiUrl } from './connectionManager.js'
import {
  normaliseAiMaterialAnalysis,
  normaliseMaterialIdentification,
  normaliseResponse,
} from './normalize.js'
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
 * Uploads a single image to the /analyze endpoint.
 * Content-Type is intentionally left unset so the browser sets the multipart boundary.
 *
 * Video frames are ordinary `File` objects, so they go through this same call -
 * one request per sampled frame, exactly as the backend expects.
 *
 * `onDuration` receives the measured wall-clock time of the request lifecycle,
 * which the caller may display instead of guessing.
 */
export async function analyzeImage(file, { signal, onDuration } = {}) {
  const formData = new FormData()
  formData.append('image', file)

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
  return { raw: payload, data: normaliseResponse(payload), durationMs }
}

/**
 * Shared JSON round-trip for the two video endpoints.
 *
 * Both are plain `application/json` POSTs (no file, no multipart), both go to
 * the dynamically discovered URL, and neither is allowed to fail the run on its
 * own: the caller decides whether a missing answer degrades one card or the whole
 * result. Durations are recorded so the performance store stays representative
 * of every request the app makes.
 */
async function postJson(path, body, { signal } = {}) {
  // Resolved before the try: a missing URL is "the service is still starting",
  // not a network failure, and must keep its own code.
  const url = endpoint(path)

  const startedAt = now()
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError(NETWORK_MESSAGE, { code: 'NETWORK_ERROR' })
  }

  if (signal?.aborted) {
    const aborted = new Error('Analysis cancelled.')
    aborted.name = 'AbortError'
    throw aborted
  }

  let payload = null
  let failure = null
  if (!response.ok) {
    failure = await toApiError(response)
  } else {
    try {
      payload = await response.json()
    } catch {
      failure = new ApiError('The analysis service returned a malformed response.', {
        code: 'BAD_RESPONSE',
        status: response.status,
      })
    }
  }

  recordRequestDuration(now() - startedAt)

  if (failure) throw failure
  return payload
}

/**
 * Deterministic material identification for one aggregated flame colour.
 *
 * This is the *same* matcher and the *same* dataset `POST /analyze` uses: the
 * client only supplies the average RGB/LAB it measured across the analysed
 * frames, and the backend returns the primary material, the alternatives, the
 * fire class and the extinguishing agents. Nothing is classified in JavaScript,
 * and no AI model is involved - the video fire class comes from this answer.
 */
export async function identifyMaterial({ rgb, lab }, { signal } = {}) {
  const payload = await postJson('/material-identification', { rgb, lab }, { signal })

  if (payload?.success !== true) {
    throw new ApiError(payload?.error?.message || GENERIC_MESSAGE, {
      code: payload?.error?.code ?? 'ANALYSIS_FAILED',
    })
  }

  return { raw: payload, data: normaliseMaterialIdentification(payload) }
}

/**
 * ONE consolidated AI material assessment for a whole video.
 *
 * Every analysed frame's structured evidence is sent in a single request and a
 * single video-level result comes back. The frontend never calls Gemini per frame
 * and never averages per-frame confidences - the backend judges the collection.
 */
export async function analyzeVideoMaterial(frames, { signal } = {}) {
  const payload = await postJson('/video-material-analysis', { frames }, { signal })

  if (!payload || typeof payload !== 'object') {
    throw new ApiError('The analysis service returned a malformed response.', {
      code: 'BAD_RESPONSE',
    })
  }

  return { raw: payload, data: normaliseAiMaterialAnalysis(payload) }
}
