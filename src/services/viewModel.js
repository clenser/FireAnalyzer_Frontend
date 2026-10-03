/**
 * View models for the result dashboard.
 *
 * These pure builders are the single place where a normalised API payload
 * (see `services/normalize.js`) becomes user-facing copy:
 *
 *  1. A card can only render what a builder hands it, so developer-facing data
 *     (raw LAB distances, fusion weights, per-stage timings, mask resolution)
 *     cannot leak into the UI even though `services/normalize` still parses it
 *     for API consumers.
 *  2. Wording is plain language, with no fusion/CV terminology.
 *  3. Every builder is a pure function of the payload, so rendering is
 *     unit-tested without a browser.
 *  4. A card the data cannot justify is not built at all - the AI Material
 *     Analysis card (image only - the backend never attaches one to a video)
 *     exists only when its confidence reaches `AI_VISIBILITY_THRESHOLD_PERCENT`,
 *     and the material card states "uncertain" rather than guessing whenever
 *     the backend's own Python fusion could not decide.
 *  5. Uncertain is never dressed up as a negative headline. An uncertain video
 *     leads with its strongest available evidence - the #1 colour match and the
 *     #1 AI vision match - because "no frame could be decided on its own" is an
 *     internal per-frame diagnostic, not a useful thing to tell the user about
 *     the video as a whole.
 */

import { formatLab, formatRgb, rgbToCss } from './normalize.js'
import { formatDuration } from '../utils/format.js'
import { AI_VISIBILITY_THRESHOLD_PERCENT, MAX_MATERIAL_ALTERNATIVES } from '../config.js'

const MAX_ALTERNATIVES = MAX_MATERIAL_ALTERNATIVES
const MAX_AI_MATCHES = 3
const MAX_EVIDENCE_ROWS = 5

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

/** 0-1 ratio to a one-decimal percentage, or null. */
const percent = (value) => (isFiniteNumber(value) ? `${(value * 100).toFixed(1)}%` : null)

/** A 0-100 value already expressed as a percentage, to one decimal, or null. */
const percentValue = (value) => (isFiniteNumber(value) ? `${value.toFixed(1)}%` : null)

const nullish = (value) => (value === null || value === undefined || value === '' ? null : value)

const titleCase = (value) =>
  typeof value === 'string' && value ? value.charAt(0).toUpperCase() + value.slice(1) : null

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
  const area = isFiniteNumber(data.segmentation?.maskAreaRatio) ? percent(data.segmentation.maskAreaRatio) : null
  const count = isFiniteNumber(data.detectionCount) ? data.detectionCount : data.detections?.length ?? 0

  return {
    detected,
    statusText: detected ? 'Detected' : 'Not detected',
    headline: detected ? 'Flame detected' : 'No flame detected',
    confidence,
    flameArea: area,
    confidenceRatio: isFiniteNumber(detection.confidence) ? detection.confidence : null,
    detectionCount: count,
    // Multiple flame regions were found and their masks merged for analysis;
    // the detection boxes themselves are never merged.
    multipleDetections: count > 1,
    regionsText: count > 1 ? `${count} flame regions detected` : null,
    detections: (data.detections ?? []).slice(0, 3).map((entry, index) => ({
      index: entry.index ?? index,
      confidence: percent(entry.confidence),
    })),
  }
}

function buildFlameColorModel(color, { title = 'Mean Flame Color', average = false } = {}) {
  if (!color?.mean) return null

  const { rgb, lab } = color.mean
  if (!rgb && !lab) return null

  return {
    title,
    average,
    rgb: formatRgb(rgb),
    lab: formatLab(lab),
    swatch: rgbToCss(rgb),
    hasRgb: Boolean(rgb),
    hasLab: Boolean(lab),
  }
}

/**
 * The Python-fused material result, or an explicit "uncertain" state.
 *
 * `material` is the normalised fusion decision (`final_material`, `confidence`,
 * `uncertain`, `uncertaintyReasons`). `candidates` is only meaningful for a
 * single image (`candidate_materials` score shape); a video passes `[]` here
 * and shows its own vote distribution in a separate card instead.
 *
 * `variant` picks which uncertain layout the card renders. `'image'` shows the
 * backend's own reasons under "Confidence / evidence explanation"; `'video'`
 * deliberately does not carry them at all - see the uncertain branch below.
 */
