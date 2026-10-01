import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'

import { ApiError, analyzeImage, checkHealth } from '../src/services/api.js'
import {
  connect,
  configureConnectionManager,
  disconnect,
  getConnectionState,
  resetConnectionManager,
  subscribeToState,
} from '../src/services/connectionManager.js'
import { getAverageRequestDurationMs, resetPerformanceStore } from '../src/services/performanceStore.js'

/**
 * The API layer is the one place the frontend talks to the backend, so these
 * tests pin the contract that matters: always use the dynamically discovered
 * URL, never render a raw failure, and only report a duration that was measured.
 *
 * The API URL is not injected - it is obtained by driving the real connection
 * manager, exactly as the app does at startup.
 */

const previousFetch = globalThis.fetch

/** Drives the connection manager to `ready` and returns the API calls it made. */
async function establishApiUrl() {
  const apiCalls = []
  const connectionFetch = async (url) => {
    if (String(url).includes('lambda-url')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ instance_id: 'i-123', state: 'running', public_ip: '1.2.3.4', api_url: API_URL }),
      }
    }
    if (String(url).endsWith('/health') || String(url).endsWith('/activity')) {
      return { ok: true, status: 200, json: async () => ({ status: 'ok', device: 'cpu' }) }
    }
    throw new Error(`unexpected connection call: ${url}`)
  }

  configureConnectionManager({
    fetch: connectionFetch,
    pollInterval: 1,
    heartbeatInterval: 100000,
  })

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connection never became ready')), 2000)
    const unsubscribe = subscribeToState((connectionState) => {
      if (connectionState === 'ready') {
        clearTimeout(timer)
        unsubscribe()
        resolve()
      }
    })
  })

  connect()
  await ready
  assert.equal(getConnectionState(), 'ready')
  return apiCalls
}

/** Replaces global fetch for the API layer only, recording every call. */
function respondWith({ status = 200, body = null, throws = null, delayMs = 0 } = {}) {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
    if (throws) throw throws
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (body === null) throw new SyntaxError('Unexpected token < in JSON')
        return body
      },
    }
  }
  return calls
}

const API_URL = 'https://dynamically-discovered.example'

beforeEach(async () => {
  resetPerformanceStore()
  resetConnectionManager()
  await establishApiUrl()
})

afterEach(() => {
  globalThis.fetch = previousFetch
  resetPerformanceStore()
  disconnect()
  resetConnectionManager()
})

/* --------------------------------- health -------------------------------- */

test('health is read from the dynamically discovered URL', async () => {
  const calls = respondWith({
    body: { status: 'ok', models_loaded: true, segmentation_available: true, device: 'cpu' },
  })

  const health = await checkHealth()

  assert.equal(calls[0].url, `${API_URL}/health`)
  assert.equal(health.status, 'ok')
  assert.equal(health.modelsLoaded, true)
  assert.equal(health.segmentationAvailable, true)
  assert.equal(health.device, 'cpu')
})

test('an unhealthy response is surfaced as an ApiError, not a thrown string', async () => {
  respondWith({ status: 503, body: { error: { code: 'STARTING', message: 'Models are loading.' } } })

  await assert.rejects(checkHealth(), (error) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 503)
    assert.equal(error.code, 'STARTING')
    assert.equal(error.message, 'Models are loading.')
    return true
  })
})

test('a non-JSON error body never leaks raw text into the message', async () => {
  respondWith({ status: 500, body: null })

  await assert.rejects(checkHealth(), (error) => {
    assert.ok(error instanceof ApiError)
    assert.doesNotMatch(error.message, /Unexpected token/)
    assert.match(error.message, /could not process/i)
    return true
  })
})

/* -------------------------------- analyze -------------------------------- */

const successBody = {
  success: true,
  fire_detection: { detected: true, confidence: 0.88 },
  flame_analysis: { mean_flame_color: { rgb: [220, 120, 30] } },
  material_analysis: { primary_material: 'Cooking Oils', similarity: 0.8 },
  ai_material_analysis: { available: true, matches: [{ rank: 1, material: 'Cooking Oils' }] },
  fire_class: { class: 'K' },
}

const pngFile = () => new File([new Uint8Array([1, 2, 3])], 'fire.png', { type: 'image/png' })

