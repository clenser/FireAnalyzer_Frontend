import { API_BASE_URL } from '../config'
import { normaliseResponse } from './normalize'

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

function endpoint(path) {
  if (!API_BASE_URL) {
    throw new ApiError('VITE_API_URL is not configured for this build.', { code: 'NO_API_URL' })
  }
  return `${API_BASE_URL}${path}`
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
 * Uploads an image to the real /analyze endpoint.
 * Content-Type is intentionally left unset so the browser sets the multipart boundary.
 */
export async function analyzeImage(file, { signal } = {}) {
  const formData = new FormData()
  formData.append('image', file)

  let response
  try {
    response = await fetch(endpoint('/analyze'), { method: 'POST', body: formData, signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError(NETWORK_MESSAGE, { code: 'NETWORK_ERROR' })
  }

  if (!response.ok) throw await toApiError(response)

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new ApiError('The analysis service returned a malformed response.', {
      code: 'BAD_RESPONSE',
      status: response.status,
    })
  }

  if (payload?.success !== true) {
    throw new ApiError(payload?.error?.message || GENERIC_MESSAGE, {
      code: payload?.error?.code ?? 'ANALYSIS_FAILED',
      status: response.status,
    })
  }

  return { raw: payload, data: normaliseResponse(payload) }
}
