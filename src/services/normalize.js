/**
 * Defensive normalisation of the /analyze payload.
 *
 * The live backend returns:
 *   fire_detection, segmentation, flame_analysis,
 *   material_analysis, suppression_information, fire_class,
 *   extinguishing_agents, timing, error
 *
 * Field accessors below accept the documented/alternate names as fallbacks so a
 * backend revision cannot crash the UI. Anything genuinely absent becomes `null`
 * and is simply not rendered.
 *
 * Two payload details the UI depends on:
 *  - `segmentation.mask` is a base64 PNG of the *actual* segmented flame region,
 *    at the source image's own resolution. It is a different thing from
 *    `fire_detection.bbox`, which is a detection rectangle.
 *  - `fire_class` and `extinguishing_agents` are *derived* from the matched
 *    material, not predicted by the detection model. The UI labels them as such.
 */

/** The five retained clustering algorithms, in the order the backend reports them. */
export const CLUSTERING_KEYS = [
  { key: 'kmeans', label: 'K-Means' },
  { key: 'gmm', label: 'GMM' },
  { key: 'bayesian_gmm', label: 'Bayesian GMM' },
  { key: 'dbscan', label: 'DBSCAN' },
  { key: 'agglomerative', label: 'Agglomerative' },
]

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

function normaliseCentroid(raw) {
  if (!raw || typeof raw !== 'object') return null
  const rgb = rgbTuple(raw.rgb)
  const lab = labTuple(raw.lab)
  if (!rgb && !lab) return null
  return {
    index: num(raw.index),
    size: num(raw.size),
    weight: num(raw.weight),
    rgb,
    lab,
  }
}

/** Builds a displayable <img> source from the backend's base64 PNG mask. */
export function maskDataUrl(mask, encoding) {
  if (typeof mask !== 'string') return null
  const trimmed = mask.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:')) return trimmed
  // Only the documented encodings are turned into an image source; an unknown
  // encoding is dropped rather than fed to the browser as a broken <img>.
  if (encoding && encoding !== 'png_base64') return null
  return `data:image/png;base64,${trimmed}`
}

function normaliseCluster(raw) {
  if (!raw || typeof raw !== 'object') return null
  const centroidsRaw = firstArray(raw, ['centroids']) ?? []
  return {
    rgb: rgbTuple(raw.rgb),
    lab: labTuple(raw.lab),
    method: firstString(raw, ['method']),
    clusterCount: num(raw.cluster_count ?? raw.clusterCount),
    samplesUsed: num(raw.samples_used ?? raw.samplesUsed),
    pixelsSampled: triState(raw.pixels_sampled ?? raw.pixelsSampled),
    dominantCluster: num(raw.dominant_cluster ?? raw.dominantCluster),
    dominantColor: firstObject(raw, ['dominant_color', 'dominantColor'])
      ? {
          rgb: rgbTuple(firstObject(raw, ['dominant_color', 'dominantColor']).rgb),
          lab: labTuple(firstObject(raw, ['dominant_color', 'dominantColor']).lab),
        }
      : null,
    centroids: centroidsRaw.map(normaliseCentroid).filter(Boolean),
    noiseCount: num(raw.noise_count ?? raw.noiseCount),
    representative: firstString(raw, ['representative']),
    fallback: triState(raw.fallback),
  }
}

function normaliseMaterial(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = firstString(raw, ['primary_material', 'name', 'material'])
  if (!name) return null

  const alternativesRaw = firstArray(raw, ['alternatives', 'matches']) ?? []
  const alternatives = alternativesRaw
    .map((entry) => {
      if (typeof entry === 'string') return { name: entry, similarity: null }
      if (!entry || typeof entry !== 'object') return null
      const altName = firstString(entry, ['material', 'name'])
      if (!altName) return null
      return { name: altName, similarity: firstNumber(entry, ['similarity', 'score']) }
    })
    .filter(Boolean)

  return {
    name,
    similarity: firstNumber(raw, ['similarity', 'score']),
    alternatives,
    databaseNotes: firstString(raw, ['database_notes', 'notes']),
    scoreBasis: firstString(raw, ['score_basis']),
  }
}

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
      // Tolerate a bare string list, so an older payload still renders.
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
        // The dataset records agent names only, so this is normally null and
        // the UI must not render an invented chemical formula.
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

