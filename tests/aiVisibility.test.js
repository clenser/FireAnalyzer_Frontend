import assert from 'node:assert/strict'
import { test } from 'node:test'

import { AI_VISIBILITY_THRESHOLD_PERCENT } from '../src/config.js'
import { normaliseImageResponse } from '../src/services/normalize.js'
import { buildAiModel, buildImageResultModel } from '../src/services/viewModel.js'

/**
 * The AI Material Analysis visibility rule.
 *
 * The backend only ever attaches this secondary, numeric-only Gemini opinion to
 * an image (`ai_material_analysis`) - never to a video. The card is rendered
 * only when its top confidence reaches the threshold (45%); below it, `null`,
 * unavailable or malformed, the card does not exist at all.
 */

const THRESHOLD = AI_VISIBILITY_THRESHOLD_PERCENT

const aiSection = (confidencePercent, overrides = {}) => ({
  available: true,
  primary_material: 'Natural Fibers',
  overall_confidence_level: 'medium',
  matches: [
    { rank: 1, material: 'Natural Fibers', confidence_percent: confidencePercent },
    { rank: 2, material: 'Wax Materials', confidence_percent: 12 },
  ],
  ...overrides,
})

const imageAi = (section) =>
  buildImageResultModel({
    data: normaliseImageResponse({
      fire_detection: { detected: true, confidence: 0.9 },
      final_material: 'Natural Fibers',
      confidence: 0.9,
      ai_material_analysis: section,
    }),
  }).ai

test('the threshold is 45%', () => {
  assert.equal(THRESHOLD, 45)
})

test('44.9% hides the card, 45% shows it', () => {
  assert.equal(imageAi(aiSection(44.9)), null)
  assert.equal(imageAi(aiSection(45)).confidence, 45)
})

test('a comfortable confidence shows the card with its figures intact', () => {
  const ai = imageAi(aiSection(60))
  assert.equal(ai.available, true)
  assert.equal(ai.confidence, 60)
  assert.equal(ai.confidenceText, '60.0%')
  assert.equal(ai.primaryMaterial, 'Natural Fibers')
  assert.equal(ai.matches.length, 2)
})

test('a null confidence hides the card', () => {
  assert.equal(imageAi(aiSection(null)), null)
})

test('an unavailable result hides the card', () => {
  assert.equal(buildAiModel({ available: false, matches: [] }), null)
  assert.equal(buildAiModel(null), null)
  assert.equal(buildAiModel(undefined), null)
})

test('a malformed result hides the card', () => {
  assert.equal(buildAiModel({ available: true, matches: 'nonsense' }), null)
  assert.equal(buildAiModel({ available: true, matches: [{ rank: 1 }] }), null, 'no named match')
})

test('an empty match list has no confidence to judge, so the card is hidden', () => {
  assert.equal(buildAiModel({ available: true, matches: [] }), null)
})

test('hiding the AI card never removes the rest of the image result', () => {
  const model = buildImageResultModel({
    data: normaliseImageResponse({
      fire_detection: { detected: true, confidence: 0.9 },
      segmentation: { available: true, mask_area_ratio: 0.2, mask: 'AAAA', mask_encoding: 'png_base64' },
      flame_analysis: { mean_color: { rgb: [220, 120, 30], lab: [63, 24, 57] } },
      final_material: 'Natural Fibers',
      confidence: 0.93,
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
