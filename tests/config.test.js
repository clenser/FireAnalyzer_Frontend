import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AI_VISIBILITY_THRESHOLD_PERCENT,
  MAX_MATERIAL_ALTERNATIVES,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
  REPRESENTATIVE_FRAME_COUNT,
  VIDEO_FRAME_COUNT_DEFAULT,
  VIDEO_FRAME_COUNT_MAX,
  VIDEO_FRAME_COUNT_MIN,
} from '../src/config.js'

/**
 * The config module is what the UI enforces before any request is made.
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

test('the frame_count bounds mirror the backend exactly (MIN_FRAMES_LIMIT/MAX_FRAMES_LIMIT in app/video_analysis.py)', () => {
  assert.equal(VIDEO_FRAME_COUNT_MIN, 3)
  assert.equal(VIDEO_FRAME_COUNT_MAX, 60)
  assert.equal(VIDEO_FRAME_COUNT_DEFAULT, 12)
  assert.ok(VIDEO_FRAME_COUNT_MIN <= VIDEO_FRAME_COUNT_DEFAULT && VIDEO_FRAME_COUNT_DEFAULT <= VIDEO_FRAME_COUNT_MAX)
})
