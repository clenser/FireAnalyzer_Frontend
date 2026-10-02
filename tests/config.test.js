import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AI_VISIBILITY_THRESHOLD_PERCENT,
  MAX_MATERIAL_ALTERNATIVES,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
  REPRESENTATIVE_FRAME_COUNT,
} from '../src/config.js'

/**
 * The config module is what the UI enforces before any request is made. The
 * backend owns video frame sampling entirely, so there is no frame-count
 * parameter here to keep coherent with it any more.
 */

test('the AI card threshold is a percentage a user can reason about', () => {
  assert.equal(AI_VISIBILITY_THRESHOLD_PERCENT, 45)
  assert.ok(AI_VISIBILITY_THRESHOLD_PERCENT > 0 && AI_VISIBILITY_THRESHOLD_PERCENT <= 100)
})

test('at most three alternative materials are listed', () => {
  assert.equal(MAX_MATERIAL_ALTERNATIVES, 3)
})

test('up to three representative frames are shown before the frame list expands', () => {
  assert.equal(REPRESENTATIVE_FRAME_COUNT, 3)
})

test('the upload limits are sane and video allows more than image', () => {
  assert.ok(MAX_UPLOAD_BYTES > 0)
  assert.ok(MAX_VIDEO_BYTES > MAX_UPLOAD_BYTES, 'a video is expected to be larger than a photo')
})
