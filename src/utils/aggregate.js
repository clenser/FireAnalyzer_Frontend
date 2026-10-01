/**
 * Frame-result aggregation for video analysis.
 *
 * Every frame is analysed by the existing image endpoint, so this module only
 * combines *structured numeric values* the API already returned. Two rules are
 * absolute:
 *
 *  1. Material identification is never done here. The averaged colour is sent to
 *     the backend's deterministic endpoint, which is the source of truth.
 *  2. The AI assessment is never derived here either - not by averaging
 *     per-frame Gemini confidences and not by picking one frame's answer. All
 *     frame evidence goes to the backend in a single request that returns one
 *     consolidated result.
 */

import {
  MIN_FRAME_SUCCESS_RATIO,
  MIN_REPRESENTATIVE_FRAME_COUNT,
  REPRESENTATIVE_FRAME_COUNT,
} from '../config.js'

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

const triple = (value) =>
  Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(isFiniteNumber)
    ? [value[0], value[1], value[2]]
    : null

const round = (value, digits) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** Mean of a list of RGB triples, rounded to whole channels. Null when empty. */
export function averageRgb(values) {
  const list = (values ?? []).map(triple).filter(Boolean)
  if (list.length === 0) return null
  const sum = list.reduce((acc, rgb) => [acc[0] + rgb[0], acc[1] + rgb[1], acc[2] + rgb[2]], [0, 0, 0])
  return sum.map((channel) => Math.round(channel / list.length))
}

/** Mean of a list of LAB triples. Null when empty. */
export function averageLab(values) {
  const list = (values ?? []).map(triple).filter(Boolean)
  if (list.length === 0) return null
  const sum = list.reduce((acc, lab) => [acc[0] + lab[0], acc[1] + lab[1], acc[2] + lab[2]], [0, 0, 0])
  return sum.map((channel) => round(channel / list.length, 1))
}

const mean = (values) => {
  const list = (values ?? []).filter(isFiniteNumber)
  if (list.length === 0) return null
  return list.reduce((total, value) => total + value, 0) / list.length
}

/**
 * Flattens per-frame analysis into the numbers the video result needs.
 *
 * `frames` is the list returned by `extractFrames`; `results[i]` is the outcome
 * of frame `i` (`{ ok, data }`) or `null` when that frame failed. Frames without
 * a usable flame colour are excluded from the colour averages rather than being
 * averaged in as zeros.
 */
export function aggregateFrameResults(frames, results) {
  const analysed = (frames ?? []).map((frame, index) => {
    const result = results?.[index] ?? null
    const data = result?.ok ? result.data : null
    const detection = data?.detection ?? null
    const color = data?.color?.mean ?? null
    const segmentation = data?.segmentation ?? null
    return {
      index,
      timestamp: frame?.timestamp ?? null,
      dataUrl: frame?.dataUrl ?? null,
      maskUrl: segmentation?.maskUrl ?? null,
      detected: detection?.detected === true,
      confidence: isFiniteNumber(detection?.confidence) ? detection.confidence : null,
      // Measurements only - forwarded to the backend as frame evidence, never
      // re-interpreted here.
      segmentationConfidence: isFiniteNumber(segmentation?.confidence)
        ? segmentation.confidence
        : null,
      flameAreaRatio: isFiniteNumber(segmentation?.maskAreaRatio)
        ? segmentation.maskAreaRatio
        : null,
      rgb: triple(color?.rgb),
      lab: triple(color?.lab),
      // The full `/analyze` payload is deliberately not retained: it holds the
      // base64 mask (already extracted above) and the frame's own Gemini answer,
      // and neither may leak into the video result or be re-aggregated here.
      error: result?.ok === true ? null : (result?.error ?? 'frame-failed'),
    }
  })

  const succeeded = analysed.filter((frame) => frame.error === null)
  const withFlame = succeeded.filter((frame) => frame.detected && frame.rgb)
  const withColor = succeeded.filter((frame) => frame.rgb)

  // Flame-detected frames are the meaningful sample. If the clip contained no
  // detected flame, the average falls back to every valid frame and the result
  // says so, rather than inventing a flame colour from nothing.
  const basis = withFlame.length > 0 ? 'detected' : withColor.length > 0 ? 'all-valid' : 'none'
  const colorSource = basis === 'detected' ? withFlame : withColor

  const successRatio = analysed.length > 0 ? succeeded.length / analysed.length : 0

  return {
    framesAnalyzed: analysed.length,
    framesSucceeded: succeeded.length,
    framesWithFlame: succeeded.filter((frame) => frame.detected).length,
    failedCount: analysed.length - succeeded.length,
    successRatio,
    reliable: analysed.length > 0 && successRatio >= MIN_FRAME_SUCCESS_RATIO && succeeded.length > 0,
    rgb: averageRgb(colorSource.map((frame) => frame.rgb)),
    lab: averageLab(colorSource.map((frame) => frame.lab)),
    colorBasis: basis,
    colorSampleCount: colorSource.length,
    averageConfidence: mean(withFlame.map((frame) => frame.confidence)),
    frames: analysed,
  }
}

