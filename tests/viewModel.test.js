import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normaliseImageResponse, normaliseVideoResponse } from '../src/services/normalize.js'
import { buildImageResultModel, buildVideoResultModel } from '../src/services/viewModel.js'

/**
 * A realistic raw `/analyze` payload. Going through `normaliseImageResponse`
 * keeps these tests honest: they fail if either the normaliser or the view
 * model drifts from the current backend contract.
 */
const rawImageResponse = (overrides = {}) => ({
  cached: false,
  detection_count: 1,
  fire_detection: { detected: true, confidence: 0.9, bounding_box: { x1: 10, y1: 20, x2: 200, y2: 180 } },
  detections: [{ index: 0, confidence: 0.9, bounding_box: { x1: 10, y1: 20, x2: 200, y2: 180 } }],
  segmentation: { available: true, flame_pixel_count: 12000, mask: 'AAAA', mask_encoding: 'png_base64' },
  flame_analysis: { mean_color: { rgb: [220.4, 120.2, 30.1], lab: [63.1, 24.2, 57.4] } },
  final_material: 'Cooking Oils',
  confidence: 0.78,
  confidence_percent: 78,
  confidence_level: 'high',
  uncertain: false,
  candidate_materials: [
    { material: 'Cooking Oils', score: 0.78 },
    { material: 'Animal Fats', score: 0.61 },
    { material: 'Wood Materials', score: 0.44 },
    { material: 'Paper Products', score: 0.2 },
  ],
  deterministic_evidence: {
    available: true,
    evidence_quality: 'strong',
    ranking: [
      { material: 'Cooking Oils', similarity: 0.78 },
      { material: 'Animal Fats', similarity: 0.61 },
    ],
  },
  vision_evidence: {
    vision_provider: 'groq',
    available: true,
    candidates: [{ material: 'Cooking Oils', confidence: 0.68 }],
  },
  ai_material_analysis: {
    available: true,
    primary_material: 'Cooking Oils',
    overall_confidence_level: 'high',
    uncertain: false,
    matches: [
      { rank: 1, material: 'Cooking Oils', confidence_percent: 68, reason: 'Deep amber' },
      { rank: 2, material: 'Wood Materials', confidence_percent: 15 },
    ],
  },
  fire_class: { class: 'K', description: 'Cooking media', confidence: 0.82, material: 'Cooking Oils' },
  extinguishing_agents: [
    { name: 'Class K extinguisher', type: 'wet chemical', fire_class: 'K' },
    { name: 'AFFF foam', type: 'foam', fire_class: 'B' },
  ],
  suppression_information: { methods: ['Wet chemical', 'Foam blanket'], source: 'database' },
  ...overrides,
})

const imageData = (overrides) => normaliseImageResponse(rawImageResponse(overrides))

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
  assert.equal(model.ai.available, true)
  assert.equal(model.fireClass.name, 'K')
  assert.deepEqual(model.fireClass.agents.map((a) => a.name), ['Class K extinguisher', 'AFFF foam'])
  assert.equal(model.duration.label, 'Completed in 8.2s')
})

test('the analysed image keeps the real merged mask overlay and its aspect ratio', () => {
  const model = buildImageResultModel({
    data: imageData(),
    previewUrl: 'blob:preview',
    dimensions: { width: 1920, height: 1080 },
  })

  assert.equal(model.flameImage.src, 'blob:preview')
  assert.equal(model.flameImage.maskUrl, 'data:image/png;base64,AAAA')
  assert.equal(model.flameImage.aspectRatio, '1920 / 1080')
})

test('multiple detections surface a region count without implying the boxes were merged', () => {
  const model = buildImageResultModel({
    data: imageData({
      detection_count: 3,
      detections: [
        { index: 0, confidence: 0.9 },
        { index: 1, confidence: 0.6 },
        { index: 2, confidence: 0.5 },
      ],
    }),
  })

  assert.equal(model.detection.multipleDetections, true)
  assert.equal(model.detection.regionsText, '3 flame regions detected')
  assert.equal(model.flameImage.regionsText, '3 flame regions detected')
  assert.equal(model.detection.detections.length, 3)
})

test('a single detection reports no region count', () => {
  const model = buildImageResultModel({ data: imageData() })
  assert.equal(model.detection.multipleDetections, false)
  assert.equal(model.detection.regionsText, null)
})

test('no image data yields no result at all', () => {
  assert.equal(buildImageResultModel({ data: null }), null)
  assert.equal(buildImageResultModel(), null)
})

