/**
 * Defensive normalisation of the current backend's `/analyze` and
 * `/analyze-video` payloads (see `app/api.py`, `app/schemas.py` and
 * `app/material_fusion.py` in the backend repository for the authoritative
 * contract this mirrors).
 *
 * Both endpoints share one pipeline: up to three YOLO detections, one mask per
 * detection merged into a single flame mask, CIELAB/RGB colour evidence from
 * that merged mask, vision evidence (Groq, Gemini fallback) and a **Python**
 * fusion engine that decides the final material (`final_material`,
 * `confidence`, `uncertain`) - never an LLM. The video endpoint runs the same
 * pipeline per sampled frame and adds a Python majority/consistency vote.
 *
 * Every accessor here is defensive: a field that is missing, renamed or
 * malformed becomes `null`/`[]` rather than throwing, so a backend revision
 * degrades the UI instead of crashing it.
 */

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)

const num = (v) => (isFiniteNumber(v) ? v : null)

function firstNumber(source, keys) {
  if (!source || typeof source !== 'object') return null
  for (const key of keys) {
    if (isFiniteNumber(source[key])) return source[key]
  }
  return null
}

function firstString(source, keys) {
  if (!source || typeof source !== 'object') return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function firstObject(source, keys) {
  if (!source || typeof source !== 'object') return null
  for (const key of keys) {
    const value = source[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) return value
  }
  return null
}

function firstArray(source, keys) {
  if (!source || typeof source !== 'object') return null
  for (const key of keys) {
    const value = source[key]
    if (Array.isArray(value)) return value
  }
  return null
}

function triState(value) {
  return typeof value === 'boolean' ? value : null
}

function rgbTuple(value) {
  if (!Array.isArray(value) || value.length < 3) return null
  const [r, g, b] = value
  if (![r, g, b].every((c) => isFiniteNumber(c))) return null
  return [Math.round(r), Math.round(g), Math.round(b)]
}

function labTuple(value) {
  if (!Array.isArray(value) || value.length < 3) return null
  const [l, a, b] = value
  if (![l, a, b].every((c) => isFiniteNumber(c))) return null
  return [l, a, b]
}

function formatChannel(value, digits) {
  if (!isFiniteNumber(value)) return '--'
  return value.toFixed(digits)
}

function normaliseBoundingBox(raw) {
  if (!raw || typeof raw !== 'object') return null
  const x1 = num(raw.x1)
  const y1 = num(raw.y1)
  const x2 = num(raw.x2)
  const y2 = num(raw.y2)
  if (x1 === null || y1 === null || x2 === null || y2 === null) return null
  if (x2 <= x1 || y2 <= y1) return null
  return { x1, y1, x2, y2, width: x2 - x1, height: y2 - y1 }
}

/** Builds a displayable <img> source from the backend's base64 PNG mask. */
export function maskDataUrl(mask, encoding) {
  if (typeof mask !== 'string') return null
  const trimmed = mask.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:')) return trimmed
  if (encoding && encoding !== 'png_base64') return null
  return `data:image/png;base64,${trimmed}`
}

/** Builds a displayable <img> source from a video frame's base64 JPEG thumbnail. */
export function thumbnailDataUrl(thumbnail) {
  if (!thumbnail || typeof thumbnail !== 'object') return null
  const data = firstString(thumbnail, ['data'])
  if (!data) return null
  const encoding = firstString(thumbnail, ['encoding'])
  if (encoding && encoding !== 'jpeg_base64') return null
  return `data:image/jpeg;base64,${data}`
}

/* --------------------------------- Detection -------------------------------- */

function normaliseDetection(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    detected: triState(raw.detected),
    confidence: firstNumber(raw, ['confidence']),
    boundingBox: normaliseBoundingBox(firstObject(raw, ['bounding_box', 'bbox'])),
  }
}

/** Every individual flame detection (`detections[]`), boxes never merged. */
function normaliseDetections(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null
      return {
        index: num(entry.index) ?? index,
        confidence: firstNumber(entry, ['confidence']),
        boundingBox: normaliseBoundingBox(firstObject(entry, ['bounding_box', 'bbox'])),
        maskSource: firstString(entry, ['mask_source']),
      }
    })
    .filter(Boolean)
}

