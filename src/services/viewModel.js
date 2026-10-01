/**
 * View models for the result dashboard.
 *
 * These pure builders are the single place where an API payload becomes
 * user-facing copy. That keeps three guarantees in one testable module:
 *
 *  1. A card can only render what a builder hands it, so developer-facing data
 *     (clustering algorithms, centroids, bounding-box coordinates, mask
 *     resolution, per-stage timings, raw pixel counts) cannot leak into the UI
 *     even though `services/normalize` still parses all of it for API consumers.
 *  2. Wording is plain language, with no CV/model terminology.
 *  3. Every builder is a pure function of the payload, so rendering is
 *     unit-tested without a browser.
 *  4. A card the data cannot justify is not built at all. The AI Material
 *     Analysis card is the notable case: it exists only when the final primary
 *     AI confidence reaches `AI_VISIBILITY_THRESHOLD_PERCENT`.
 */

import { formatLab, formatRgb, rgbToCss } from './normalize.js'
import { formatDuration } from '../utils/format.js'
import { selectRepresentativeFrames } from '../utils/aggregate.js'
import { AI_VISIBILITY_THRESHOLD_PERCENT, MAX_MATERIAL_ALTERNATIVES } from '../config.js'

const MAX_ALTERNATIVES = MAX_MATERIAL_ALTERNATIVES
const MAX_AI_MATCHES = 3

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

/** 0-1 similarity to a one-decimal percentage, or null. */
const percent = (value) => (isFiniteNumber(value) ? `${(value * 100).toFixed(1)}%` : null)

const nullish = (value) => (value === null || value === undefined || value === '' ? null : value)

/** A 3-channel numeric tuple, or null. */
const tripleOrNull = (value) =>
  Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(isFiniteNumber)
    ? value
    : null

/* -------------------------------- Shared --------------------------------- */

/** A real, measured duration, or null when nothing was measured. */
export function buildDurationModel(measuredDurationMs) {
  const text = formatDuration(measuredDurationMs)
  return text ? { text, label: `Completed in ${text}` } : null
}

function buildDetectionModel(data) {
  const detection = data?.detection
  if (!detection) return null

  const detected = detection.detected === true
  const confidence = percent(detection.confidence)
  const area = isFiniteNumber(data.segmentation?.maskAreaRatio)
    ? percent(data.segmentation.maskAreaRatio)
    : null

  return {
    detected,
    statusText: detected ? 'Detected' : 'Not detected',
    headline: detected ? 'Flame detected' : 'No flame detected',
    confidence,
    flameArea: area,
    confidenceRatio: isFiniteNumber(detection.confidence) ? detection.confidence : null,
    // Shown as a number + word so status never depends on colour alone.
    statusNote: detected
      ? 'A flame region was located in the image.'
      : 'No flame region was located in this image.',
  }
}

function buildFlameColorModel(color, { title = 'Mean Flame Color', average = false } = {}) {
  if (!color?.mean) return null

  const rgb = tripleOrNull(color.mean.rgb)
  const lab = tripleOrNull(color.mean.lab)
  if (!rgb && !lab) return null

  return {
    title,
    average,
    rgb: formatRgb(color.mean.rgb),
    lab: formatLab(color.mean.lab),
    swatch: rgbToCss(color.mean.rgb),
    hasRgb: Boolean(rgb),
    hasLab: Boolean(lab),
  }
}

function buildMaterialModel(material, { title = 'Material Identification' } = {}) {
  if (!material?.name) return null

  const alternatives = (material.alternatives ?? [])
    .slice(0, MAX_ALTERNATIVES)
    .map((alt, index) => ({
      rank: index + 1,
      label: String(index + 1).padStart(2, '0'),
      name: alt.name,
      similarity: percent(alt.similarity),
    }))

  return {
    title,
    name: material.name,
    similarity: percent(material.similarity),
    similarityRatio: isFiniteNumber(material.similarity) ? material.similarity : null,
    alternatives,
    hasAlternatives: alternatives.length > 0,
  }
}

const AI_LEVEL_TONE = { low: 'low', medium: 'medium', high: 'high' }