function buildMaterialModel(
  material,
  candidates = [],
  {
    title = 'Material Identification',
    variant = 'image',
    deterministicEvidence = null,
    visionEvidence = null,
    // Pre-built fallbacks for a video result: the backend's own aggregated
    // `evidence_summary.top_colour_match` / `top_vision_match`, each already
    // `{ label, name, confidence }`. Used only when no per-frame
    // deterministic/vision evidence is available to derive a #1 from.
    topColourMatch = null,
    topVisionMatch = null,
  } = {},
) {
  if (!material) return null

  if (material.uncertain || !material.finalMaterial) {
    // No final material was decided. Rather than a single invented answer, or
    // a frontend-combined ranking, the card shows exactly the two single-source
    // top matches the fusion engine actually weighed: the deterministic
    // colour/LAB matcher's #1 and the vision provider's #1 - each with its own
    // real backend confidence, never recalculated or merged into one list.
    const topColourEntry = deterministicEvidence?.ranking?.[0] ?? null
    const topVisionEntry = visionEvidence?.candidates?.[0] ?? null
    const visionLabel =
      visionEvidence?.provider && visionEvidence.provider !== 'none' ? titleCase(visionEvidence.provider) : 'AI'

    const topMatches = {
      colour: topColourEntry
        ? { label: 'Colour', name: topColourEntry.material, confidence: percent(topColourEntry.similarity) }
        : topColourMatch,
      vision: topVisionEntry
        ? { label: visionLabel, name: topVisionEntry.material, confidence: percent(topVisionEntry.confidence) }
        : topVisionMatch,
    }

    const uncertain = {
      title,
      variant,
      uncertain: true,
      name: null,
      topMatches,
      hasTopMatches: Boolean(topMatches.colour || topMatches.vision),
    }

    // A video's `uncertainty_reasons` are frame-level diagnostics ("every
    // analysed frame was individually uncertain"). Summarising a whole video
    // with them says nothing useful about the video and reads as a bad result,
    // so they are never handed to the card: the strongest evidence leads, and
    // the remaining candidates stay in the collapsed evidence disclosure. An
    // image keeps its own reasons - there the explanation is the whole card.
    return variant === 'video' ? uncertain : { ...uncertain, reasons: material.uncertaintyReasons ?? [] }
  }

  const alternatives = (candidates ?? [])
    .filter((entry) => entry.material !== material.finalMaterial)
    .slice(0, MAX_ALTERNATIVES)
    .map((alt, index) => ({
      rank: index + 1,
      label: String(index + 1).padStart(2, '0'),
      name: alt.material,
      similarity: percent(alt.score),
    }))

  return {
    title,
    variant,
    uncertain: false,
    name: material.finalMaterial,
    similarity: percentValue(material.confidencePercent) ?? percent(material.confidence),
    similarityRatio: isFiniteNumber(material.confidence) ? material.confidence : null,
    confidenceLevel: material.confidenceLevel ? titleCase(material.confidenceLevel) : null,
    alternatives,
    hasAlternatives: alternatives.length > 0,
  }
}

/** The compact "Analysis Evidence" disclosure: what fed the fusion decision. */
function buildEvidenceModel(deterministicEvidence, visionEvidence) {
  const ranking = (deterministicEvidence?.ranking ?? [])
    .slice(0, MAX_EVIDENCE_ROWS)
    .map((entry) => ({ material: entry.material, similarity: percent(entry.similarity) }))

  const visionCandidates = (visionEvidence?.candidates ?? [])
    .slice(0, MAX_EVIDENCE_ROWS)
    .map((entry) => ({ material: entry.material, confidence: percent(entry.confidence) }))

  if (ranking.length === 0 && visionCandidates.length === 0) return null

  return {
    evidenceQuality: deterministicEvidence?.evidenceQuality ? titleCase(deterministicEvidence.evidenceQuality) : null,
    ranking,
    visionProvider:
      visionEvidence?.provider && visionEvidence.provider !== 'none' ? titleCase(visionEvidence.provider) : null,
    visionCandidates,
  }
}

