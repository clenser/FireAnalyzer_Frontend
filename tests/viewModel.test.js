import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normaliseResponse } from '../src/services/normalize.js'
import { buildImageResultModel, buildVideoResultModel } from '../src/services/viewModel.js'
import { aggregateFrameResults } from '../src/utils/aggregate.js'

/**
 * A realistic raw `/analyze` payload, straight from the documented contract.
 * Going through `normaliseResponse` keeps these tests honest: they fail if
 * either the normaliser or the view model drifts.
 */
const rawImageResponse = (overrides = {}) => ({
  fire_detection: {
    detected: true,
    confidence: 0.9,
    bounding_box: { x1: 10, y1: 20, x2: 200, y2: 180 },
  },
  segmentation: {
    available: true,
    fallback_used: false,
    flame_pixel_count: 12000,
    mask_area_ratio: 0.31,
    mask: 'AAAA',
    mask_encoding: 'png_base64',
    mask_width: 1920,
    mask_height: 1080,
  },
  flame_analysis: {
    mean_flame_color: { rgb: [220.4, 120.2, 30.1], lab: [63.1, 24.2, 57.4] },
    flame_pixel_count: 12000,
    n_clusters: 3,
    samples_used: 5000,
    pixels_sampled: true,
    algorithms: {
      kmeans_pp: {
        cluster_count: 3,
        samples_used: 5000,
        centroids: [{ cluster_id: 0, rgb: [200, 120, 30], pixel_count: 900, weight: 0.5 }],
        dominant_cluster: 0,
        noise_count: 12,
      },
      gmm: { cluster_count: 2, component_count: 3, samples_used: 5000 },
      dbscan: { cluster_count: 2, noise_count: 8, noise_percentage: 1.2 },
    },
    zones: {
      inner_core: { weight: 0.4, pixel_count: 5000, percentage_of_mask: 40, mean_color: { rgb: [255, 200, 40] } },
      middle_transition: { weight: 0.35, pixel_count: 4000, percentage_of_mask: 35, mean_color: { rgb: [240, 130, 30] } },
      outer_radiative: { weight: 0.25, pixel_count: 3000, percentage_of_mask: 25, mean_color: { rgb: [180, 80, 20] } },
    },
  },
  material_analysis: {
    primary_material: 'Cooking Oils',
    similarity: 0.78,
    alternatives: [
      { material: 'Animal Fats', similarity: 0.61 },
      { material: 'Wood Materials', similarity: 0.44 },
      { material: 'Paper Products', similarity: 0.2 },
      { material: 'Polymeric Materials', similarity: 0.1 },
    ],
    database_notes: 'amber hue with low blue channel',
  },
  ai_material_analysis: {
    available: true,
    primary_material: 'Cooking Oils',
    overall_confidence_level: 'high',
    uncertain: false,
    reasoning_summary: 'Deep amber hue typical of overheated cooking oil.',
    matches: [
      { rank: 1, material: 'Cooking Oils', confidence_percent: 68, reason: 'Deep amber' },
      { rank: 2, material: 'Wood Materials', confidence_percent: 15 },
    ],
  },
  fire_class: { class: 'K', description: 'Cooking media', confidence: 0.82, material: 'Cooking Oils' },
  extinguishing_agents: [
    { name: 'Class K extinguisher', type: 'wet chemical', compound: null, fire_class: 'K' },
    { name: 'AFFF foam', type: 'foam', fire_class: 'B' },
  ],
  suppression_information: { methods: ['Wet chemical', 'Foam blanket'], source: 'database' },
  timing: { total_ms: 8200, detection_ms: 900, segmentation_ms: 2100, color_ms: 3000, material_ms: 400 },
  ...overrides,
})

const imageData = (overrides) => normaliseResponse(rawImageResponse(overrides))

/** Per-frame `/analyze` results for a 4-frame clip. */
const rawFrameResults = (count = 4) =>
  Array.from({ length: count }, (_, index) => ({
    ok: true,
    data: normaliseResponse(
      rawImageResponse({
        fire_detection: { detected: true, confidence: 0.7 + index / 100 },
        flame_analysis: {
          mean_flame_color: { rgb: [210, 110, 30], lab: [62, 24, 55] },
        },
        ai_material_analysis: {
          available: true,
          matches: [{ rank: 1, material: 'Cooking Oils', confidence_percent: 60 }],
        },
      }),
    ),
  }))