/**
 * Picks a small, representative set of successfully analysed frames for display.
 *
 * Between `MIN_REPRESENTATIVE_FRAME_COUNT` and `REPRESENTATIVE_FRAME_COUNT`
 * frames are shown, never more and never a single frame. Flame-detected frames
 * are preferred; the selection is spread across the clip rather than clustered at
 * the start.
 */
export function selectRepresentativeFrames(frames, count = REPRESENTATIVE_FRAME_COUNT) {
  const usable = (frames ?? []).filter((frame) => frame && frame.error === null)
  if (usable.length === 0) return []

  const limit = Math.max(0, Math.round(count))
  if (limit === 0) return []

  // Never show a lone frame: one image is not a gallery and the video card would
  // otherwise carry a full-width card for a single thumbnail.
  const target = Math.min(usable.length, Math.max(MIN_REPRESENTATIVE_FRAME_COUNT, limit))
  if (usable.length <= target) return usable.slice(0, target)

  const detected = usable.filter((frame) => frame.detected)
  const pool = detected.length > 0 ? detected : usable

  if (pool.length <= target) return pool.slice(0, target)

  const picked = []
  for (let slot = 0; slot < target; slot += 1) {
    const position = Math.round((slot * (pool.length - 1)) / (target - 1))
    const frame = pool[position]
    if (frame && !picked.includes(frame)) picked.push(frame)
  }
  return picked
}

/**
 * Builds the structured, per-frame evidence for `POST /video-material-analysis`.
 *
 * Only measurements travel: the frame's index, where it sits in the clip, its
 * mean flame RGB/LAB and the detection/segmentation figures `/analyze` already
 * returned. Never an image, a mask or base64 - the backend rejects those, and the
 * AI prompt is built from the same numbers.
 *
 * Every successfully analysed frame is included, in the order the frames were
 * sampled, so the single consolidated request carries the whole collection. A
 * frame with no usable colour is left out, because the endpoint requires RGB/LAB
 * for every frame it receives.
 */
export function buildVideoFrameEvidence(frames) {
  const evidence = []

  for (const frame of frames ?? []) {
    if (!frame || frame.error !== null) continue
    if (!frame.rgb || !frame.lab) continue

    const entry = {
      frame_index: Number.isFinite(frame.index) ? frame.index : evidence.length,
      rgb: frame.rgb,
      lab: frame.lab,
    }

    if (isFiniteNumber(frame.timestamp)) {
      entry.timestamp_seconds = Math.round(frame.timestamp * 1000) / 1000
    }
    if (isFiniteNumber(frame.confidence)) {
      entry.detection_confidence = round(frame.confidence, 4)
    }
    if (isFiniteNumber(frame.segmentationConfidence)) {
      entry.segmentation_confidence = round(frame.segmentationConfidence, 4)
    }
    if (isFiniteNumber(frame.flameAreaRatio)) {
      entry.flame_area_ratio = round(frame.flameAreaRatio, 6)
    }

    evidence.push(entry)
  }

  return evidence
}