/** `share`/`frames` → `"72.0% · 3/4 frames"`, or just whichever half is available. */
function buildEvidenceScoreText(entry, totalFrames) {
  if (!entry) return null
  const sharePart = percent(entry.share)
  const framesPart =
    isFiniteNumber(entry.frames) && isFiniteNumber(totalFrames) && totalFrames > 0
      ? `${entry.frames}/${totalFrames} frames`
      : null
  const text = [sharePart, framesPart].filter(Boolean).join(' · ')
  return text || null
}

/**
 * The video's #1 colour/#1 vision match, built from the backend's own
 * `evidence_summary` - frame-aggregated, independent of the fused per-frame
 * decision, so it stays available even when the consolidated material is
 * uncertain. Fed into `buildMaterialModel`'s uncertain-branch fallback.
 *
 * Each entry carries the heading its own row is shown under. The headings are
 * fixed, neutral and evidence-first ("Top colour match", "Top AI vision match"):
 * the score beside each name is the backend's own, never recomputed here.
 */
function buildVideoTopMatches(evidenceSummary) {
  if (!evidenceSummary) return { colour: null, vision: null }
  const { topColourMatch, topVisionMatch, colourFramesConsidered, visionFramesConsidered } = evidenceSummary

  return {
    colour: topColourMatch
      ? {
          heading: 'Top colour match',
          name: topColourMatch.material,
          confidence: buildEvidenceScoreText(topColourMatch, colourFramesConsidered),
        }
      : null,
    vision: topVisionMatch
      ? {
          heading: 'Top AI vision match',
          name: topVisionMatch.material,
          confidence: buildEvidenceScoreText(topVisionMatch, visionFramesConsidered),
        }
      : null,
  }
}

/**
 * The video's hidden evidence disclosure: candidates beyond the #1 shown
 * above, plus the per-frame material vote distribution. Everything here is a
 * frame count/share the backend already computed - nothing is recomputed.
 */
function buildVideoEvidenceModel(evidenceSummary, distribution) {
  const colourFrames = evidenceSummary?.colourFramesConsidered ?? null
  const visionFrames = evidenceSummary?.visionFramesConsidered ?? null

  const ranking = (evidenceSummary?.colourDistribution ?? [])
    .slice(1, MAX_EVIDENCE_ROWS + 1)
    .map((entry) => ({ material: entry.material, similarity: buildEvidenceScoreText(entry, colourFrames) }))

  const visionCandidates = (evidenceSummary?.visionDistribution ?? [])
    .slice(1, MAX_EVIDENCE_ROWS + 1)
    .map((entry) => ({ material: entry.material, confidence: buildEvidenceScoreText(entry, visionFrames) }))

  const hasDistribution = Boolean(distribution?.length)

  if (ranking.length === 0 && visionCandidates.length === 0 && !hasDistribution) return null

  return {
    evidenceQuality: null,
    ranking,
    visionProvider: null,
    visionCandidates,
    distribution: hasDistribution ? distribution : null,
  }
}

const AI_LEVEL_TONE = { low: 'low', medium: 'medium', high: 'high' }

/**
 * The secondary AI (Gemini) opinion on an image, or `null` when it must not be
 * shown. It never feeds into the fused material above and the backend never
 * attaches one to a video frame or a video result.
 *
 * The card is built only when the backend actually returned a result
 * (`available`) and its top-ranked confidence reaches
 * `AI_VISIBILITY_THRESHOLD_PERCENT`. Everything else - a low confidence, a
 * missing one, a malformed section - hides the card entirely rather than
 * rendering an empty or "uncertain" placeholder.
 */
