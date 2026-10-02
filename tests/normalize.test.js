import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  formatLab,
  formatRgb,
  maskDataUrl,
  normaliseAiMaterialAnalysis,
  normaliseImageResponse,
  normaliseVideoResponse,
  rgbToCss,
  thumbnailDataUrl,
} from '../src/services/normalize.js'

/**
 * A realistic `/analyze` payload, matching the current backend contract
 * (`app/api.py` + `app/material_fusion.py` in the backend repository): up to
 * three detections, a merged segmentation mask, and the Python fusion's
 * `final_material`/`confidence`/`uncertain` fields at the top level.
 */
function imagePayload(overrides = {}) {
  return {
    success: true,
    cached: false,
    detection_count: 2,
    fire_detection: { detected: true, confidence: 0.9, bounding_box: { x1: 1, y1: 2, x2: 3, y2: 4 } },
    detections: [
      { index: 0, confidence: 0.9, bounding_box: { x1: 1, y1: 2, x2: 3, y2: 4 } },
      { index: 1, confidence: 0.7, bounding_box: { x1: 5, y1: 6, x2: 7, y2: 8 } },
    ],
    segmentation: { available: true, flame_pixel_count: 44820, mask: 'aGk=', mask_encoding: 'png_base64' },
    flame_analysis: { mean_color: { rgb: [255, 221, 98], lab: [89.09, -0.36, 63.31] } },
    final_material: 'Natural Fibers',
    confidence: 0.9268,
    confidence_percent: 92.68,
    confidence_level: 'high',
    uncertain: false,
    uncertainty_reasons: [],
    leading_candidates: ['Natural Fibers'],
    candidate_materials: [
      { material: 'Natural Fibers', score: 0.9268, deterministic_support: 0.9, vision_support: 0.95 },
      { material: 'Wax Materials', score: 0.5, deterministic_support: 0.4, vision_support: 0.6 },
    ],
    deterministic_evidence: {
      available: true,
      evidence_quality: 'strong',
      reliability: 0.95,
      best_lab_distance: 5.2,
      ranking: [{ material: 'Natural Fibers', similarity: 0.9268, support: 0.8 }],
    },
    vision_evidence: {
      vision_provider: 'groq',
      available: true,
      uncertain: false,
      candidates: [{ material: 'Natural Fibers', confidence: 0.95, uncertainty: 'low' }],
    },
    fire_class: { class: 'Class A', description: 'Ordinary combustibles' },
    extinguishing_agents: [{ name: 'Water', type: 'cooling', compound: null }],
    ...overrides,
  }
}

test('detections, the merged mask and the mean colour are normalised', () => {
  const result = normaliseImageResponse(imagePayload())
  assert.equal(result.detectionCount, 2)
  assert.equal(result.detections.length, 2)
  assert.deepEqual(result.detection.boundingBox, { x1: 1, y1: 2, x2: 3, y2: 4, width: 2, height: 2 })
  assert.equal(result.segmentation.maskUrl, 'data:image/png;base64,aGk=')
  assert.equal(result.color.mean.rgb.join(','), '255,221,98')
})

test('the Python fusion decision is read from the top level, not material_analysis', () => {
  const result = normaliseImageResponse(imagePayload())
  assert.equal(result.material.finalMaterial, 'Natural Fibers')
  assert.equal(result.material.confidence, 0.9268)
  assert.equal(result.material.uncertain, false)
  assert.equal(result.candidates.length, 2)
  assert.equal(result.candidates[0].material, 'Natural Fibers')
})

test('an uncertain decision keeps final_material null and its own reasons', () => {
  const result = normaliseImageResponse(
    imagePayload({
      final_material: null,
      uncertain: true,
      uncertainty_reasons: ['fused confidence 0.30 is below 0.45'],
    }),
  )
  assert.equal(result.material.finalMaterial, null)
  assert.equal(result.material.uncertain, true)
  assert.deepEqual(result.material.uncertaintyReasons, ['fused confidence 0.30 is below 0.45'])
})

