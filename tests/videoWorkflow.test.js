import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'

import { runVideoWorkflow } from '../src/services/videoWorkflow.js'
import {
  configureConnectionManager,
  connect,
  disconnect,
  resetConnectionManager,
  subscribeToState,
} from '../src/services/connectionManager.js'
import { resetPerformanceStore } from '../src/services/performanceStore.js'
import { buildVideoResultModel } from '../src/services/viewModel.js'

/**
 * End-to-end orchestration of the post-frame stage of the video workflow.
 *
 * These tests pin the behaviour that is easy to regress and invisible in the UI:
 * the deterministic endpoint receives the *aggregated* colour exactly once, the
 * Gemini endpoint is called exactly once with *every* frame's evidence, the fire
 * class comes from the deterministic answer, and either call failing leaves the
 * rest of the result intact.
 */

const previousFetch = globalThis.fetch
const API_URL = 'https://dynamically-discovered.example'

async function establishApiUrl() {
  const connectionFetch = async (url) => {
    if (String(url).includes('lambda-url')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ state: 'running', api_url: API_URL }),
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

const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

/** A `/analyze`-shaped frame result. */
const frameResult = ({ rgb, lab, detected = true, confidence = 0.82, areaRatio = 0.24 } = {}) => ({
  detection: { detected, confidence },
  segmentation: { maskUrl: 'data:image/png;base64,AAA=', confidence: 0.91, maskAreaRatio: areaRatio },
  color: { mean: { rgb, lab } },
})

const MATERIAL_RESPONSE = {
  success: true,
  material_analysis: {
    primary_material: 'Natural Fibers',
    similarity: 0.9268,
    alternatives: [
      { material: 'Paper Products(Wood material)', similarity: 0.8885 },
      { material: 'Wax Materials', similarity: 0.8885 },
      { material: 'Wood Materials', similarity: 0.8851 },
    ],
  },
  fire_class: { class: 'Class A', description: 'Ordinary combustibles', material: 'Natural Fibers' },
  extinguishing_agents: [{ name: 'Water', type: 'cooling', fire_class: 'Class A' }],
  suppression_information: { methods: ['Water', 'CO2'] },
}

const AI_RESPONSE = {
  available: true,
  primary_material: 'Natural Fibers',
  matches: [{ rank: 1, material: 'Natural Fibers', confidence_percent: 72 }],
  overall_confidence_level: 'medium',
  reasoning_summary: 'One consolidated assessment.',
  frames_supplied: 5,
  frames_analyzed: 5,
  display_threshold_percent: 45,
}

/** A clip of `count` frames, all analysed successfully with varying colours. */
function clip(count) {
  const frames = Array.from({ length: count }, (_, index) => ({
    index,
    timestamp: index * 2.5,
    dataUrl: `blob:frame-${index}`,
    file: { name: `frame-${index}.jpg` },
  }))

  const results = frames.map((_, index) => ({
    ok: true,
    data: frameResult({
      rgb: [200 + index, 110 + index, 30],
      lab: [60 + index / 10, 24, 55],
      confidence: 0.8 + index / 100,
      areaRatio: 0.2 + index / 100,
    }),
  }))

  return { frames, results }
}

/** Records every API call and answers each path from `handlers`. */
function stubApi(handlers) {
  const calls = []
  globalThis.fetch = async (url, options) => {
    const path = String(url).replace(API_URL, '')
    calls.push({ path, options, body: options.body ? JSON.parse(options.body) : null })
    const handler = handlers[path]
    if (!handler) throw new Error(`unexpected call to ${path}`)
    return handler(calls.length)
  }
  return calls
}

const defaultHandlers = {
  '/material-identification': () => json(MATERIAL_RESPONSE),
  '/video-material-analysis': () => json(AI_RESPONSE),
}

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

/* ------------------------------ happy path -------------------------------- */

test('a 5-frame clip makes exactly one deterministic call and one Gemini call', async () => {
  const calls = stubApi(defaultHandlers)

  const outcome = await runVideoWorkflow(clip(5))

  assert.deepEqual(
    calls.map((call) => call.path),
    ['/material-identification', '/video-material-analysis'],
    'two calls total, in that order',
  )
  assert.equal(
    calls.filter((call) => call.path === '/video-material-analysis').length,
    1,
    'one Gemini request for the whole clip',
  )
  assert.equal(outcome.insufficientFrames, false)
})

test('the deterministic endpoint receives the aggregated RGB and LAB', async () => {
  const calls = stubApi(defaultHandlers)
  const { frames, results } = clip(5)

  await runVideoWorkflow({ frames, results })

  const sent = calls[0].body
  assert.deepEqual(sent.rgb, [202, 112, 30], 'channel-wise mean of the five frames')
  assert.deepEqual(sent.lab, [60.2, 24, 55])
  assert.deepEqual(Object.keys(sent).sort(), ['lab', 'rgb'], 'nothing else is invented')
})

test('every analysed frame is present in the single Gemini request', async () => {
  const calls = stubApi(defaultHandlers)
  const { frames, results } = clip(10)

  await runVideoWorkflow({ frames, results })

  const sent = calls.find((call) => call.path === '/video-material-analysis').body
  assert.equal(sent.frames.length, 10, 'all ten frames in one request')
  assert.deepEqual(
    sent.frames.map((frame) => frame.frame_index),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  )
  assert.deepEqual(sent.frames[3], {
    frame_index: 3,
    rgb: [203, 113, 30],
    lab: [60.3, 24, 55],
    timestamp_seconds: 7.5,
    detection_confidence: 0.83,
    segmentation_confidence: 0.91,
    flame_area_ratio: 0.23,
  })
})

test('a 5-frame and a 10-frame clip differ only in how much evidence travels', async () => {
  const five = stubApi(defaultHandlers)
  await runVideoWorkflow(clip(5))
  const ten = stubApi(defaultHandlers)
  await runVideoWorkflow(clip(10))

  assert.equal(five.length, 2)
  assert.equal(ten.length, 2, 'still exactly two backend calls')
  assert.equal(five[1].body.frames.length, 5)
  assert.equal(ten[1].body.frames.length, 10)
})

/* ------------------------------ final result ------------------------------ */

const toModel = (outcome, frames) =>
  buildVideoResultModel({
    frames,
    aggregation: outcome.aggregation,
    materialIdentification: outcome.materialIdentification,
    materialIdentificationFailed: outcome.materialIdentificationFailed,
    videoAi: outcome.videoAi,
    measuredDurationMs: 4200,
    selectedFrameCount: frames.length,
    representativeCount: 3,
  })

test('the final result shows the deterministic material, its fire class and the AI card', async () => {
  stubApi(defaultHandlers)
  const { frames, results } = clip(5)
  const outcome = await runVideoWorkflow({ frames, results })

  const model = toModel(outcome, frames)

  assert.equal(model.material.name, 'Natural Fibers')
  assert.equal(model.material.title, 'Material Identification')
  assert.equal(model.material.alternatives.length, 3)
  assert.equal(model.fireClass.name, 'Class A')
  assert.equal(model.ai.primaryMaterial, 'Natural Fibers')
  assert.equal(model.ai.confidence, 72)
  assert.equal(model.flameColor.title, 'Average Flame Color')
  assert.equal(model.summary.flameFrameText, '5 / 5')
  assert.equal(model.summary.analyzedFrames, 5)
  assert.equal(model.summary.failedFrames, 0)
  assert.equal(model.gallery.length, 3, '2-3 representative frames')
})

test('the fire class is the deterministic one even when the AI names another material', async () => {
  stubApi({
    ...defaultHandlers,
    '/video-material-analysis': () =>
      json({
        ...AI_RESPONSE,
        primary_material: 'Synthetic Polymers',
        matches: [{ rank: 1, material: 'Synthetic Polymers', confidence_percent: 88 }],
      }),
  })

  const { frames, results } = clip(5)
  const model = toModel(await runVideoWorkflow({ frames, results }), frames)

  assert.equal(model.fireClass.name, 'Class A')
  assert.equal(model.fireClass.material, 'Natural Fibers')
  assert.equal(model.material.name, 'Natural Fibers')
  assert.equal(model.ai.primaryMaterial, 'Synthetic Polymers')
})

/* ------------------------------ error paths ------------------------------- */

test('a failed deterministic endpoint states unavailability and invents nothing', async () => {
  stubApi({
    ...defaultHandlers,
    '/material-identification': () =>
      json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'not ready' } }, 503),
  })

  const { frames, results } = clip(5)
  const outcome = await runVideoWorkflow({ frames, results })
  const model = toModel(outcome, frames)

  assert.equal(outcome.materialIdentification, null)
  assert.equal(outcome.materialIdentificationFailed, true)
  assert.equal(model.material, null)
  assert.equal(model.summary.materialUnavailable, true)
  assert.equal(model.ai.available, true, 'Gemini still ran')
  assert.equal(model.flameColor.swatch, 'rgb(202, 112, 30)')
})