export function buildAiModel(ai) {
  if (!ai || ai.available !== true) return null

  const top = ai.matches?.[0] ?? null
  const confidence = isFiniteNumber(top?.confidencePercent) ? top.confidencePercent : null

  if (confidence === null || confidence < AI_VISIBILITY_THRESHOLD_PERCENT) return null

  const level = ai.overallConfidenceLevel ? String(ai.overallConfidenceLevel).toLowerCase() : null

  return {
    available: true,
    primaryMaterial: nullish(ai.primaryMaterial) ?? nullish(top?.material),
    confidence,
    confidenceText: `${confidence.toFixed(1)}%`,
    level: level ? titleCase(level) : null,
    levelTone: level && AI_LEVEL_TONE[level] ? AI_LEVEL_TONE[level] : null,
    matches: (ai.matches ?? []).slice(0, MAX_AI_MATCHES).map((match, index) => ({
      rank: index + 1,
      label: String(index + 1).padStart(2, '0'),
      material: match.material,
      confidence: isFiniteNumber(match.confidencePercent) ? `${match.confidencePercent.toFixed(1)}%` : null,
    })),
  }
}

function buildFireClassModel(fireClass, agents, fallbackMaterialName) {
  const agentList = (agents ?? [])
    .map((agent) => ({ name: agent?.name ?? null, type: agent?.type ?? null }))
    .filter((agent) => agent.name)
  const name = nullish(fireClass?.name)

  if (!name && agentList.length === 0) return null

  const materialName = nullish(fireClass?.material) ?? nullish(fallbackMaterialName)

  return {
    name,
    description: nullish(fireClass?.description),
    material: materialName,
    agents: agentList,
  }
}

/* --------------------------------- Image --------------------------------- */

/**
 * Image result model. `data` is the normalised `/analyze` payload; the
 * analysed image is shown from the uploaded preview with the API's merged
 * flame mask layered on top.
 */
export function buildImageResultModel({ data, previewUrl, dimensions, measuredDurationMs, wasForced = false } = {}) {
  if (!data) return null

  const detection = buildDetectionModel(data)
  const flameColor = buildFlameColorModel(data.color)
  const material = buildMaterialModel(data.material, data.candidates, {
    deterministicEvidence: data.deterministicEvidence,
    visionEvidence: data.visionEvidence,
  })
  const evidence = buildEvidenceModel(data.deterministicEvidence, data.visionEvidence)
  const ai = buildAiModel(data.aiMaterialAnalysis)
  const fireClass = buildFireClassModel(data.fireClass, data.agents, data.material?.finalMaterial)
  const suppression = data.suppression?.methods?.length ? data.suppression : null

  const maskUrl = data.segmentation?.maskUrl ?? null
  const aspectRatio =
    isFiniteNumber(dimensions?.width) && isFiniteNumber(dimensions?.height) && dimensions.height > 0
      ? `${dimensions.width} / ${dimensions.height}`
      : '4 / 3'

  const hasContent = Boolean(
    detection || flameColor || material || fireClass || suppression || ai || data.segmentation?.maskUrl,
  )

  return {
    kind: 'image',
    hasContent,
    cached: data.cached === true,
    // force_new_analysis always makes the backend bypass its cache, so this is
    // never true at the same time as `cached` - the two chips are mutually
    // exclusive, never merged into one ambiguous label.
    wasForced: wasForced === true,
    flameImage: {
      src: previewUrl ?? null,
      maskUrl,
      aspectRatio,
      label: 'Analyzed Image',
      detected: detection ? detection.detected : null,
      hasMask: Boolean(maskUrl),
      regionsText: detection?.regionsText ?? null,
    },
    detection,
    flameColor,
    material,
    evidence,
    ai,
    fireClass,
    suppression: suppression ? { methods: suppression.methods.slice(0, MAX_ALTERNATIVES) } : null,
    duration: buildDurationModel(measuredDurationMs),
  }
}

/* --------------------------------- Video --------------------------------- */

function buildFrameTile(frame) {
  if (!frame) return null
  const material = buildMaterialModel(frame.material, [])
  const fireClass = buildFireClassModel(frame.fireClass, [], frame.material?.finalMaterial)
  return {
    key: `frame-${frame.frameIndex ?? 0}`,
    frameIndex: frame.frameIndex,
    label: isFiniteNumber(frame.frameIndex) ? `Frame ${frame.frameIndex + 1}` : 'Frame',
    timestamp: frame.timestampSeconds,
    dataUrl: frame.thumbnailUrl,
    maskUrl: frame.segmentation?.maskUrl ?? null,
    success: frame.success === true,
    detected: frame.detection?.detected === true,
    statusText: frame.success
      ? frame.detection?.detected
        ? 'Detected'
        : 'Not detected'
      : 'Not analyzed',
    hasMask: Boolean(frame.segmentation?.maskUrl),
    detectionCount: frame.detectionCount ?? 0,
    materialName: material && !material.uncertain ? material.name : null,
    materialUncertain: material ? material.uncertain : !frame.success,
    confidence: material && !material.uncertain ? material.similarity : null,
    fireClassName: fireClass?.name ?? null,
    errorMessage: frame.errorMessage ?? null,
  }
}