test('deterministic and vision evidence are kept for the evidence disclosure', () => {
  const result = normaliseImageResponse(imagePayload())
  assert.equal(result.deterministicEvidence.evidenceQuality, 'strong')
  assert.equal(result.deterministicEvidence.ranking[0].material, 'Natural Fibers')
  assert.equal(result.visionEvidence.provider, 'groq')
  assert.equal(result.visionEvidence.candidates[0].material, 'Natural Fibers')
})

test('fire class and agents are still normalised the same way', () => {
  const result = normaliseImageResponse(imagePayload())
  assert.equal(result.fireClass.name, 'Class A')
  assert.equal(result.agents[0].name, 'Water')
})

test('missing and malformed payloads normalise to a safe empty shape', () => {
  for (const bad of [null, undefined, 42, 'nope', []]) {
    const result = normaliseImageResponse(bad)
    assert.equal(result.detection, null)
    assert.equal(result.material, null)
    assert.deepEqual(result.agents, [])
  }
})

/* --------------------------------- video --------------------------------- */

function videoPayload(overrides = {}) {
  return {
    success: true,
    cached: true,
    video: { frame_count: 120, fps: 24, duration_seconds: 5, frames_sampled: 4, frames_requested: 4 },
    frames_with_flame: 3,
    vision_provider: 'groq',
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
    fire_class: { class: 'Class A' },
    representative_frames: [
      {
        success: true,
        frame_index: 0,
        timestamp_seconds: 0.5,
        detection_count: 1,
        fire_detection: { detected: true, confidence: 0.8 },
        final_material: 'Wood Materials',
        confidence: 0.72,
        uncertain: false,
        thumbnail: { encoding: 'jpeg_base64', width: 10, height: 10, data: 'ab==' },
      },
    ],
    frames: [
      { success: false, frame_index: 1, timestamp_seconds: 1.0, error: { code: 'NO_FIRE_DETECTED', message: 'No flame.' } },
    ],
    ...overrides,
  }
}

test('cached and the video summary numbers are read from the top level', () => {
  const result = normaliseVideoResponse(videoPayload())
  assert.equal(result.cached, true)
  assert.equal(result.video.framesSampled, 4)
  assert.equal(result.framesWithFlame, 3)
  assert.equal(result.material.finalMaterial, 'Wood Materials')
})

test('candidate_materials at video level is the vote distribution, not a score list', () => {
  const result = normaliseVideoResponse(videoPayload())
  assert.deepEqual(
    result.distribution.map((entry) => [entry.material, entry.frames]),
    [
      ['Wood Materials', 3],
      ['Paper Products', 1],
    ],
  )
})

test('representative frames keep their thumbnail, index and timestamp', () => {
  const result = normaliseVideoResponse(videoPayload())
  const [frame] = result.representativeFrames
  assert.equal(frame.frameIndex, 0)
  assert.equal(frame.timestampSeconds, 0.5)
  assert.equal(frame.thumbnailUrl, 'data:image/jpeg;base64,ab==')
  assert.equal(frame.material.finalMaterial, 'Wood Materials')
})

test('a failed frame is kept with its error, not dropped', () => {
  const result = normaliseVideoResponse(videoPayload())
  const [frame] = result.frames
  assert.equal(frame.success, false)
  assert.equal(frame.frameIndex, 1)
  assert.equal(frame.errorMessage, 'No flame.')
  assert.equal(frame.material, null)
})

test('missing and malformed video payloads normalise to a safe empty shape', () => {
  for (const bad of [null, undefined, 42, []]) {
    const result = normaliseVideoResponse(bad)
    assert.equal(result.material, null)
    assert.deepEqual(result.frames, [])
    assert.deepEqual(result.representativeFrames, [])
    assert.equal(result.detectionSummary, null)
    assert.equal(result.evidenceSummary, null)
  }
})

/* ------------------------------ detection_summary / evidence_summary ------------------------------ */