test('a failed Gemini endpoint leaves the deterministic analysis untouched', async () => {
  stubApi({
    ...defaultHandlers,
    '/video-material-analysis': () => json({ error: { code: 'INFERENCE_ERROR', message: 'boom' } }, 500),
  })

  const { frames, results } = clip(5)
  const outcome = await runVideoWorkflow({ frames, results })
  const model = toModel(outcome, frames)

  assert.equal(outcome.videoAi, null)
  assert.equal(model.ai, null, 'the AI card is omitted, not empty')
  assert.equal(model.material.name, 'Natural Fibers')
  assert.equal(model.fireClass.name, 'Class A')
  assert.equal(model.hasContent, true)
})

test('an AI result below the threshold omits the card but keeps the run', async () => {
  stubApi({
    ...defaultHandlers,
    '/video-material-analysis': () =>
      json({
        ...AI_RESPONSE,
        matches: [{ rank: 1, material: 'Natural Fibers', confidence_percent: 44.9 }],
      }),
  })

  const { frames, results } = clip(5)
  const model = toModel(await runVideoWorkflow({ frames, results }), frames)

  assert.equal(model.ai, null)
  assert.equal(model.material.name, 'Natural Fibers')
})

test('a few failed frames are tolerated; the rest of the clip still reports', async () => {
  stubApi(defaultHandlers)
  const { frames, results } = clip(5)
  results[1] = { ok: false, error: 'frame-failed' }
  results[3] = { ok: false, error: 'frame-failed' }

  const calls = stubApi(defaultHandlers)
  const outcome = await runVideoWorkflow({ frames, results })
  const model = toModel(outcome, frames)

  assert.equal(outcome.insufficientFrames, false)
  assert.equal(model.summary.failedFrames, 2)
  assert.equal(model.summary.successfulFrames, 3)
  assert.equal(
    calls.find((call) => call.path === '/video-material-analysis').body.frames.length,
    3,
    'only the analysed frames travel',
  )
  assert.equal(model.material.name, 'Natural Fibers')
})