/**
 * The AI second opinion, or `null` when it must not be shown.
 *
 * This is the single gate for both source types. The card is built only when:
 *
 *  - the backend actually returned a result (`available`), and
 *  - the final primary AI confidence - the top ranked match - is at least
 *    `AI_VISIBILITY_THRESHOLD_PERCENT` (45%).
 *
 * Everything else hides the card entirely: a confidence below the threshold, a
 * missing confidence, a `null` confidence and a malformed section all produce
 * `null`. That also means the "AI analysis is uncertain" note can never appear
 * above an absent card, and no empty card is ever rendered.
 *
 * No averaging happens here or anywhere else in the frontend: for a video the
 * confidence is the backend's single consolidated answer.
 */
export function buildAiModel(ai, { aggregated = false } = {}) {
  if (!ai || ai.available !== true) return null

  const top = ai.matches?.[0] ?? null
  const confidence = isFiniteNumber(top?.confidencePercent) ? top.confidencePercent : null

  // No usable final confidence means there is no finding to present.
  if (confidence === null || confidence < AI_VISIBILITY_THRESHOLD_PERCENT) return null

  const level = ai.overallConfidenceLevel
    ? String(ai.overallConfidenceLevel).toLowerCase()
    : null

  return {
    available: true,
    aggregated,
    primaryMaterial: nullish(ai.primaryMaterial) ?? nullish(top?.material),
    confidence,
    confidenceText: `${confidence.toFixed(1)}%`,
    level: level ? level.charAt(0).toUpperCase() + level.slice(1) : null,
    levelTone: level && AI_LEVEL_TONE[level] ? AI_LEVEL_TONE[level] : null,
    matches: (ai.matches ?? []).slice(0, MAX_AI_MATCHES).map((match, index) => ({
      rank: index + 1,
      label: String(index + 1).padStart(2, '0'),
      material: match.material,
      confidence: isFiniteNumber(match.confidencePercent)
        ? `${match.confidencePercent.toFixed(1)}%`
        : null,
    })),
    why: nullish(ai.reasoningSummary),
  }
}

function buildFireClassModel(fireClass, agents, material) {
  const agentList = (agents ?? [])
    .map((agent) => ({ name: agent?.name ?? null, type: agent?.type ?? null }))
    .filter((agent) => agent.name)
  const name = nullish(fireClass?.name)

  if (!name && agentList.length === 0) return null

  const materialName = nullish(fireClass?.material) ?? nullish(material?.name)

  return {
    name,
    description: nullish(fireClass?.description),
    material: materialName,
    agents: agentList,
    // One short sentence at most - no regulatory or algorithmic explanation.
    sentence: name
      ? `Fire class ${name}${
          materialName ? `, matched from ${materialName.toLowerCase()}` : ''
        }.`
      : null,
  }
}

/* --------------------------------- Image --------------------------------- */

/**
 * Image result model. `data` is the normalised /analyze payload; the analysed
 * image is shown from the uploaded preview with the API's mask layered on top.
 */
export function buildImageResultModel({ data, previewUrl, dimensions, measuredDurationMs } = {}) {
  if (!data) return null

  const detection = buildDetectionModel(data)
  const flameColor = buildFlameColorModel(data.color)
  const material = buildMaterialModel(data.material)
  const ai = buildAiModel(data.aiMaterialAnalysis)
  const fireClass = buildFireClassModel(data.fireClass, data.agents, data.material)
  const suppression = data.suppression?.methods?.length ? data.suppression : null

  const maskUrl = data.segmentation?.maskUrl ?? null
  const aspectRatio =
    isFiniteNumber(dimensions?.width) && isFiniteNumber(dimensions?.height) && dimensions.height > 0
      ? `${dimensions.width} / ${dimensions.height}`
      : '4 / 3'

  const hasContent = Boolean(
    detection ||
      flameColor ||
      material ||
      fireClass ||
      suppression ||
      ai ||
      data.segmentation?.maskUrl,
  )

  return {
    kind: 'image',
    hasContent,
    flameImage: {
      src: previewUrl ?? null,
      maskUrl,
      aspectRatio,
      label: 'Analyzed Image',
      detected: detection ? detection.detected : null,
      hasMask: Boolean(maskUrl),
    },
    detection,
    flameColor,
    material,
    ai,
    fireClass,
    suppression: suppression
      ? { methods: suppression.methods.slice(0, MAX_ALTERNATIVES) }
      : null,
    duration: buildDurationModel(measuredDurationMs),
  }
}

/* --------------------------------- Video --------------------------------- */