test('detection_summary is read as a frame count, never a fabricated confidence', () => {
  const result = normaliseVideoResponse(
    videoPayload({ detection_summary: { flame_frames: 3, sampled_frames: 4, text: 'Flame seen in 3 of 4 sampled frames' } }),
  )
  assert.deepEqual(result.detectionSummary, {
    flameFrames: 3,
    sampledFrames: 4,
    text: 'Flame seen in 3 of 4 sampled frames',
  })
})

test('evidence_summary carries the top colour/vision match independent of the fused decision', () => {
  const result = normaliseVideoResponse(
    videoPayload({
      final_material: null,
      uncertain: true,
      evidence_summary: {
        top_colour_match: { material: 'Wood Materials', frames: 3, share: 0.75 },
        top_vision_match: { material: 'Paper Products', frames: 2, share: 0.5 },
        colour_distribution: [
          { material: 'Wood Materials', frames: 3 },
          { material: 'Plastics', frames: 1 },
        ],
        vision_distribution: [{ material: 'Paper Products', frames: 2 }],
        colour_frames_considered: 4,
        vision_frames_considered: 4,
      },
    }),
  )

  assert.deepEqual(result.evidenceSummary.topColourMatch, { material: 'Wood Materials', frames: 3, share: 0.75 })
  assert.deepEqual(result.evidenceSummary.topVisionMatch, { material: 'Paper Products', frames: 2, share: 0.5 })
  assert.equal(result.evidenceSummary.colourDistribution.length, 2)
  assert.equal(result.evidenceSummary.visionDistribution.length, 1)
  assert.equal(result.evidenceSummary.colourFramesConsidered, 4)
  assert.equal(result.evidenceSummary.visionFramesConsidered, 4)
})

test('an absent evidence_summary normalises to null rather than an empty shell', () => {
  const result = normaliseVideoResponse(videoPayload())
  assert.equal(result.evidenceSummary, null)
})

/* ------------------------------ AI material (secondary Gemini opinion) ------------------------------ */

test('a normal AI response is normalised into the stable frontend shape', () => {
  const result = normaliseAiMaterialAnalysis({
    available: true,
    primary_material: 'Paper Products',
    matches: [{ rank: 1, material: 'Paper Products', confidence_percent: 60, reason: 'cellulose' }],
    overall_confidence_level: 'medium',
    uncertain: false,
    evidence_quality: 'moderate',
    reasoning_summary: 'Consistent with cellulose-based fuel.',
  })
  assert.equal(result.available, true)
  assert.equal(result.primaryMaterial, 'Paper Products')
  assert.equal(result.matches[0].confidencePercent, 60)
})

test('available=false keeps the error and never fabricates matches', () => {
  const result = normaliseAiMaterialAnalysis({ available: false, error: 'Gemini timed out.' })
  assert.equal(result.available, false)
  assert.equal(result.error, 'Gemini timed out.')
  assert.deepEqual(result.matches, [])
})

/* --------------------------------- formatters --------------------------------- */

test('formatters degrade gracefully', () => {
  assert.equal(formatRgb([1, 2, 3]), 'rgb(1, 2, 3)')
  assert.equal(formatRgb(null), null)
  assert.equal(rgbToCss([1, 2, 3]), 'rgb(1, 2, 3)')
  assert.match(formatLab([50, 10, -20]), /^L 50\.0 · a 10\.0 · b -20\.0$/)
  assert.equal(formatLab(null), null)
})

test('maskDataUrl and thumbnailDataUrl only accept the documented encodings', () => {
  assert.equal(maskDataUrl('aGk=', 'png_base64'), 'data:image/png;base64,aGk=')
  assert.equal(maskDataUrl('aGk=', 'raw'), null)
  assert.equal(thumbnailDataUrl({ encoding: 'jpeg_base64', data: 'ab==' }), 'data:image/jpeg;base64,ab==')
  assert.equal(thumbnailDataUrl({ encoding: 'png_base64', data: 'ab==' }), null)
  assert.equal(thumbnailDataUrl(null), null)
})
