import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AGGREGATION_OVERHEAD_MS,
  DEFAULT_FRAME_DURATION_MS,
  REQUEST_OVERHEAD_MS,
  describeEstimateBasis,
  estimateRemainingDuration,
  estimateVideoDuration,
} from '../src/utils/estimate.js'
import {
  getAverageRequestDurationMs,
  getLastRequestDurationMs,
  getSampleCount,
  recordRequestDuration,
  resetPerformanceStore,
} from '../src/services/performanceStore.js'
import {
  formatApproxSeconds,
  formatDuration,
  formatDurationRange,
  formatTimestamp,
} from '../src/utils/format.js'

test('the estimate scales with the frame count', () => {
  const five = estimateVideoDuration({ frameCount: 5, averageFrameMs: 1000 })
  const ten = estimateVideoDuration({ frameCount: 10, averageFrameMs: 1000 })

  assert.equal(five.measured, true)
  assert.equal(five.perFrameMs, 1000)
  assert.equal(five.totalMs, REQUEST_OVERHEAD_MS + 5 * 1000 + AGGREGATION_OVERHEAD_MS)
  assert.equal(ten.totalMs, REQUEST_OVERHEAD_MS + 10 * 1000 + AGGREGATION_OVERHEAD_MS)
  assert.ok(ten.totalMs > five.totalMs)
})

test('an unmeasured estimate is flagged as such and uses the documented default', () => {
  const estimate = estimateVideoDuration({ frameCount: 10 })

  assert.equal(estimate.measured, false)
  assert.equal(estimate.perFrameMs, DEFAULT_FRAME_DURATION_MS)
  assert.equal(estimate.totalMs, REQUEST_OVERHEAD_MS + 10 * DEFAULT_FRAME_DURATION_MS + AGGREGATION_OVERHEAD_MS)
  assert.equal(describeEstimateBasis(false), 'based on a typical analysis')
  assert.equal(describeEstimateBasis(true), 'from your recent analyses')
})

test('a measured duration replaces the default once a real request has been timed', () => {
  resetPerformanceStore()
  assert.equal(getAverageRequestDurationMs(), null)
  assert.equal(estimateVideoDuration({ frameCount: 10 }).perFrameMs, DEFAULT_FRAME_DURATION_MS)

  recordRequestDuration(12000)

  // The production call site passes the store's average straight through.
  const estimate = estimateVideoDuration({
    frameCount: 10,
    averageFrameMs: getAverageRequestDurationMs(),
  })

  assert.equal(getSampleCount(), 1)
  assert.equal(getLastRequestDurationMs(), 12000)
  assert.equal(getAverageRequestDurationMs(), 12000)
  assert.equal(estimate.measured, true)
  assert.equal(estimate.perFrameMs, 12000)
})

test('the average is a real mean of the recorded samples', () => {
  resetPerformanceStore()
  recordRequestDuration(10000)
  recordRequestDuration(14000)
  assert.equal(getAverageRequestDurationMs(), 12000)
})

test('only the most recent samples are kept', () => {
  resetPerformanceStore()
  for (let i = 0; i < 20; i += 1) recordRequestDuration(1000 + i)
  assert.equal(getSampleCount(), 8)
  assert.equal(getAverageRequestDurationMs(), 1015.5)
})

test('nonsense durations are never recorded', () => {
  resetPerformanceStore()
  assert.equal(recordRequestDuration(Number.NaN), false)
  assert.equal(recordRequestDuration(-5), false)
  assert.equal(recordRequestDuration('1200'), false)
  assert.equal(recordRequestDuration(undefined), false)
  assert.equal(getSampleCount(), 0)
  assert.equal(getAverageRequestDurationMs(), null)
})

test('remaining time falls as frames complete', () => {
  const start = estimateRemainingDuration({ framesRemaining: 10, perFrameMs: 1000 })
  const middle = estimateRemainingDuration({ framesRemaining: 4, perFrameMs: 1000 })
  const done = estimateRemainingDuration({ framesRemaining: 0, perFrameMs: 1000 })

  assert.equal(start, 10 * 1000 + AGGREGATION_OVERHEAD_MS)
  assert.ok(middle < start)
  assert.equal(done, 0)
})

test('a measured duration is shown in seconds, not a fabricated total', () => {
  assert.equal(formatDuration(12400), '12.4s')
  assert.equal(formatDuration(900), '900ms')
  assert.equal(formatDuration(Number.NaN), null)
  assert.equal(formatDuration(undefined), null)
  assert.equal(formatDuration(-1), null)
})

test('an estimate renders as a range, and never as an exact promise', () => {
  const range = formatDurationRange(24800)
  assert.match(range, /^~\d+-\d+ sec$/)
  assert.equal(formatDurationRange(0), null)
  assert.equal(formatDurationRange(Number.NaN), null)
  assert.equal(formatApproxSeconds(9000), '~9 sec')
  assert.equal(formatApproxSeconds(0), null)
})

test('video timestamps render as mm:ss', () => {
  assert.equal(formatTimestamp(0), '00:00')
  assert.equal(formatTimestamp(4.6), '00:04')
  assert.equal(formatTimestamp(78), '01:18')
  assert.equal(formatTimestamp(-1), '--:--')
  assert.equal(formatTimestamp(undefined), '--:--')
})
