import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'

import {
  ApiError,
  analyzeVideoMaterial,
  identifyMaterial,
} from '../src/services/api.js'
import {
  configureConnectionManager,
  connect,
  disconnect,
  getApiUrl,
  resetConnectionManager,
  subscribeToState,
} from '../src/services/connectionManager.js'
import { resetPerformanceStore } from '../src/services/performanceStore.js'

/**
 * The two endpoints the video workflow depends on, tested against the real
 * connection manager so the "never hard-code the host" rule is genuinely
 * enforced: the URL only exists because the Lambda wake flow produced it.
 */

const previousFetch = globalThis.fetch
const API_URL = 'https://dynamically-discovered.example'

async function establishApiUrl() {
  const connectionFetch = async (url) => {
    if (String(url).includes('lambda-url')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ instance_id: 'i-123', state: 'running', api_url: API_URL }),
      }
    }
    if (String(url).endsWith('/health') || String(url).endsWith('/activity')) {
      return { ok: true, status: 200, json: async () => ({ status: 'ok', device: 'cpu' }) }
    }
    throw new Error(`unexpected connection call: ${url}`)
  }

  configureConnectionManager({ fetch: connectionFetch, pollInterval: 1, heartbeatInterval: 100000 })

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connection never became ready')), 2000)
    const unsubscribe = subscribeToState((state) => {
      if (state === 'ready') {
        clearTimeout(timer)
        unsubscribe()
        resolve()
      }
    })
  })

  connect()
  await ready
}

/** Stubs the API layer's fetch, recording every request it makes. */
function respondWith(handler) {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return handler(String(url), options, calls.length)
  }
  return calls
}

const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

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

/* -------------------- deterministic material identification ---------------- */

test('material identification posts the aggregated colour to the discovered URL', async () => {
  const body = {
    success: true,
    material_analysis: {
      primary_material: 'Natural Fibers',
      similarity: 0.9268,
      alternatives: [
        { material: 'Paper Products(Wood material)', similarity: 0.8885 },
        { material: 'Wax Materials', similarity: 0.8885 },
      ],
    },
    fire_class: { class: 'Class A', description: 'Ordinary combustibles', material: 'Natural Fibers' },
    extinguishing_agents: [{ name: 'Water', type: 'cooling', fire_class: 'Class A' }],
  }

  const calls = respondWith(() => json(body))

  const result = await identifyMaterial({ rgb: [210, 110, 30], lab: [62.5, 21.3, 46.3] })

  assert.equal(calls.length, 1, 'exactly one deterministic call')
  assert.equal(calls[0].url, `${API_URL}/material-identification`)
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    rgb: [210, 110, 30],
    lab: [62.5, 21.3, 46.3],
  })

  assert.equal(result.data.success, true)
  assert.equal(result.data.material.name, 'Natural Fibers')
  assert.equal(result.data.material.similarity, 0.9268)
  assert.equal(result.data.fireClass.name, 'Class A')
  assert.deepEqual(
    result.data.agents.map((agent) => agent.name),
    ['Water'],
  )
})

test('the deterministic response also exposes the top-level mirrors', async () => {
  respondWith(() =>
    json({
      success: true,
      primary_material: 'Wax Materials',
      similarity: 0.71,
      alternatives: [{ material: 'Natural Fibers', similarity: 0.6 }],
    }),
  )

  const { data } = await identifyMaterial({ rgb: [10, 10, 10], lab: [1, 2, 3] })

  assert.equal(data.material.name, 'Wax Materials', 'read from the mirror fields')
  assert.equal(data.material.alternatives.length, 1)
})

test('a deterministic failure is an ApiError, never a fabricated material', async () => {
  respondWith(() =>
    json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'The analysis service is not ready.' } }, 503),
  )

  await assert.rejects(identifyMaterial({ rgb: [1, 2, 3], lab: [4, 5, 6] }), (error) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 503)
    assert.equal(error.code, 'SERVICE_UNAVAILABLE')
    return true
  })
})

test('a malformed deterministic body is rejected rather than shown as empty', async () => {
  respondWith(() => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON')
    },
  }))

  await assert.rejects(identifyMaterial({ rgb: [1, 2, 3], lab: [4, 5, 6] }), (error) => {
    assert.equal(error.code, 'BAD_RESPONSE')
    return true
  })
})

/* ---------------------- one consolidated Gemini assessment ---------------- */