test('an image is posted to /analyze on the discovered URL as multipart form data', async () => {
  const calls = respondWith({ body: successBody })

  const result = await analyzeImage(pngFile())

  assert.equal(calls[0].url, `${API_URL}/analyze`)
  assert.equal(calls[0].options.method, 'POST')
  assert.ok(calls[0].options.body instanceof FormData)
  assert.equal(calls[0].options.body.get('image').name, 'fire.png')
  assert.equal(
    calls[0].options.headers,
    undefined,
    'Content-Type is left unset so the browser sets the multipart boundary',
  )

  assert.equal(result.data.detection.detected, true)
  assert.equal(result.data.material.name, 'Cooking Oils')
  assert.ok(result.durationMs >= 0)
})

test('the measured duration covers the body, not just the headers', async () => {
  respondWith({ body: successBody, delayMs: 40 })

  const result = await analyzeImage(pngFile())

  assert.ok(
    result.durationMs >= 35,
    `expected the body wait to be counted, got ${result.durationMs}ms`,
  )
})

test('the duration is handed to the caller so nothing has to be estimated', async () => {
  respondWith({ body: successBody })
  const seen = []

  await analyzeImage(pngFile(), { onDuration: (ms) => seen.push(ms) })

  assert.equal(seen.length, 1)
  assert.equal(typeof seen[0], 'number')
})

test('a timed request is remembered as a real measurement for later estimates', async () => {
  assert.equal(getAverageRequestDurationMs(), null)

  respondWith({ body: successBody, delayMs: 30 })
  await analyzeImage(pngFile())

  const average = getAverageRequestDurationMs()
  assert.ok(average !== null, 'the request was timed and recorded')
  assert.ok(average >= 25, `expected the measured time, got ${average}`)
})

test('a failure is never reported as a measured successful duration', async () => {
  respondWith({ status: 500, body: { error: { message: 'Model crashed.' } } })
  const seen = []

  await assert.rejects(
    analyzeImage(pngFile(), { onDuration: (ms) => seen.push(ms) }),
    (error) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.message, 'Model crashed.')
      assert.equal(error.code, null)
      return true
    },
  )

  assert.deepEqual(seen, [], 'no duration is reported for a failed request')
})

test('a payload without success:true is a failure even on HTTP 200', async () => {
  respondWith({ status: 200, body: { success: false, error: { code: 'NO_FLAME', message: 'No flame found.' } } })

  await assert.rejects(analyzeImage(pngFile()), (error) => {
    assert.equal(error.code, 'NO_FLAME')
    assert.equal(error.message, 'No flame found.')
    return true
  })
})

test('a malformed body is reported as a bad response, not a crash', async () => {
  respondWith({ status: 200, body: null })

  await assert.rejects(analyzeImage(pngFile()), (error) => {
    assert.equal(error.code, 'BAD_RESPONSE')
    return true
  })
})

test('a network failure becomes a plain-language error', async () => {
  respondWith({ throws: new TypeError('Failed to fetch') })

  await assert.rejects(analyzeImage(pngFile()), (error) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.code, 'NETWORK_ERROR')
    assert.doesNotMatch(error.message, /Failed to fetch/)
    return true
  })
})

test('an abort propagates as an AbortError so the UI can tell cancel from failure', async () => {
  const controller = new AbortController()
  const abortError = new Error('aborted')
  abortError.name = 'AbortError'

  respondWith({ throws: abortError })

  await assert.rejects(
    analyzeImage(pngFile(), { signal: controller.signal }),
    (error) => error.name === 'AbortError',
  )
})

test('a response that lands after cancellation is discarded', async () => {
  const controller = new AbortController()
  respondWith({ body: successBody })

  controller.abort()

  await assert.rejects(
    analyzeImage(pngFile(), { signal: controller.signal }),
    (error) => error.name === 'AbortError',
  )
})

test('a video frame file goes through the exact same image call', async () => {
  const calls = respondWith({ body: successBody })
  const frame = new File([new Uint8Array([9, 9, 9])], 'frame-001.jpg', { type: 'image/jpeg' })

  const result = await analyzeImage(frame)

  assert.equal(calls[0].options.body.get('image').name, 'frame-001.jpg')
  assert.equal(result.data.detection.detected, true)
})