function normaliseSegmentation(raw) {
  if (!raw || typeof raw !== 'object') return null
  const maskEncoding = firstString(raw, ['mask_encoding'])
  const maskPayload = firstString(raw, ['mask'])
  return {
    available: triState(raw.available),
    fallbackUsed: triState(raw.fallback_used ?? raw.fallback),
    flamePixelCount: firstNumber(raw, ['flame_pixel_count']),
    maskAreaRatio: firstNumber(raw, ['mask_area_ratio']),
    confidence: firstNumber(raw, ['confidence']),
    // The real, merged segmented flame region, ready to overlay on the photo.
    maskUrl: maskDataUrl(maskPayload, maskEncoding),
    maskWidth: firstNumber(raw, ['mask_width']),
    maskHeight: firstNumber(raw, ['mask_height']),
    maskCount: firstNumber(raw, ['mask_count']),
    merged: triState(raw.merged),
  }
}

/** The mean colour of every pixel in the merged flame mask. */
function normaliseColor(flameRaw) {
  const meanRaw = firstObject(flameRaw, ['mean_color'])
  if (!meanRaw) return null
  const rgb = rgbTuple(meanRaw.rgb)
  const lab = labTuple(meanRaw.lab)
  if (!rgb && !lab) return null
  return { mean: { rgb, lab } }
}

/* ------------------------------ Fused material ------------------------------ */

/**
 * The Python fusion decision (`app/material_fusion.py`): `final_material` is
 * `null` whenever the evidence is uncertain - never a guess - and
 * `uncertaintyReasons` is the backend's own explanation, not a client guess.
 */
function normaliseFusedMaterial(payload) {
  if (!payload || typeof payload !== 'object') return null
  if (payload.final_material === undefined && payload.confidence === undefined) return null

  return {
    finalMaterial: firstString(payload, ['final_material']),
    confidence: firstNumber(payload, ['confidence']),
    confidencePercent: firstNumber(payload, ['confidence_percent']),
    confidenceLevel: firstString(payload, ['confidence_level']),
    uncertain: payload.uncertain === true,
    uncertaintyReasons: (firstArray(payload, ['uncertainty_reasons']) ?? []).filter(
      (reason) => typeof reason === 'string' && reason.trim(),
    ),
    leadingCandidates: (firstArray(payload, ['leading_candidates']) ?? []).filter(
      (name) => typeof name === 'string' && name.trim(),
    ),
  }
}

/** Per-image/per-frame ranked candidates (`candidate_materials[]`, score shape). */
function normaliseCandidateScores(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const material = firstString(entry, ['material'])
      if (!material) return null
      return {
        material,
        score: firstNumber(entry, ['score']),
        deterministicSupport: firstNumber(entry, ['deterministic_support']),
        visionSupport: firstNumber(entry, ['vision_support']),
      }
    })
    .filter(Boolean)
}

/** The video-level material vote distribution (`candidate_materials[]`, vote shape). */
function normaliseVoteDistribution(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const material = firstString(entry, ['material'])
      if (!material) return null
      return {
        material,
        frames: firstNumber(entry, ['frames']) ?? 0,
        meanConfidence: firstNumber(entry, ['mean_confidence']),
      }
    })
    .filter(Boolean)
}

function normaliseDeterministicEvidence(raw) {
  if (!raw || typeof raw !== 'object') return null
  const ranking = firstArray(raw, ['ranking']) ?? []
  return {
    available: triState(raw.available),
    evidenceQuality: firstString(raw, ['evidence_quality']),
    reliability: firstNumber(raw, ['reliability']),
    bestLabDistance: firstNumber(raw, ['best_lab_distance']),
    ranking: ranking
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const material = firstString(entry, ['material'])
        if (!material) return null
        return { material, similarity: firstNumber(entry, ['similarity']), support: firstNumber(entry, ['support']) }
      })
      .filter(Boolean),
  }
}

function normaliseVisionEvidence(raw) {
  if (!raw || typeof raw !== 'object') return null
  const provider = firstString(raw, ['vision_provider']) ?? 'none'
  const candidates = firstArray(raw, ['candidates']) ?? []
  return {
    provider,
    available: raw.available === true,
    uncertain: triState(raw.uncertain),
    candidates: candidates
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const material = firstString(entry, ['material'])
        if (!material) return null
        return {
          material,
          confidence: firstNumber(entry, ['confidence']),
          uncertainty: firstString(entry, ['uncertainty']),
        }
      })
      .filter(Boolean),
  }
}