function videoFixture({
  results = rawFrameResults(4),
  materialIdentification = null,
  videoAi = null,
  materialIdentificationFailed = false,
  ...rest
} = {}) {
  const frames = results.map((_, index) => ({
    index,
    timestamp: index * 4,
    dataUrl: `blob:frame-${index}`,
  }))

  return {
    frames,
    aggregation: aggregateFrameResults(frames, results),
    materialIdentification,
    materialIdentificationFailed,
    videoAi,
    measuredDurationMs: 8200,
    selectedFrameCount: frames.length,
    representativeCount: 3,
    ...rest,
  }
}

/** A normalised `POST /material-identification` response, as the hook stores it. */
const rawMaterialIdentification = (overrides = {}) => ({
  success: true,
  material: {
    name: 'Cooking Oils',
    similarity: 0.78,
    alternatives: [
      { name: 'Animal Fats', similarity: 0.61 },
      { name: 'Wood Materials', similarity: 0.44 },
      { name: 'Paper Products', similarity: 0.2 },
    ],
  },
  fireClass: { name: 'K', description: 'Cooking media', confidence: 0.78, material: 'Cooking Oils' },
  agents: [
    { name: 'Class K extinguisher', type: 'wet chemical' },
    { name: 'AFFF foam', type: 'foam' },
  ],
  suppression: { methods: ['Wet chemical', 'Foam blanket'] },
  ...overrides,
})

/** A normalised `POST /video-material-analysis` response: ONE result. */
const rawVideoAi = (overrides = {}) => ({
  available: true,
  primaryMaterial: 'Natural Fibers',
  matches: [
    { rank: 1, material: 'Natural Fibers', confidencePercent: 72, reason: 'consistent' },
    { rank: 2, material: 'Paper Products', confidencePercent: 58 },
  ],
  overallConfidenceLevel: 'medium',
  evidenceQuality: 'moderate',
  reasoningSummary: 'One consolidated assessment for the whole clip.',
  framesSupplied: 4,
  framesAnalyzed: 4,
  displayThresholdPercent: 45,
  ...overrides,
})

/* --------------------------------- image --------------------------------- */

test('the image model projects the whole payload into a renderable result', () => {
  const model = buildImageResultModel({
    data: imageData(),
    previewUrl: 'blob:preview',
    dimensions: { width: 1920, height: 1080 },
    measuredDurationMs: 8200,
  })

  assert.equal(model.kind, 'image')
  assert.equal(model.hasContent, true)
  assert.equal(model.detection.headline, 'Flame detected')
  assert.equal(model.flameColor.swatch, 'rgb(220, 120, 30)')
  assert.equal(model.material.name, 'Cooking Oils')
  assert.equal(model.material.title, 'Material Identification')
  assert.equal(model.ai.available, true)
  assert.equal(model.fireClass.name, 'K')
  assert.deepEqual(model.fireClass.agents.map((a) => a.name), ['Class K extinguisher', 'AFFF foam'])
  assert.equal(model.duration.label, 'Completed in 8.2s')
})

test('the analysed image keeps the real mask overlay and its aspect ratio', () => {
  const model = buildImageResultModel({
    data: imageData(),
    previewUrl: 'blob:preview',
    dimensions: { width: 1920, height: 1080 },
  })

  assert.equal(model.flameImage.src, 'blob:preview')
  assert.equal(model.flameImage.maskUrl, 'data:image/png;base64,AAAA')
  assert.equal(model.flameImage.hasMask, true)
  assert.equal(model.flameImage.aspectRatio, '1920 / 1080')
})

test('an image with no usable dimensions still gets a sane preview ratio', () => {
  const model = buildImageResultModel({ data: imageData(), dimensions: { width: 0, height: 0 } })
  assert.equal(model.flameImage.aspectRatio, '4 / 3')
})

test('no image data yields no result at all', () => {
  assert.equal(buildImageResultModel({ data: null }), null)
  assert.equal(buildImageResultModel(), null)
})

test('developer-facing internals never reach the image model', () => {
  const serialised = JSON.stringify(
    buildImageResultModel({ data: imageData(), previewUrl: 'blob:preview' }),
  )

  for (const leak of [
    'kmeans_pp',
    'cluster_id',
    'clusterCount',
    'centroid',
    'inertia',
    'noise_count',
    'zones',
    'inner_core',
    'total_ms',
    'detection_ms',
    'timing',
    'database_notes',
    'boundingBox',
    'maskWidth',
    'maskHeight',
    'flamePixelCount',
    'samplesUsed',
  ]) {
    assert.equal(serialised.includes(leak), false, `"${leak}" must not reach the UI`)
  }
})

test('a material is not rendered when the backend did not identify one', () => {
  const model = buildImageResultModel({ data: imageData({ material_analysis: null }) })
  assert.equal(model.material, null)
})

