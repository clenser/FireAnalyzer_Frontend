import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DEFAULT_FRAME_COUNT, MAX_FRAME_COUNT, MIN_FRAME_COUNT } from '../src/config.js'
import {
  VideoError,
  describeVideoError,
  generateRandomTimestamps,
  isValidFrameCount,
  resolveFrameCount,
} from '../src/utils/videoFrames.js'

/* ------------------------- frame count selection ------------------------- */

test('frame count defaults to 10 when nothing usable is chosen', () => {
  assert.equal(resolveFrameCount(undefined), DEFAULT_FRAME_COUNT)
  assert.equal(resolveFrameCount(null), DEFAULT_FRAME_COUNT)
  assert.equal(resolveFrameCount(Number.NaN), DEFAULT_FRAME_COUNT)
  assert.equal(resolveFrameCount('10'), DEFAULT_FRAME_COUNT)
  assert.equal(DEFAULT_FRAME_COUNT, 10)
})

test('frame count is clamped to the supported range', () => {
  assert.equal(resolveFrameCount(0), MIN_FRAME_COUNT)
  assert.equal(resolveFrameCount(-5), MIN_FRAME_COUNT)
  assert.equal(resolveFrameCount(999), MAX_FRAME_COUNT)
  assert.equal(resolveFrameCount(15), 15)
  assert.equal(resolveFrameCount(12.6), 13)
})

test('frame count validation only accepts integers in range', () => {
  assert.equal(isValidFrameCount(10), true)
  assert.equal(isValidFrameCount(1), true)
  assert.equal(isValidFrameCount(20), true)
  assert.equal(isValidFrameCount(0), false)
  assert.equal(isValidFrameCount(21), false)
  assert.equal(isValidFrameCount(10.5), false)
  assert.equal(isValidFrameCount('10'), false)
  assert.equal(isValidFrameCount(null), false)
})

/* ------------------------ random timestamp sampling ---------------------- */

test('timestamps are returned in chronological order', () => {
  const stamps = generateRandomTimestamps(60, 10, { random: () => 0.99 })
  const sorted = [...stamps].sort((a, b) => a - b)
  assert.deepEqual(stamps, sorted)
  assert.equal(stamps.length, 10)
})

test('timestamps stay inside the video duration', () => {
  const stamps = generateRandomTimestamps(30, 8)
  for (const stamp of stamps) {
    assert.ok(stamp >= 0, `${stamp} must not be negative`)
    assert.ok(stamp < 30, `${stamp} must be before the end of the clip`)
  }
})

test('timestamps are spread across the whole clip, not clustered at the start', () => {
  const stamps = generateRandomTimestamps(120, 10)
  assert.ok(stamps[0] < 12, 'the first sample is in the first tenth')
  assert.ok(stamps[9] > 96, 'the last sample is in the final tenth')
  assert.ok(stamps[4] > 48 && stamps[4] < 72, 'a middle sample lands mid-clip')
})

test('sampling is random, not a fixed percentage grid', () => {
  const grid = [0, 0.1, 0.2, 0.3, 0.4]
  const a = generateRandomTimestamps(100, 5, { random: () => 0.5 })
  const b = generateRandomTimestamps(100, 5, { random: () => 0.05 })

  assert.notDeepEqual(a, grid.map((value) => value * 100))
  assert.notDeepEqual(a, b)
  assert.notDeepEqual(b, grid.map((value) => value * 100))
})

test('neighbouring samples are never near-duplicates', () => {
  const duration = 5
  const count = 20
  const bucket = duration / count

  for (let run = 0; run < 200; run += 1) {
    const stamps = generateRandomTimestamps(duration, count)
    assert.equal(stamps.length, count)
    for (let i = 1; i < stamps.length; i += 1) {
      assert.ok(
        stamps[i] - stamps[i - 1] >= 0.3 * bucket,
        `duplicate samples at ${stamps[i - 1]} and ${stamps[i]}`,
      )
    }
  }
})

test('sampling works for very short clips', () => {
  const stamps = generateRandomTimestamps(0.6, 5)
  assert.equal(stamps.length, 5)
  for (const stamp of stamps) {
    assert.ok(stamp >= 0 && stamp < 0.6)
  }
})

test('an unusable duration is rejected rather than producing bogus frames', () => {
  assert.throws(() => generateRandomTimestamps(0, 5), VideoError)
  assert.throws(() => generateRandomTimestamps(-3, 5), VideoError)
  assert.throws(() => generateRandomTimestamps(Number.NaN, 5), VideoError)
  assert.throws(() => generateRandomTimestamps(undefined, 5), VideoError)
})

test('frame count is honoured through generateRandomTimestamps', () => {
  assert.equal(generateRandomTimestamps(60, 5).length, 5)
  assert.equal(generateRandomTimestamps(60, 20).length, 20)
  // Out-of-range requests are clamped, never unbounded.
  assert.equal(generateRandomTimestamps(60, 100).length, MAX_FRAME_COUNT)
})

/* ------------------------------ error wording ---------------------------- */

test('every video failure mode has plain-language wording', () => {
  const cases = [
    ['UNSUPPORTED', /not supported/i],
    ['METADATA_FAILED', /could not be read/i],
    ['NO_FRAMES', /no frames could be extracted/i],
    ['BACKEND_UNAVAILABLE', /not available/i],
    ['INSUFFICIENT_FRAMES', /not enough valid frames/i],
  ]

  for (const [code, pattern] of cases) {
    const message = describeVideoError(new VideoError(code, 'raw internal text'))
    assert.match(message, pattern)
    assert.doesNotMatch(message, /raw internal text/)
  }
})

test('an unknown error falls back to its own message', () => {
  assert.equal(describeVideoError(new Error('boom')), 'boom')
  assert.equal(describeVideoError(null), 'Video analysis failed. Please try again.')
})