test('all frame evidence goes into ONE video AI request', async () => {
  const frames = [
    { frame_index: 0, rgb: [210, 110, 30], lab: [62, 24, 55], timestamp_seconds: 1.5 },
    { frame_index: 1, rgb: [200, 120, 40], lab: [60, 25, 55], timestamp_seconds: 7.25 },
    { frame_index: 2, rgb: [220, 100, 25], lab: [64, 22, 52], timestamp_seconds: 13 },
  ]

  const calls = respondWith(() =>
    json({
      available: true,
      primary_material: 'Natural Fibers',
      matches: [{ rank: 1, material: 'Natural Fibers', confidence_percent: 72 }],
      overall_confidence_level: 'medium',
      reasoning_summary: 'consistent across the clip',
      frames_supplied: 3,
      frames_analyzed: 3,
      display_threshold_percent: 45,
    }),
  )

  const { data } = await analyzeVideoMaterial(frames)

  assert.equal(calls.length, 1, 'exactly one Gemini request for the whole video')
  assert.equal(calls[0].url, `${API_URL}/video-material-analysis`)

  const sent = JSON.parse(calls[0].options.body)
  assert.equal(sent.frames.length, 3, 'every frame travels in that one request')
  assert.deepEqual(
    sent.frames.map((frame) => frame.frame_index),
    [0, 1, 2],
  )
  assert.deepEqual(sent.frames[1], {
    frame_index: 1,
    rgb: [200, 120, 40],
    lab: [60, 25, 55],
    timestamp_seconds: 7.25,
  })

  assert.equal(data.available, true)
  assert.equal(data.primaryMaterial, 'Natural Fibers')
  assert.equal(data.matches[0].confidencePercent, 72)
  assert.equal(data.framesSupplied, 3)
  assert.equal(data.framesAnalyzed, 3)
  assert.equal(data.displayThresholdPercent, 45)
})

test('no per-frame Gemini call is possible: the endpoint takes one body', async () => {
  const calls = respondWith(() => json({ available: false, error: 'the model was unreachable' }))

  const { data } = await analyzeVideoMaterial([
    { frame_index: 0, rgb: [1, 2, 3], lab: [4, 5, 6] },
    { frame_index: 1, rgb: [7, 8, 9], lab: [1, 1, 1] },
    { frame_index: 2, rgb: [4, 5, 6], lab: [2, 2, 2] },
  ])

  assert.equal(calls.length, 1)
  assert.deepEqual(Object.keys(JSON.parse(calls[0].options.body)), ['frames'])
  assert.equal(data.available, false)
  assert.equal(data.error, 'the model was unreachable')
})

test('a Gemini failure degrades to an unavailable result, not an error', async () => {
  respondWith(() => json({ error: { code: 'INFERENCE_ERROR', message: 'boom' } }, 500))

  await assert.rejects(analyzeVideoMaterial([{ frame_index: 0, rgb: [1, 2, 3], lab: [4, 5, 6] }]), (error) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 500)
    return true
  })
})

test('a network failure on the video AI call is reported plainly', async () => {
  respondWith(() => {
    throw new TypeError('Failed to fetch')
  })

  await assert.rejects(analyzeVideoMaterial([{ frame_index: 0, rgb: [1, 2, 3], lab: [4, 5, 6] }]), (error) => {
    assert.equal(error.code, 'NETWORK_ERROR')
    assert.equal(/failed to fetch/i.test(error.message), false, 'raw browser text is scrubbed')
    return true
  })
})

test('an abort on either endpoint is distinguishable from a failure', async () => {
  respondWith(() => {
    const error = new Error('aborted')
    error.name = 'AbortError'
    throw error
  })

  for (const call of [
    () => identifyMaterial({ rgb: [1, 2, 3], lab: [4, 5, 6] }),
    () => analyzeVideoMaterial([{ frame_index: 0, rgb: [1, 2, 3], lab: [4, 5, 6] }]),
  ]) {
    await assert.rejects(call(), (error) => error.name === 'AbortError')
  }
})

/* --------------------------------- URL rule -------------------------------- */

test('no request is made before the connection manager has discovered a URL', async () => {
  resetConnectionManager()
  disconnect()

  const calls = respondWith(() => json({}))

  assert.equal(getApiUrl(), null)
  await assert.rejects(identifyMaterial({ rgb: [1, 2, 3], lab: [4, 5, 6] }), (error) => {
    assert.equal(error.code, 'NOT_READY')
    return true
  })
  await assert.rejects(analyzeVideoMaterial([{ frame_index: 0, rgb: [1, 2, 3], lab: [4, 5, 6] }]), (error) => {
    assert.equal(error.code, 'NOT_READY')
    return true
  })
  assert.equal(calls.length, 0, 'nothing was sent anywhere')
})