test('at most three alternative materials are shown', () => {
  const model = buildImageResultModel({ data: imageData() })
  assert.equal(model.material.alternatives.length, 3, 'the 4th alternative is dropped')
})

test('the AI card is hidden entirely when the backend could not run the model', () => {
  const model = buildImageResultModel({
    data: imageData({ ai_material_analysis: { available: false, error: 'model timeout' } }),
  })

  assert.equal(model.ai, null, 'no empty card, no unavailable copy')
})

test('a confidence below the display threshold hides the AI card', () => {
  const model = buildImageResultModel({
    data: imageData({
      ai_material_analysis: {
        available: true,
        matches: [{ rank: 1, material: 'Wood Materials', confidence_percent: 44.9 }],
      },
    }),
  })

  assert.equal(model.ai, null)
})

test('a missing confidence hides the AI card', () => {
  const model = buildImageResultModel({
    data: imageData({
      ai_material_analysis: { available: true, matches: [{ rank: 1, material: 'Wood Materials' }] },
    }),
  })

  assert.equal(model.ai, null)
})

test('a malformed AI section hides the card instead of crashing', () => {
  const model = buildImageResultModel({
    data: imageData({ ai_material_analysis: { available: true, matches: 'nonsense' } }),
  })
  assert.equal(model.ai, null)
})

test('a confidence exactly on the threshold still shows the card', () => {
  const model = buildImageResultModel({
    data: imageData({
      ai_material_analysis: {
        available: true,
        matches: [{ rank: 1, material: 'Wood Materials', confidence_percent: 45 }],
      },
    }),
  })

  assert.equal(model.ai.available, true)
  assert.equal(model.ai.confidenceText, '45.0%')
  assert.equal(model.ai.primaryMaterial, 'Wood Materials')
})

test('a strong AI confidence is shown as-is, with no uncertainty note to mislead', () => {
  const model = buildImageResultModel({ data: imageData() })

  assert.equal(model.ai.available, true)
  assert.equal(model.ai.confidence, 68)
  assert.equal(model.ai.confidenceText, '68.0%')
  assert.equal(model.ai.uncertain, undefined, 'the note no longer exists')
})

test('a detection payload with no confidence still renders its status', () => {
  const model = buildImageResultModel({
    data: imageData({ fire_detection: { detected: false } }),
  })

  assert.equal(model.detection.detected, false)
  assert.equal(model.detection.headline, 'No flame detected')
  assert.equal(model.detection.confidence, null)
  assert.equal(model.detection.confidenceRatio, null)
})

test('suppression methods are only used when there is no fire class card', () => {
  const withClass = buildImageResultModel({ data: imageData() })
  assert.equal(withClass.suppression.methods.length, 2)
  assert.equal(withClass.fireClass.name, 'K', 'the class card wins the same grid slot')

  const noClass = buildImageResultModel({
    data: imageData({ fire_class: null, extinguishing_agents: [] }),
  })
  assert.equal(noClass.fireClass, null)
  assert.equal(noClass.suppression.methods.length, 2)
})

test('no duration is claimed when none was measured', () => {
  const model = buildImageResultModel({ data: imageData(), measuredDurationMs: null })
  assert.equal(model.duration, null)
})

/* --------------------------------- video --------------------------------- */

test('per-frame results merge into one video summary', () => {
  const model = buildVideoResultModel(videoFixture())

  assert.equal(model.kind, 'video')
  assert.equal(model.summary.analyzedFrames, 4)
  assert.equal(model.summary.successfulFrames, 4)
  assert.equal(model.summary.failedFrames, 0)
  assert.equal(model.summary.flameFrames, 4)
  assert.equal(model.summary.reliable, true)
  assert.equal(model.summary.flameFrameText, '4 / 4')
  assert.equal(model.summary.warning, null)
})

test('the video summary shows only the three counts and no explanatory prose', () => {
  const model = buildVideoResultModel(videoFixture())
  const serialised = JSON.stringify(model.summary)

  for (const verbosity of ['notice', 'colorBasisNote', 'sampled frames', 'analyzed successfully']) {
    assert.equal(serialised.includes(verbosity), false, `"${verbosity}" must not reach the UI`)
  }
})

test('the video summary reports the real measured duration, not an estimate', () => {
  const model = buildVideoResultModel(videoFixture())
  assert.equal(model.duration.label, 'Completed in 8.2s')
})

test('no measured duration is shown when nothing was timed', () => {
  const model = buildVideoResultModel(videoFixture({ measuredDurationMs: null }))
  assert.equal(model.duration, null)
})