test('an uncertain fusion decision states so and never invents a material', () => {
  const model = buildImageResultModel({
    data: imageData({
      final_material: null,
      uncertain: true,
      uncertainty_reasons: ['leading materials are effectively tied: Cooking Oils, Animal Fats'],
    }),
  })

  assert.equal(model.material.uncertain, true)
  assert.equal(model.material.name, null)
  assert.deepEqual(model.material.reasons, ['leading materials are effectively tied: Cooking Oils, Animal Fats'])
})

test('an uncertain result shows exactly the #1 colour match and the #1 vision match - never a combined ranking', () => {
  const model = buildImageResultModel({
    data: imageData({
      final_material: null,
      uncertain: true,
      uncertainty_reasons: ['fused confidence 0.30 is below 0.45'],
      deterministic_evidence: {
        available: true,
        evidence_quality: 'strong',
        ranking: [
          { material: 'Cooking Oils', similarity: 0.973 },
          { material: 'Animal Fats', similarity: 0.6 },
        ],
      },
      vision_evidence: {
        vision_provider: 'groq',
        available: true,
        candidates: [
          { material: 'Natural Fibers', confidence: 0.8 },
          { material: 'Wood Materials', confidence: 0.2 },
        ],
      },
    }),
  })

  assert.equal(model.material.hasTopMatches, true)
  assert.deepEqual(model.material.topMatches.colour, {
    label: 'Colour',
    name: 'Cooking Oils',
    confidence: '97.3%',
  })
  assert.deepEqual(model.material.topMatches.vision, {
    label: 'Groq',
    name: 'Natural Fibers',
    confidence: '80.0%',
  })
})

test('a vision provider label is read dynamically from the backend, never hardcoded', () => {
  const model = buildImageResultModel({
    data: imageData({
      final_material: null,
      uncertain: true,
      vision_evidence: { vision_provider: 'gemini', available: true, candidates: [{ material: 'Wax Materials', confidence: 0.5 }] },
    }),
  })
  assert.equal(model.material.topMatches.vision.label, 'Gemini')
})

test('a missing vision result shows only the colour match, never a fabricated AI row', () => {
  const model = buildImageResultModel({
    data: imageData({
      final_material: null,
      uncertain: true,
      vision_evidence: { vision_provider: 'none', available: false, candidates: [] },
    }),
  })
  assert.equal(model.material.hasTopMatches, true)
  assert.ok(model.material.topMatches.colour)
  assert.equal(model.material.topMatches.vision, null)
})

test('a cached image result never reports a fresh analysis', () => {
  const model = buildImageResultModel({ data: imageData({ cached: true }), wasForced: false })
  assert.equal(model.cached, true)
  assert.equal(model.wasForced, false)
})

test('force_new_analysis is surfaced on the model, distinct from a cache hit', () => {
  const model = buildImageResultModel({ data: imageData({ cached: false }), wasForced: true })
  assert.equal(model.wasForced, true)
  assert.equal(model.cached, false)
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
})