test('a mostly-failed run stops before either extra call', async () => {
  const calls = stubApi(defaultHandlers)
  const { frames, results } = clip(10)
  for (let index = 0; index < 7; index += 1) results[index] = { ok: false, error: 'frame-failed' }

  const outcome = await runVideoWorkflow({ frames, results })

  assert.equal(outcome.insufficientFrames, true)
  assert.equal(calls.length, 0, 'no material or AI call is made from failed frames')
})

test('a clip with no usable colour makes neither extra call and invents nothing', async () => {
  const { frames, results } = clip(3)
  for (const result of results) {
    result.ok = true
    result.data = { detection: { detected: false, confidence: 0.1 }, color: { mean: null } }
  }

  const calls = stubApi(defaultHandlers)
  const outcome = await runVideoWorkflow({ frames, results })
  const model = toModel(outcome, frames)

  assert.deepEqual(calls.map((call) => call.path), [], 'no colour means nothing to send')
  assert.equal(outcome.materialIdentification, null)
  assert.equal(outcome.materialIdentificationFailed, false)
  assert.equal(outcome.videoAi, null)
  assert.equal(model.material, null)
  assert.equal(model.ai, null)
  assert.equal(model.flameColor, null, 'no colour is fabricated from nothing')
  assert.equal(model.detection.detected, false)
  assert.equal(model.summary.failedFrames, 0)
})

test('an aborted run propagates the cancellation instead of swallowing it', async () => {
  const controller = new AbortController()
  stubApi({
    '/material-identification': () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    },
  })

  await assert.rejects(
    runVideoWorkflow({ ...clip(5), signal: controller.signal }),
    (error) => error.name === 'AbortError',
  )
})