/* ------------------------------ AI material (Gemini, secondary) ------------------------------ */

/**
 * Normalises the optional, numeric-only secondary Gemini opinion
 * (`ai_material_analysis`). It never sees the image - only the numbers the
 * deterministic pipeline already extracted - and it never feeds back into the
 * fused material above; it is shown (when confident enough) purely as a second
 * opinion. The backend never attaches this to a video frame.
 */
export function normaliseAiMaterialAnalysis(raw) {
  const unavailable = {
    available: false,
    primaryMaterial: null,
    matches: [],
    overallConfidenceLevel: null,
    uncertain: null,
    evidenceQuality: null,
    reasoningSummary: null,
    error: null,
  }

  if (!raw || typeof raw !== 'object') return { ...unavailable }

  const available = raw.available === true

  const matchesRaw = firstArray(raw, ['matches']) ?? []
  const matches = matchesRaw
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null
      const material = firstString(entry, ['material', 'name'])
      if (!material) return null
      return {
        rank: num(entry.rank) ?? index + 1,
        material,
        confidencePercent: num(entry.confidence_percent ?? entry.confidencePercent),
        reason: firstString(entry, ['reason']),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5)

  return {
    available,
    primaryMaterial: firstString(raw, ['primary_material', 'primaryMaterial']),
    matches,
    overallConfidenceLevel: firstString(raw, ['overall_confidence_level', 'overallConfidenceLevel']),
    uncertain: triState(raw.uncertain),
    evidenceQuality: firstString(raw, ['evidence_quality', 'evidenceQuality']),
    reasoningSummary: firstString(raw, ['reasoning_summary', 'reasoningSummary']),
    error: available ? null : firstString(raw, ['error']),
  }
}

/* -------------------------------- Fire class / agents / suppression -------------------------------- */

function normaliseFireClass(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = firstString(raw, ['class', 'fire_class', 'className'])
  if (!name) return null
  return {
    name,
    description: firstString(raw, ['description']),
    confidence: firstNumber(raw, ['confidence', 'similarity']),
    material: firstString(raw, ['material']),
    basis: firstString(raw, ['basis']),
    mappingSource: firstString(raw, ['mapping_source', 'mappingSource']),
    notes: firstString(raw, ['notes']),
  }
}

function normaliseAgents(raw) {
  const list = firstArray(raw, ['extinguishing_agents', 'extinguishingAgents', 'agents'])
  if (!list) return []

  return list
    .map((entry) => {
      if (typeof entry === 'string') {
        const trimmed = entry.trim()
        return trimmed ? { name: trimmed, type: null, compound: null, source: null } : null
      }
      if (!entry || typeof entry !== 'object') return null
      const name = firstString(entry, ['name', 'method', 'agent'])
      if (!name) return null
      return {
        name,
        type: firstString(entry, ['type', 'mechanism']),
        compound: firstString(entry, ['compound', 'formula']),
        source: firstString(entry, ['source']),
        fireClass: firstString(entry, ['fire_class', 'fireClass']),
      }
    })
    .filter(Boolean)
}

function normaliseSuppression(raw) {
  if (!raw || typeof raw !== 'object') return null
  const methodsRaw = firstArray(raw, ['methods', 'recommendations']) ?? []
  const methods = methodsRaw
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim()
      if (entry && typeof entry === 'object') return firstString(entry, ['method', 'name'])
      return null
    })
    .filter((m) => typeof m === 'string' && m.length > 0)

  if (methods.length === 0) return null

  return {
    methods,
    source: firstString(raw, ['source']),
    material: firstString(raw, ['material']),
    databaseNotes: firstString(raw, ['database_notes', 'notes']),
  }
}

function normaliseTiming(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    totalMs: firstNumber(raw, ['total_ms']),
  }
}

/* --------------------------------- Image result --------------------------------- */