/**
 * Video result model, built from the aggregated frame results plus the two
 * backend answers the video workflow produces.
 *
 * `materialIdentification` is the normalised `POST /material-identification`
 * response - the deterministic matcher run on the averaged flame colour. It is
 * the source of truth for both the material card and the fire class, so the fire
 * class is never derived from the AI result and no client-side mapping exists.
 *
 * `videoAi` is the normalised `POST /video-material-analysis` response: ONE
 * consolidated assessment for the whole clip. It is passed through unchanged -
 * there is no averaging of per-frame confidences here or anywhere else.
 */
export function buildVideoResultModel({
  frames,
  aggregation,
  materialIdentification = null,
  videoAi = null,
  materialIdentificationFailed = false,
  measuredDurationMs,
  selectedFrameCount,
  representativeCount,
} = {}) {
  const framesList = frames ?? aggregation?.frames ?? []
  // A run where nothing was analysed still renders, so the user sees the failure
  // in context instead of an empty panel.
  const agg = aggregation ?? {
    frames: framesList,
    framesAnalyzed: framesList.length,
    framesSucceeded: 0,
    framesWithFlame: 0,
    failedCount: framesList.length,
    reliable: false,
    averageConfidence: null,
    rgb: null,
    lab: null,
    colorBasis: 'none',
  }

  const representative = selectRepresentativeFrames(agg.frames, representativeCount)

  // Null below the 45% threshold, or when Gemini could not answer: the AI card is
  // then simply not rendered.
  const ai = buildAiModel(videoAi, { aggregated: true })

  const flameColor = buildFlameColorModel(
    agg.rgb || agg.lab ? { mean: { rgb: agg.rgb, lab: agg.lab } } : null,
    { title: 'Average Flame Color', average: true },
  )

  const material = buildMaterialModel(materialIdentification?.material ?? null)
  // Derived from the deterministic match, never from the AI answer.
  const fireClass = buildFireClassModel(
    materialIdentification?.fireClass ?? null,
    materialIdentification?.agents ?? [],
    materialIdentification?.material ?? null,
  )
  const suppression = materialIdentification?.suppression?.methods?.length
    ? materialIdentification.suppression
    : null

  return {
    kind: 'video',
    hasContent: Boolean(
      representative.length > 0 || flameColor || material || fireClass || suppression || ai,
    ),
    gallery: representative.map((frame) => ({
      key: `frame-${frame.index}`,
      label: `Frame ${frame.index + 1}`,
      timestamp: frame.timestamp,
      dataUrl: frame.dataUrl,
      maskUrl: frame.maskUrl,
      detected: frame.detected,
      statusText: frame.detected ? 'Detected' : 'Not detected',
      hasMask: Boolean(frame.maskUrl),
    })),
    summary: {
      selectedFrames: selectedFrameCount ?? agg.framesAnalyzed,
      analyzedFrames: agg.framesAnalyzed,
      successfulFrames: agg.framesSucceeded,
      failedFrames: agg.failedCount,
      flameFrames: agg.framesWithFlame,
      flameFrameText: `${agg.framesWithFlame} / ${agg.framesSucceeded}`,
      anyFlame: agg.framesWithFlame > 0,
      reliable: agg.reliable,
      warning: agg.reliable ? null : 'Not enough valid frames to produce a reliable result.',
      // Stated as a fact, not an explanation: the deterministic endpoint could
      // not answer and nothing is invented in its place.
      materialUnavailable: Boolean(materialIdentificationFailed),
    },
    detection: {
      detected: agg.framesWithFlame > 0,
      statusText: agg.framesWithFlame > 0 ? 'Detected' : 'Not detected',
      headline:
        agg.framesWithFlame > 0
          ? `Flame seen in ${agg.framesWithFlame} of ${agg.framesSucceeded} frames`
          : 'No flame seen in the analyzed frames',
      confidence: agg.averageConfidence === null ? null : `${(agg.averageConfidence * 100).toFixed(1)}%`,
      confidenceRatio: agg.averageConfidence,
      flameArea: null,
      statusNote: 'Average confidence across the analyzed frames with a detected flame.',
    },
    flameColor,
    material,
    ai,
    fireClass,
    suppression: suppression ? { methods: suppression.methods.slice(0, MAX_ALTERNATIVES) } : null,
    duration: buildDurationModel(measuredDurationMs),
    frameCount: framesList.length,
  }
}