export function normaliseResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      detection: null,
      segmentation: null,
      color: null,
      material: null,
      suppression: null,
      fireClass: null,
      agents: [],
      timing: null,
    }
  }

  const detectionRaw = firstObject(payload, ['fire_detection', 'detection'])
  const segmentationRaw = firstObject(payload, ['segmentation'])
  const flameRaw = firstObject(payload, ['flame_analysis', 'color_analysis', 'flame_characteristics'])
  const timingRaw = firstObject(payload, ['timing', 'timings', 'metrics'])

  // Every retained algorithm, keyed so the UI can iterate in a fixed order.
  const algorithms = {}
  for (const { key, label } of CLUSTERING_KEYS) {
    const entry = normaliseCluster(firstObject(flameRaw, [key]))
    if (entry) algorithms[key] = { ...entry, label }
  }

  // Short aliases kept for consumers of the older shape.
  const kmeans = algorithms.kmeans ?? null
  const gmm = algorithms.gmm ?? null

  const meanRaw = firstObject(flameRaw, ['mean_color', 'mean', 'average_color'])
  const mean = meanRaw
    ? { rgb: rgbTuple(meanRaw.rgb), lab: labTuple(meanRaw.lab) }
    : null

  const flamePixelCount = firstNumber(flameRaw, ['flame_pixel_count', 'flamePixelCount'])

  const detection = detectionRaw
    ? {
        detected: triState(detectionRaw.detected),
        confidence: firstNumber(detectionRaw, ['confidence', 'score']),
        boundingBox: normaliseBoundingBox(firstObject(detectionRaw, ['bounding_box', 'bbox'])),
      }
    : null

  const maskEncoding = firstString(segmentationRaw, ['mask_encoding', 'maskEncoding'])
  const maskPayload = firstString(segmentationRaw, ['mask'])
  const segmentation = segmentationRaw
    ? {
        available: triState(segmentationRaw.available),
        fallbackUsed: triState(segmentationRaw.fallback_used ?? segmentationRaw.fallbackUsed),
        flamePixelCount: firstNumber(segmentationRaw, [
          'flame_pixel_count',
          'flamePixelCount',
        ]),
        maskAreaRatio: firstNumber(segmentationRaw, ['mask_area_ratio', 'maskAreaRatio']),
        confidence: firstNumber(segmentationRaw, ['confidence', 'score']),
        // The real segmented flame region, ready to overlay on the photo.
        maskUrl: maskDataUrl(maskPayload, maskEncoding),
        maskEncoding,
        maskWidth: firstNumber(segmentationRaw, ['mask_width', 'maskWidth']),
        maskHeight: firstNumber(segmentationRaw, ['mask_height', 'maskHeight']),
        bboxFallbackReason: firstString(segmentationRaw, [
          'bbox_fallback_reason',
          'bboxFallbackReason',
        ]),
      }
    : null

  const algorithmNamesRaw = firstArray(flameRaw, ['algorithms'])
  const color = flameRaw
    ? {
        kmeans,
        gmm,
        algorithms,
        algorithmNames:
          algorithmNamesRaw?.filter((name) => typeof name === 'string' && name.trim()) ?? null,
        nClusters: firstNumber(flameRaw, ['n_clusters', 'nClusters']),
        mean,
        flamePixelCount,
        samplesUsed: firstNumber(flameRaw, ['samples_used', 'samplesUsed']),
        pixelsSampled: triState(flameRaw.pixels_sampled ?? flameRaw.pixelsSampled),
        skippedReason: firstString(flameRaw, ['skipped_reason', 'skippedReason']),
      }
    : null

  const timing = timingRaw
    ? {
        totalMs: firstNumber(timingRaw, ['total_ms', 'totalMs', 'total']),
        detectionMs: firstNumber(timingRaw, ['detection_ms', 'detectionMs', 'detection']),
        segmentationMs: firstNumber(timingRaw, [
          'segmentation_ms',
          'segmentationMs',
          'segmentation',
        ]),
        colorMs: firstNumber(timingRaw, ['color_ms', 'colorMs', 'color']),
        materialMs: firstNumber(timingRaw, ['material_ms', 'materialMs', 'material']),
      }
    : null

  return {
    detection,
    segmentation,
    color,
    material: normaliseMaterial(firstObject(payload, ['material_analysis', 'material'])),
    suppression: normaliseSuppression(
      firstObject(payload, ['suppression_information', 'suppression']),
    ),
    fireClass: normaliseFireClass(firstObject(payload, ['fire_class', 'fireClass'])),
    agents: normaliseAgents(payload),
    timing,
  }
}

export const formatLab = (lab) =>
  lab ? `L ${formatChannel(lab[0], 1)} · a ${formatChannel(lab[1], 1)} · b ${formatChannel(lab[2], 1)}` : null

export const formatRgb = (rgb) => (rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : null)

export const rgbToCss = (rgb) => (rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : null)