/** Normalises one full `POST /analyze` success payload. */
export function normaliseImageResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      cached: false,
      detectionCount: 0,
      detection: null,
      detections: [],
      segmentation: null,
      color: null,
      material: null,
      candidates: [],
      deterministicEvidence: null,
      visionEvidence: null,
      aiMaterialAnalysis: normaliseAiMaterialAnalysis(null),
      suppression: null,
      fireClass: null,
      agents: [],
      timing: null,
    }
  }

  return {
    cached: payload.cached === true,
    detectionCount: firstNumber(payload, ['detection_count']) ?? 0,
    detection: normaliseDetection(firstObject(payload, ['fire_detection', 'detection'])),
    detections: normaliseDetections(firstArray(payload, ['detections'])),
    segmentation: normaliseSegmentation(firstObject(payload, ['segmentation'])),
    color: normaliseColor(firstObject(payload, ['flame_analysis'])),
    material: normaliseFusedMaterial(payload),
    candidates: normaliseCandidateScores(firstArray(payload, ['candidate_materials'])),
    deterministicEvidence: normaliseDeterministicEvidence(firstObject(payload, ['deterministic_evidence'])),
    visionEvidence: normaliseVisionEvidence(firstObject(payload, ['vision_evidence'])),
    aiMaterialAnalysis: normaliseAiMaterialAnalysis(firstObject(payload, ['ai_material_analysis'])),
    suppression: normaliseSuppression(firstObject(payload, ['suppression_information', 'suppression'])),
    fireClass: normaliseFireClass(firstObject(payload, ['fire_class', 'fireClass'])),
    agents: normaliseAgents(payload),
    timing: normaliseTiming(firstObject(payload, ['timing'])),
  }
}

/**
 * The video-level detection summary (`detection_summary`): a frame count, not
 * a confidence percentage - the backend deliberately never fabricates one for
 * video-level flame detection, so this normaliser does not invent one either.
 */
function normaliseDetectionSummary(raw) {
  if (!raw || typeof raw !== 'object') return null
  const flameFrames = firstNumber(raw, ['flame_frames'])
  const sampledFrames = firstNumber(raw, ['sampled_frames'])
  if (flameFrames === null || sampledFrames === null) return null
  return { flameFrames, sampledFrames, text: firstString(raw, ['text']) }
}

/** One entry of an aggregated video evidence distribution (material + frame count/share). */
function normaliseEvidenceEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const material = firstString(entry, ['material'])
  if (!material) return null
  return { material, frames: firstNumber(entry, ['frames']) ?? 0, share: firstNumber(entry, ['share']) }
}

function normaliseEvidenceDistribution(list) {
  if (!Array.isArray(list)) return []
  return list.map(normaliseEvidenceEntry).filter(Boolean)
}

/**
 * The video-level `evidence_summary`: the strongest colour/vision evidence
 * aggregated across frames, independent of the fused per-frame decision - so
 * it stays available even when the consolidated `final_material` is
 * `null`/uncertain. Never recomputed here, only read.
 */
function normaliseEvidenceSummary(raw) {
  if (!raw || typeof raw !== 'object') return null
  const topColourMatch = normaliseEvidenceEntry(firstObject(raw, ['top_colour_match']))
  const topVisionMatch = normaliseEvidenceEntry(firstObject(raw, ['top_vision_match']))
  const colourDistribution = normaliseEvidenceDistribution(firstArray(raw, ['colour_distribution']))
  const visionDistribution = normaliseEvidenceDistribution(firstArray(raw, ['vision_distribution']))
  if (!topColourMatch && !topVisionMatch && !colourDistribution.length && !visionDistribution.length) return null
  return {
    topColourMatch,
    topVisionMatch,
    colourDistribution,
    visionDistribution,
    colourFramesConsidered: firstNumber(raw, ['colour_frames_considered']),
    visionFramesConsidered: firstNumber(raw, ['vision_frames_considered']),
  }
}

/* --------------------------------- Video result --------------------------------- */

/**
 * Normalises one per-frame result as it appears in `frames[]` /
 * `representative_frames[]`: the same shape a successful image analysis has,
 * plus its position in the clip and its thumbnail. A frame that failed (no
 * usable flame, decode error, ...) still carries `frameIndex`/`timestampSeconds`
 * and an `error`, so it can be listed rather than silently dropped.
 */