/** The material-distribution breakdown (`candidate_materials` vote shape). */
function buildDistributionModel(distribution, totalFrames) {
  if (!distribution?.length) return null
  const total = isFiniteNumber(totalFrames) && totalFrames > 0 ? totalFrames : null
  return distribution.map((entry) => ({
    material: entry.material,
    frames: entry.frames,
    framesText: `${entry.frames} frame${entry.frames === 1 ? '' : 's'}`,
    share: total ? percent(entry.frames / total) : null,
  }))
}

/**
 * Video result model, built directly from the normalised `/analyze-video`
 * payload. The backend has already sampled the frames, fused each one and run
 * the Python majority/consistency vote - nothing is re-aggregated here, and no
 * AI model ever produces a video-level conclusion.
 */
export function buildVideoResultModel({ data, measuredDurationMs, wasForced = false } = {}) {
  if (!data) return null

  const topMatches = buildVideoTopMatches(data.evidenceSummary)
  const material = buildMaterialModel(data.material, [], {
    variant: 'video',
    topColourMatch: topMatches.colour,
    topVisionMatch: topMatches.vision,
  })
  const distribution = buildDistributionModel(data.distribution, data.consolidated?.framesAnalyzed)
  const evidence = buildVideoEvidenceModel(data.evidenceSummary, distribution)
  const fireClass = buildFireClassModel(data.fireClass, data.agents, data.material?.finalMaterial)
  const suppression = data.suppression?.methods?.length ? data.suppression : null

  const representative = (data.representativeFrames ?? []).map(buildFrameTile).filter(Boolean)
  const allFrames = (data.frames ?? []).map(buildFrameTile).filter(Boolean)

  const framesSampled = data.video?.framesSampled ?? data.detectionSummary?.sampledFrames ?? allFrames.length
  const framesWithFlame = data.detectionSummary?.flameFrames ?? data.framesWithFlame ?? 0
  const framesAnalyzed = data.consolidated?.framesAnalyzed ?? null

  const hasContent = Boolean(representative.length > 0 || material || fireClass || suppression || allFrames.length)

  return {
    kind: 'video',
    hasContent,
    cached: data.cached === true,
    wasForced: wasForced === true,
    gallery: representative,
    allFrames,
    summary: {
      framesSampled,
      framesWithFlame,
      framesAnalyzed,
      flameFrameText: `${framesWithFlame} / ${framesSampled}`,
      anyFlame: framesWithFlame > 0,
      uncertainFrames: data.consolidated?.uncertainFrames ?? null,
    },
    detection: {
      detected: framesWithFlame > 0,
      statusText: framesWithFlame > 0 ? 'Detected' : 'Not detected',
      // The backend's own `detection_summary.text` - never a percentage, which
      // would either be fabricated or average several frames' confidences
      // into one meaningless number. A fallback covers an older cached
      // payload saved before this field existed.
      headline:
        data.detectionSummary?.text ??
        (framesWithFlame > 0
          ? `Flame seen in ${framesWithFlame} of ${framesSampled} sampled frames`
          : 'No flame seen in the sampled frames'),
      // Deliberately no confidence/flameArea here: a video's "detection
      // confidence" would really be the fused material confidence, which is
      // already shown (correctly labelled) on the material card below.
      confidence: null,
      confidenceRatio: null,
      flameArea: null,
    },
    material,
    evidence,
    distribution,
    fireClass,
    suppression: suppression ? { methods: suppression.methods.slice(0, MAX_ALTERNATIVES) } : null,
    duration: buildDurationModel(measuredDurationMs),
    video: data.video,
  }
}
