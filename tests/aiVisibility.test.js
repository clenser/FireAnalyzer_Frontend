import assert from 'node:assert/strict'
import { test } from 'node:test'

import { AI_VISIBILITY_THRESHOLD_PERCENT } from '../src/config.js'
import { normaliseResponse } from '../src/services/normalize.js'
import { buildAiModel, buildImageResultModel, buildVideoResultModel } from '../src/services/viewModel.js'

/**
 * The AI Material Analysis visibility rule, for an image and for a video alike.
 *
 * The card is rendered only when the final primary AI confidence reaches the
 * threshold (45%). Below it, `null`, unavailable or malformed, the card does not
 * exist - so there is never an empty card, and never an "AI analysis is
 * uncertain" note floating above nothing.
 */

const THRESHOLD = AI_VISIBILITY_THRESHOLD_PERCENT

/** An `/analyze` AI section at a chosen primary confidence. */
const aiSection = (confidencePercent, overrides = {}) => ({
  available: true,
  primary_material: 'Natural Fibers',
  overall_confidence_level: 'medium',
  matches: [
    {
      rank: 1,
      material: 'Natural Fibers',
      confidence_percent: confidencePercent,
    },
    { rank: 2, material: 'Wax Materials', confidence_percent: 12 },
  ],
  ...overrides,
})

/** A `POST /video-material-analysis` result at a chosen primary confidence. */
const videoAi = (confidencePercent, overrides = {}) => ({
  available: true,
  primaryMaterial: 'Natural Fibers',
  overallConfidenceLevel: 'medium',
  matches: [
    { rank: 1, material: 'Natural Fibers', confidencePercent },
    { rank: 2, material: 'Wax Materials', confidencePercent: 12 },
  ],
  ...overrides,
})

/** Only the AI part of a full image model is under test here. */
const imageAi = (section) =>
  buildImageResultModel({
    data: normaliseResponse({
      fire_detection: { detected: true, confidence: 0.9 },
      material_analysis: { primary_material: 'Natural Fibers', similarity: 0.9 },
      ai_material_analysis: section,
    }),
  }).ai

const videoModel = (ai) =>
  buildVideoResultModel({
    aggregation: {
      frames: [],
      framesAnalyzed: 4,
      framesSucceeded: 4,
      framesWithFlame: 4,
      failedCount: 0,
      reliable: true,
      rgb: [210, 110, 30],
      lab: [62, 24, 55],
    },
    videoAi: ai,
  })

/* ------------------------------ the boundary ------------------------------ */

test('the threshold is 45%', () => {
  assert.equal(THRESHOLD, 45)
})

test('44.9% hides the card, 45% shows it', () => {
  assert.equal(buildAiModel(videoAi(44.9)), null)
  assert.equal(buildAiModel(videoAi(45)).confidence, 45)
})

test('a comfortable confidence shows the card with its figures intact', () => {
  const ai = buildAiModel(videoAi(60))
  assert.equal(ai.available, true)
  assert.equal(ai.confidence, 60)
  assert.equal(ai.confidenceText, '60.0%')
  assert.equal(ai.primaryMaterial, 'Natural Fibers')
  assert.equal(ai.matches.length, 2)
})

test('a null confidence hides the card', () => {
  assert.equal(buildAiModel(videoAi(null)), null)
  assert.equal(buildAiModel(videoAi('high')), null)
})

test('an unavailable result hides the card', () => {
  assert.equal(buildAiModel({ available: false, matches: [] }), null)
  assert.equal(buildAiModel(null), null)
  assert.equal(buildAiModel(undefined), null)
})

test('a malformed result hides the card', () => {
  assert.equal(buildAiModel({ available: true, matches: 'nonsense' }), null)
  assert.equal(buildAiModel({ available: 'yes' }), null)
  assert.equal(buildAiModel({ available: true, matches: [{ rank: 1 }] }), null, 'no named match')
})

test('an empty match list has no confidence to judge, so the card is hidden', () => {
  assert.equal(buildAiModel({ available: true, matches: [] }), null)
})

/* ---------------------------------- image --------------------------------- */

test('the image applies the same boundary as the video', () => {
  assert.equal(imageAi(aiSection(44.9)), null)
  assert.equal(imageAi(aiSection(45)).confidence, 45)
  assert.equal(imageAi(aiSection(60)).confidence, 60)
  assert.equal(imageAi(aiSection(null)), null)
  assert.equal(imageAi({ available: false, error: 'timeout' }), null)
  assert.equal(imageAi({ available: true, matches: 'nonsense' }), null)
})

test('hiding the AI card never removes the rest of the image result', () => {
  const model = buildImageResultModel({
    data: normaliseResponse({
      fire_detection: { detected: true, confidence: 0.9 },
      segmentation: { available: true, mask_area_ratio: 0.2, mask: 'AAAA', mask_encoding: 'png_base64' },
      flame_analysis: { mean_flame_color: { rgb: [220, 120, 30], lab: [63, 24, 57] } },
      material_analysis: { primary_material: 'Natural Fibers', similarity: 0.93 },
      fire_class: { class: 'Class A' },
      ai_material_analysis: aiSection(12),
    }),
  })

  assert.equal(model.ai, null)
  assert.equal(model.hasContent, true)
  assert.equal(model.detection.detected, true)
  assert.equal(model.flameColor.swatch, 'rgb(220, 120, 30)')
  assert.equal(model.material.name, 'Natural Fibers')
  assert.equal(model.fireClass.name, 'Class A')
})

/* ---------------------------------- video --------------------------------- */

test('the video applies the same boundary as the image', () => {
  assert.equal(videoModel(videoAi(44.9)).ai, null)
  assert.equal(videoModel(videoAi(45)).ai.confidence, 45)
  assert.equal(videoModel(videoAi(60)).ai.confidence, 60)
  assert.equal(videoModel(videoAi(null)).ai, null)
  assert.equal(videoModel({ available: false, matches: [] }).ai, null)
  assert.equal(videoModel({ available: true, matches: 'nonsense' }).ai, null)
})

test('a confidence below the threshold never renders an "uncertain" note', () => {
  // The note is not part of the model at all any more, so it cannot accompany an
  // absent card.
  const hidden = videoModel(videoAi(20))
  assert.equal(hidden.ai, null)
  assert.equal('uncertain' in hidden, false)

  const shown = videoModel(videoAi(60))
  assert.equal(shown.ai.available, true)
  assert.equal('uncertain' in shown.ai, false)
})