test('a partially failed run still produces a result', () => {
  const results = rawFrameResults(4)
  results[2] = { ok: false, error: 'frame-failed' }
  const model = buildVideoResultModel(videoFixture({ results }))

  assert.equal(model.summary.successfulFrames, 3)
  assert.equal(model.summary.failedFrames, 1)
  assert.equal(model.summary.reliable, true, '3 of 4 is still a usable result')
})

test('a run too weak to trust is warned about', () => {
  const results = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) =>
    index < 3 ? rawFrameResults(1)[0] : { ok: false, error: 'frame-failed' },
  )
  const model = buildVideoResultModel(videoFixture({ results }))

  assert.equal(model.summary.successfulFrames, 3)
  assert.equal(model.summary.reliable, false)
  assert.match(model.summary.warning, /not enough valid frames/i)
})

test('the video colour is the average of the analysed frames, labelled as such', () => {
  const model = buildVideoResultModel(videoFixture())

  assert.equal(model.flameColor.title, 'Average Flame Color')
  assert.equal(model.flameColor.average, true)
  assert.equal(model.flameColor.swatch, 'rgb(210, 110, 30)')
})

test('the average flame colour shows only the swatch, RGB and LAB', () => {
  const model = buildVideoResultModel(videoFixture())

  assert.equal(model.flameColor.title, 'Average Flame Color')
  assert.equal(model.flameColor.average, true)
  assert.equal(model.flameColor.swatch, 'rgb(210, 110, 30)')
  assert.equal(model.flameColor.rgb, 'rgb(210, 110, 30)')
  assert.equal(model.flameColor.lab, 'L 62.0 · a 24.0 · b 55.0')
  assert.deepEqual(Object.keys(model.flameColor).sort(), [
    'average',
    'hasLab',
    'hasRgb',
    'lab',
    'rgb',
    'swatch',
    'title',
  ])
})

test('a clip with no detected flame says so without inventing a colour basis note', () => {
  const results = rawFrameResults(3).map((result) => ({
    ok: true,
    data: { ...result.data, detection: { detected: false, confidence: 0.2, boundingBox: null } },
  }))
  const model = buildVideoResultModel(videoFixture({ results }))

  assert.equal(model.summary.anyFlame, false)
  assert.equal(model.detection.headline, 'No flame seen in the analyzed frames')
  assert.equal(model.summary.colorBasisNote, undefined)
})

test('at most three analysed frames are offered in the gallery', () => {
  const model = buildVideoResultModel(videoFixture())
  assert.equal(model.gallery.length, 3)
  assert.deepEqual(
    model.gallery.map((frame) => frame.key),
    ['frame-0', 'frame-2', 'frame-3'],
    'spread across the clip',
  )
  assert.equal(model.gallery.every((frame) => frame.hasMask), true)
})

test('failed frames never reach the gallery', () => {
  const results = rawFrameResults(4)
  results[1] = { ok: false, error: 'frame-failed' }
  const model = buildVideoResultModel(videoFixture({ results }))

  assert.equal(model.gallery.length, 3)
  assert.equal(model.gallery.some((frame) => frame.key === 'frame-1'), false)
})

test('a clip where every frame failed still renders a result', () => {
  const results = [0, 1, 2].map(() => ({ ok: false, error: 'frame-failed' }))
  const model = buildVideoResultModel(videoFixture({ results }))

  assert.equal(model.kind, 'video')
  assert.equal(model.summary.successfulFrames, 0)
  assert.equal(model.summary.reliable, false)
  assert.equal(model.gallery.length, 0)
  assert.equal(model.flameColor, null, 'no colour is invented from failed frames')
})

test('the video AI card shows the single consolidated backend result', () => {
  const model = buildVideoResultModel(videoFixture({ videoAi: rawVideoAi() }))

  assert.equal(model.ai.available, true)
  assert.equal(model.ai.aggregated, true)
  assert.equal(model.ai.primaryMaterial, 'Natural Fibers')
  assert.equal(model.ai.confidence, 72)
  assert.equal(model.ai.confidenceText, '72.0%')
  assert.deepEqual(
    model.ai.matches.map((match) => match.material),
    ['Natural Fibers', 'Paper Products'],
  )
})