test('the analysis evidence disclosure carries the colour ranking and vision candidates', () => {
  const model = buildImageResultModel({
    data: imageData({
      deterministic_evidence: {
        available: true,
        evidence_quality: 'strong',
        ranking: [{ material: 'Cooking Oils', similarity: 0.78 }],
      },
      vision_evidence: {
        vision_provider: 'groq',
        available: true,
        candidates: [{ material: 'Cooking Oils', confidence: 0.8 }],
      },
    }),
  })

  assert.equal(model.evidence.evidenceQuality, 'Strong')
  assert.equal(model.evidence.ranking[0].material, 'Cooking Oils')
  assert.equal(model.evidence.visionProvider, 'Groq')
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

test('a cached result is surfaced on the model', () => {
  const model = buildImageResultModel({ data: imageData({ cached: true }) })
  assert.equal(model.cached, true)
})

/* --------------------------------- video --------------------------------- */

const rawVideoResponse = (overrides = {}) => ({
  cached: false,
  video: { frame_count: 240, fps: 24, duration_seconds: 10, frames_sampled: 4, frames_requested: 4 },
  frames_with_flame: 4,
  final_material: 'Wood Materials',
  confidence: 0.72,
  confidence_percent: 72,
  confidence_level: 'medium',
  uncertain: false,
  candidate_materials: [
    { material: 'Wood Materials', frames: 3, mean_confidence: 0.72 },
    { material: 'Paper Products', frames: 1, mean_confidence: 0.4 },
  ],
  consolidated: { frames_sampled: 4, frames_analyzed: 4, frames_with_decision: 4, uncertain_frames: 0 },
  fire_class: { class: 'A', description: 'Ordinary combustibles' },
  extinguishing_agents: [{ name: 'Water', type: 'cooling' }],
  representative_frames: [
    {
      success: true,
      frame_index: 0,
      timestamp_seconds: 0,
      detection_count: 1,
      fire_detection: { detected: true, confidence: 0.9 },
      segmentation: { mask: 'AAAA', mask_encoding: 'png_base64' },
      final_material: 'Wood Materials',
      confidence: 0.72,
      confidence_percent: 72,
      uncertain: false,
      fire_class: { class: 'A' },
      thumbnail: { encoding: 'jpeg_base64', data: 'ab==' },
    },
  ],
  frames: [
    {
      success: true,
      frame_index: 0,
      timestamp_seconds: 0,
      final_material: 'Wood Materials',
      confidence: 0.72,
      uncertain: false,
      thumbnail: { encoding: 'jpeg_base64', data: 'ab==' },
    },
    { success: false, frame_index: 1, timestamp_seconds: 2.5, error: { code: 'NO_FIRE_DETECTED', message: 'No flame.' } },
  ],
  ...overrides,
})

const videoData = (overrides) => normaliseVideoResponse(rawVideoResponse(overrides))

test('the video model reads the backend consolidated decision directly', () => {
  const model = buildVideoResultModel({ data: videoData(), measuredDurationMs: 8200 })

  assert.equal(model.kind, 'video')
  assert.equal(model.hasContent, true)
  assert.equal(model.material.name, 'Wood Materials')
  assert.equal(model.fireClass.name, 'A')
  assert.equal(model.summary.framesSampled, 4)
  assert.equal(model.summary.framesWithFlame, 4)
  assert.equal(model.duration.label, 'Completed in 8.2s')
})

test('the gallery uses the backend-selected representative frames directly', () => {
  const model = buildVideoResultModel({ data: videoData() })
  assert.equal(model.gallery.length, 1)
  assert.equal(model.gallery[0].label, 'Frame 1')
  assert.equal(model.gallery[0].dataUrl, 'data:image/jpeg;base64,ab==')
  assert.equal(model.gallery[0].materialName, 'Wood Materials')
})

test('every analysed frame is available, including a failed one', () => {
  const model = buildVideoResultModel({ data: videoData() })
  assert.equal(model.allFrames.length, 2)
  assert.equal(model.allFrames[1].success, false)
  assert.equal(model.allFrames[1].errorMessage, 'No flame.')
})

test('the material distribution mirrors the backend vote, not a client recomputation', () => {
  const model = buildVideoResultModel({ data: videoData() })
  assert.deepEqual(
    model.distribution.map((entry) => [entry.material, entry.frames]),
    [
      ['Wood Materials', 3],
      ['Paper Products', 1],
    ],
  )
})

test('an uncertain video decision states so without inventing a material', () => {
  const model = buildVideoResultModel({
    data: videoData({ final_material: null, uncertain: true, uncertainty_reasons: ['no frame contained an analysable flame'] }),
  })
  assert.equal(model.material.uncertain, true)
  assert.equal(model.material.name, null)
})

test('the video result never carries an AI card - the backend produces none', () => {
  const model = buildVideoResultModel({ data: videoData() })
  assert.equal('ai' in model, false)
})

test('a cached video result is surfaced on the model', () => {
  const model = buildVideoResultModel({ data: videoData({ cached: true }) })
  assert.equal(model.cached, true)
})

test('no video data yields no result at all', () => {
  assert.equal(buildVideoResultModel({ data: null }), null)
  assert.equal(buildVideoResultModel(), null)
})

test('developer-facing internals never reach either model', () => {
  const image = JSON.stringify(buildImageResultModel({ data: imageData(), previewUrl: 'blob:preview' }))
  const video = JSON.stringify(buildVideoResultModel({ data: videoData() }))

  for (const leak of ['deterministic_support', 'vision_support', 'lab_distance', 'fusion_version', 'decided_by', 'timing']) {
    assert.equal(image.includes(leak), false, `"${leak}" must not reach the image UI`)
    assert.equal(video.includes(leak), false, `"${leak}" must not reach the video UI`)
  }
})