function normaliseFrameResult(raw) {
  if (!raw || typeof raw !== 'object') return null
  const image = normaliseImageResponse(raw.success === true ? raw : null)
  return {
    ...image,
    success: raw.success === true,
    frameIndex: firstNumber(raw, ['frame_index']),
    timestampSeconds: firstNumber(raw, ['timestamp_seconds']),
    thumbnailUrl: thumbnailDataUrl(firstObject(raw, ['thumbnail'])),
    errorMessage: raw.success === true ? null : firstString(firstObject(raw, ['error']) ?? {}, ['message']),
  }
}

/** Normalises one full `POST /analyze-video` success payload. */
export function normaliseVideoResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      cached: false,
      video: null,
      detectionSummary: null,
      detectionCount: 0,
      framesWithFlame: 0,
      visionProvider: 'none',
      material: null,
      distribution: [],
      evidenceSummary: null,
      consolidated: null,
      fireClass: null,
      agents: [],
      representativeFrames: [],
      frames: [],
      timing: null,
    }
  }

  const videoRaw = firstObject(payload, ['video'])
  const consolidatedRaw = firstObject(payload, ['consolidated'])

  return {
    cached: payload.cached === true,
    video: videoRaw
      ? {
          frameCount: firstNumber(videoRaw, ['frame_count']),
          fps: firstNumber(videoRaw, ['fps']),
          durationSeconds: firstNumber(videoRaw, ['duration_seconds']),
          width: firstNumber(videoRaw, ['width']),
          height: firstNumber(videoRaw, ['height']),
          framesRequested: firstNumber(videoRaw, ['frames_requested']),
          framesSampled: firstNumber(videoRaw, ['frames_sampled']),
        }
      : null,
    detectionSummary: normaliseDetectionSummary(firstObject(payload, ['detection_summary'])),
    detectionCount: firstNumber(payload, ['detection_count']) ?? 0,
    framesWithFlame: firstNumber(payload, ['frames_with_flame']) ?? 0,
    visionProvider: firstString(payload, ['vision_provider']) ?? 'none',
    material: normaliseFusedMaterial(payload),
    // The video-level `candidate_materials` is the vote distribution, not a
    // per-item score list - a different shape from the per-frame one.
    distribution: normaliseVoteDistribution(firstArray(payload, ['candidate_materials'])),
    evidenceSummary: normaliseEvidenceSummary(firstObject(payload, ['evidence_summary'])),
    consolidated: consolidatedRaw
      ? {
          framesSampled: firstNumber(consolidatedRaw, ['frames_sampled']),
          framesAnalyzed: firstNumber(consolidatedRaw, ['frames_analyzed']),
          framesWithDecision: firstNumber(consolidatedRaw, ['frames_with_decision']),
          uncertainFrames: firstNumber(consolidatedRaw, ['uncertain_frames']),
          detectionRate: firstNumber(consolidatedRaw, ['detection_rate']),
          voteMargin: firstNumber(consolidatedRaw, ['vote_margin']),
          supportShare: firstNumber(consolidatedRaw, ['support_share']),
          consistencyNotes: (firstArray(consolidatedRaw, ['consistency_notes']) ?? []).filter(
            (note) => typeof note === 'string' && note.trim(),
          ),
        }
      : null,
    fireClass: normaliseFireClass(firstObject(payload, ['fire_class'])),
    agents: normaliseAgents(payload),
    representativeFrames: (firstArray(payload, ['representative_frames']) ?? [])
      .map(normaliseFrameResult)
      .filter(Boolean),
    frames: (firstArray(payload, ['frames']) ?? []).map(normaliseFrameResult).filter(Boolean),
    timing: normaliseTiming(firstObject(payload, ['timing'])),
  }
}

/* --------------------------------- Formatters --------------------------------- */

const isTriple = (value) => rgbTuple(value) !== null

export const formatLab = (lab) =>
  isTriple(lab)
    ? `L ${formatChannel(lab[0], 1)} · a ${formatChannel(lab[1], 1)} · b ${formatChannel(lab[2], 1)}`
    : null

export const formatRgb = (rgb) => {
  const triple = rgbTuple(rgb)
  return triple ? `rgb(${triple.join(', ')})` : null
}

/** A CSS colour for a swatch background, or null so the caller can omit the style. */
export const rgbToCss = (rgb) => {
  const triple = rgbTuple(rgb)
  return triple ? `rgb(${triple.join(', ')})` : null
}