test('the video AI card is hidden below the display threshold', () => {
  const below = buildVideoResultModel(
    videoFixture({
      videoAi: rawVideoAi({
        matches: [{ rank: 1, material: 'Natural Fibers', confidencePercent: 44.9 }],
      }),
    }),
  )
  assert.equal(below.ai, null)

  const onThreshold = buildVideoResultModel(
    videoFixture({
      videoAi: rawVideoAi({
        matches: [{ rank: 1, material: 'Natural Fibers', confidencePercent: 45 }],
      }),
    }),
  )
  assert.equal(onThreshold.ai.available, true)
})

test('the video AI card is hidden when Gemini reported no usable result', () => {
  const model = buildVideoResultModel(
    videoFixture({
      videoAi: { available: false, matches: [], error: 'the model could not be reached' },
    }),
  )
  assert.equal(model.ai, null)
})

test('a Gemini failure never removes the deterministic results', () => {
  const model = buildVideoResultModel(
    videoFixture({ videoAi: null, materialIdentification: rawMaterialIdentification() }),
  )

  assert.equal(model.ai, null)
  assert.equal(model.material.name, 'Cooking Oils')
  assert.equal(model.fireClass.name, 'K')
  assert.equal(model.hasContent, true)
})

test('the video material card is filled from the deterministic endpoint response', () => {
  const model = buildVideoResultModel(
    videoFixture({ materialIdentification: rawMaterialIdentification() }),
  )

  assert.equal(model.material.name, 'Cooking Oils')
  assert.equal(model.material.title, 'Material Identification')
  assert.equal(model.material.similarity, '78.0%')
  assert.equal(model.material.alternatives.length, 3, 'at most three alternatives')
  assert.equal(model.fireClass.name, 'K')
  assert.equal(model.summary.materialUnavailable, false)
})

test('a failed deterministic endpoint is stated, never invented', () => {
  const model = buildVideoResultModel(
    videoFixture({ materialIdentification: null, materialIdentificationFailed: true }),
  )

  assert.equal(model.material, null, 'no material is fabricated')
  assert.equal(model.summary.materialUnavailable, true, 'the card says so')
  assert.equal(model.flameColor.swatch, 'rgb(210, 110, 30)', 'the measurements still stand')
  assert.equal(model.hasContent, true)
})

test('the video fire class comes from the deterministic material, not from the AI', () => {
  const model = buildVideoResultModel(
    videoFixture({
      materialIdentification: rawMaterialIdentification(),
      // The AI named a completely different material; it must not move the class.
      videoAi: rawVideoAi({ primaryMaterial: 'Synthetic Polymers', matches: [{ rank: 1, material: 'Synthetic Polymers', confidencePercent: 90 }] }),
    }),
  )

  assert.equal(model.fireClass.name, 'K')
  assert.equal(model.fireClass.material, 'Cooking Oils')
  assert.equal(model.material.name, 'Cooking Oils')
  assert.equal(model.ai.primaryMaterial, 'Synthetic Polymers')
  assert.deepEqual(
    model.fireClass.agents.map((agent) => agent.name),
    ['Class K extinguisher', 'AFFF foam'],
  )
})

test('no per-frame AI confidence is ever averaged into the video result', () => {
  const results = rawFrameResults(4)
  // Four frames, wildly different per-frame confidences. The consolidated
  // backend answer is 60%; averaging or picking the best frame must not appear.
  results[0] = {
    ok: true,
    data: {
      ...results[0].data,
      aiMaterialAnalysis: {
        available: true,
        matches: [{ rank: 1, material: 'Cooking Oils', confidencePercent: 95 }],
      },
    },
  }
  results[3] = {
    ok: true,
    data: {
      ...results[3].data,
      aiMaterialAnalysis: {
        available: true,
        matches: [{ rank: 1, material: 'Wax Materials', confidencePercent: 12 }],
      },
    },
  }

  const model = buildVideoResultModel(
    videoFixture({
      results,
      videoAi: rawVideoAi({
        primaryMaterial: 'Natural Fibers',
        matches: [{ rank: 1, material: 'Natural Fibers', confidencePercent: 60 }],
      }),
    }),
  )

  assert.equal(model.ai.primaryMaterial, 'Natural Fibers')
  assert.equal(model.ai.confidence, 60)
  assert.equal(JSON.stringify(model).includes('Cooking Oils'), false, 'no frame opinion leaks in')
  assert.equal(JSON.stringify(model).includes('Wax Materials'), false)
})

test('developer-facing internals never reach the video model', () => {
  const serialised = JSON.stringify(buildVideoResultModel(videoFixture()))

  for (const leak of ['kmeans_pp', 'centroid', 'zones', 'timing', 'total_ms', 'boundingBox', 'maskWidth']) {
    assert.equal(serialised.includes(leak), false, `"${leak}" must not reach the UI`)
  }
})
