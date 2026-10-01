import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AI_VISIBILITY_THRESHOLD_PERCENT,
  DEFAULT_FRAME_COUNT,
  FRAME_COUNT_OPTIONS,
  MAX_FRAME_COUNT,
  MAX_MATERIAL_ALTERNATIVES,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
  MIN_FRAME_COUNT,
  MIN_FRAME_SUCCESS_RATIO,
  MIN_REPRESENTATIVE_FRAME_COUNT,
  REPRESENTATIVE_FRAME_COUNT,
} from '../src/config.js'
import { resolveFrameCount } from '../src/utils/videoFrames.js'

/**
 * The config module is what the UI enforces before any request is made, so the
 * limits and the frame-count clamping have to agree with each other - a slider
 * that can request more frames than the max would break the run silently.
 */

test('the frame-count range is coherent', () => {
  assert.equal(MIN_FRAME_COUNT, 1)
  assert.ok(MAX_FRAME_COUNT > MIN_FRAME_COUNT)
  assert.ok(DEFAULT_FRAME_COUNT >= MIN_FRAME_COUNT && DEFAULT_FRAME_COUNT <= MAX_FRAME_COUNT)
})

test('every quick-pick is inside the allowed range', () => {
  assert.ok(FRAME_COUNT_OPTIONS.length > 0)
  for (const option of FRAME_COUNT_OPTIONS) {
    assert.ok(option >= MIN_FRAME_COUNT && option <= MAX_FRAME_COUNT, `${option} is out of range`)
  }
  assert.ok(FRAME_COUNT_OPTIONS.includes(DEFAULT_FRAME_COUNT), 'the default is one click away')
})

test('the frame count is clamped into the range no matter what is requested', () => {
  assert.equal(resolveFrameCount(0), MIN_FRAME_COUNT)
  assert.equal(resolveFrameCount(-5), MIN_FRAME_COUNT)
  assert.equal(resolveFrameCount(1000), MAX_FRAME_COUNT)
  assert.equal(resolveFrameCount(7), 7)
  assert.equal(resolveFrameCount(7.4), 7)
})

test('an unusable frame count falls back to the default instead of failing', () => {
  for (const value of [Number.NaN, Infinity, '5', null, undefined, {}]) {
    assert.equal(resolveFrameCount(value), DEFAULT_FRAME_COUNT, `${String(value)}`)
  }
})

test('the reliability threshold is a real ratio', () => {
  assert.ok(MIN_FRAME_SUCCESS_RATIO > 0 && MIN_FRAME_SUCCESS_RATIO <= 1)
  assert.ok(REPRESENTATIVE_FRAME_COUNT > 0)
  assert.ok(REPRESENTATIVE_FRAME_COUNT <= MAX_FRAME_COUNT)
})

test('the gallery shows two or three frames', () => {
  assert.ok(REPRESENTATIVE_FRAME_COUNT >= MIN_REPRESENTATIVE_FRAME_COUNT)
  assert.ok(MIN_REPRESENTATIVE_FRAME_COUNT >= 2, 'never a lone frame')
  assert.ok(REPRESENTATIVE_FRAME_COUNT <= 3)
})

test('the AI card threshold is a percentage a user can reason about', () => {
  assert.equal(AI_VISIBILITY_THRESHOLD_PERCENT, 45)
  assert.ok(AI_VISIBILITY_THRESHOLD_PERCENT > 0 && AI_VISIBILITY_THRESHOLD_PERCENT <= 100)
})

test('at most three alternative materials are listed', () => {
  assert.equal(MAX_MATERIAL_ALTERNATIVES, 3)
})

test('the upload limits are sane and video allows more than image', () => {
  assert.ok(MAX_UPLOAD_BYTES > 0)
  assert.ok(MAX_VIDEO_BYTES > MAX_UPLOAD_BYTES, 'a video is expected to be larger than a photo')
})
