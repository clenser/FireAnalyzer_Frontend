/**
 * Processing-time estimation.
 *
 * The point of this module is that no duration is ever invented. It combines a
 * measured per-request cost (recorded from real `/analyze` round trips by
 * `services/performanceStore`) with the requested frame count, and it degrades to
 * an explicitly-labelled default only while no measurement exists yet.
 */

/** Per-request client overhead (connection setup, multipart encode, JSON parse). */
export const REQUEST_OVERHEAD_MS = 400

/** Client-side cost of merging the frame results. */
export const AGGREGATION_OVERHEAD_MS = 500

/**
 * Used only until the first real measurement exists. It is reported as an
 * unmeasured estimate, never as an observed duration.
 */
export const DEFAULT_FRAME_DURATION_MS = 9000

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0

/**
 * Total expected wall-clock time for a video run.
 *
 * @param {object} options
 * @param {number} options.frameCount       Frames the user asked to analyse.
 * @param {number} [options.averageFrameMs] Measured mean duration of one real
 *   image analysis. Falls back to the default when absent.
 * @returns {{ totalMs: number, perFrameMs: number, measured: boolean, frameCount: number }}
 */
export function estimateVideoDuration({ frameCount, averageFrameMs } = {}) {
  const frames = isFiniteNumber(frameCount) ? Math.max(1, Math.round(frameCount)) : 1
  const measured = isFiniteNumber(averageFrameMs) && averageFrameMs > 0
  const perFrameMs = measured ? averageFrameMs : DEFAULT_FRAME_DURATION_MS
  const totalMs = REQUEST_OVERHEAD_MS + frames * perFrameMs + AGGREGATION_OVERHEAD_MS

  return { totalMs, perFrameMs, measured, frameCount: frames }
}

/**
 * Expected time still to go, from the number of frames left to analyse.
 * Always an estimate, so the UI shows it with a `~` prefix.
 */
export function estimateRemainingDuration({ framesRemaining, perFrameMs } = {}) {
  const remaining = isFiniteNumber(framesRemaining) ? Math.max(0, Math.round(framesRemaining)) : 0
  if (remaining === 0) return 0
  const perFrame = isFiniteNumber(perFrameMs) && perFrameMs > 0 ? perFrameMs : DEFAULT_FRAME_DURATION_MS
  return remaining * perFrame + AGGREGATION_OVERHEAD_MS
}

/** Basis wording so the UI can say whether the estimate is measured or assumed. */
export function describeEstimateBasis(measured) {
  return measured ? 'from your recent analyses' : 'based on a typical analysis'
}
