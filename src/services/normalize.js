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
 * Three payload details the UI depends on:
 *  - `segmentation.mask` is a base64 PNG of the *actual* segmented flame region,
 *    at the source image's own resolution. It is a different thing from
 *    `fire_detection.bbox`, which is a detection rectangle.
 *  - `flame_analysis.mean_flame_color` is the mean of *every* pixel in that
 *    mask, so it is reported on its own rather than among the algorithms in
 *    `flame_analysis.algorithms` (which are computed from the sampled pixels).
 *  - `fire_class` and `extinguishing_agents` are *derived* from the matched
 *    material, not predicted by the detection model. The UI labels them as such.
 */

/**
 * The six clustering algorithms, in the order the backend reports them.
 * `key` is the machine name used by `flame_analysis.algorithms`.
 */
export const CLUSTERING_KEYS = [
  { key: 'vb_gmm', label: 'VB-GMM' },
  { key: 'gmm', label: 'GMM' },
  { key: 'kmeans_pp', label: 'K-Means++' },
  { key: 'dbscan', label: 'DBSCAN' },
  { key: 'mean_shift', label: 'Mean-Shift' },
  { key: 'agglomerative', label: 'Agglomerative' },
]

/** Machine name -> display name, for labels the payload does not supply. */
export const ALGORITHM_LABELS = Object.fromEntries(
  CLUSTERING_KEYS.map(({ key, label }) => [key, label]),
)

/**
 * The three spatial flame zones, in report order.  `key` is the machine name used
 * by `flame_analysis.zones`; `weight` is the engineering analysis weight (0.40 /
 * 0.35 / 0.25), which is NOT the share of pixels - that is `percentageOfMask`.
 */
export const ZONE_KEYS = [
  { key: 'inner_core', label: 'Inner/Core', weight: 0.4 },
  { key: 'middle_transition', label: 'Middle/Transition', weight: 0.35 },
  { key: 'outer_radiative', label: 'Outer/Radiative', weight: 0.25 },
]

/**
 * Pre-rename spellings, accepted so an older backend still renders. The backend
 * emits `mean_color`, `kmeans` and `bayesian_gmm` aliases for the same reason.
 */
const ALGORITHM_ALIASES = {
  vb_gmm: ['bayesian_gmm', 'bgmm'],
  gmm: [],
  kmeans_pp: ['kmeans'],
  dbscan: [],
  mean_shift: ['meanshift'],
  agglomerative: ['ward'],
}

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
  const index = num(raw.cluster_id ?? raw.clusterId ?? raw.index)
  const size = num(raw.pixel_count ?? raw.pixelCount ?? raw.size)
  const weight = num(raw.weight)
  return {
    // `clusterId`/`pixelCount`/`percentage` are the documented names; the index,
    // size and weight aliases carry identical values.
    index,
    clusterId: index,
    size,
    pixelCount: size,
    weight,
    percentage: num(raw.percentage) ?? (weight !== null ? weight * 100 : null),
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
  const dominantRaw = firstObject(raw, ['dominant_color', 'dominantColor'])
  const noiseCount = num(raw.noise_count ?? raw.noiseCount)
  return {
    rgb: rgbTuple(raw.rgb),
    lab: labTuple(raw.lab),
    method: firstString(raw, ['method']),
    clusterCount: num(raw.cluster_count ?? raw.clusterCount),
    samplesUsed: num(raw.samples_used ?? raw.samplesUsed),
    pixelsSampled: triState(raw.pixels_sampled ?? raw.pixelsSampled),
    dominantCluster: num(raw.dominant_cluster ?? raw.dominantCluster),
    dominantColor: dominantRaw
      ? { rgb: rgbTuple(dominantRaw.rgb), lab: labTuple(dominantRaw.lab) }
      : null,
    centroids: centroidsRaw.map(normaliseCentroid).filter(Boolean),
    noiseCount,
    noisePercentage: num(raw.noise_percentage ?? raw.noisePercentage),
    // Mixture models only; null/0 for the algorithms that have no components.
    componentCount: num(raw.component_count ?? raw.componentCount),
    maxComponents: num(raw.max_components ?? raw.maxComponents),
    inactiveComponents: num(raw.inactive_components ?? raw.inactiveComponents) ?? 0,
    representative: firstString(raw, ['representative']),
    fallback: triState(raw.fallback),
  }
}

function normaliseZone(raw) {
  if (!raw || typeof raw !== 'object') return null
  const meanRaw = firstObject(raw, ['mean_color', 'meanColor'])
  const rgb = rgbTuple(meanRaw?.rgb)
  const lab = labTuple(meanRaw?.lab)
  if (!rgb && !lab) return null
  return {
    weight: firstNumber(raw, ['weight', 'analysis_weight']),
    pixelCount: firstNumber(raw, ['pixel_count', 'pixelCount']),
    percentageOfMask: firstNumber(raw, ['percentage_of_mask', 'percentageOfMask']),
    meanColor: { rgb, lab },
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
  // The current contract nests them under `algorithms`; older payloads put each
  // one at the top level, so both shapes are accepted.
  const algorithmsMap = firstObject(flameRaw, ['algorithms'])
  const algorithms = {}
  for (const { key, label } of CLUSTERING_KEYS) {
    const source =
      firstObject(algorithmsMap, [key]) ?? firstObject(flameRaw, [key, ...ALGORITHM_ALIASES[key]])
    const entry = normaliseCluster(source)
    if (entry) algorithms[key] = { ...entry, label }
  }

  // Short aliases kept for consumers of the older shape.
  const kmeans = algorithms.kmeans_pp ?? null
  const gmm = algorithms.gmm ?? null
  const vbGmm = algorithms.vb_gmm ?? null
  const dbscan = algorithms.dbscan ?? null
  const meanShift = algorithms.mean_shift ?? null
  const agglomerative = algorithms.agglomerative ?? null

  // The Mean Flame Color is the mean of every pixel in the mask. It is reported
  // separately from the algorithms and is not a cluster centroid.
  const meanRaw = firstObject(flameRaw, [
    'mean_flame_color',
    'meanFlameColor',
    'mean_color',
    'mean',
    'average_color',
  ])
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

  // The ordered display names live in `algorithm_names`; a payload that still
  // ships `algorithms` as a string array is accepted too.
  const algorithmNamesRaw =
    firstArray(flameRaw, ['algorithm_names', 'algorithmNames']) ??
    (Array.isArray(flameRaw?.algorithms) ? flameRaw.algorithms : null)

  // The spatial flame zones.  Only the per-zone summary is kept for the UI; the
  // full per-zone algorithm output stays in the raw payload for the API consumers
  // that want it.  A missing or malformed zone is dropped, never crashed on.
  const zonesRaw = firstObject(flameRaw, ['zones'])
  const zones = {}
  if (zonesRaw && typeof zonesRaw === 'object') {
    for (const { key } of ZONE_KEYS) {
      const entry = normaliseZone(zonesRaw[key])
      if (entry) zones[key] = entry
    }
  }

  const color = flameRaw
    ? {
        kmeans,
        gmm,
        vbGmm,
        dbscan,
        meanShift,
        agglomerative,
        algorithms,
        algorithmNames:
          algorithmNamesRaw?.filter((name) => typeof name === 'string' && name.trim()) ?? null,
        nClusters: firstNumber(flameRaw, ['n_clusters', 'nClusters']),
        mean,
        flamePixelCount,
        samplesUsed: firstNumber(flameRaw, ['samples_used', 'samplesUsed']),
        pixelsSampled: triState(flameRaw.pixels_sampled ?? flameRaw.pixelsSampled),
        skippedReason: firstString(flameRaw, ['skipped_reason', 'skippedReason']),
        zones,
        zoneFallback: triState(flameRaw.zone_fallback ?? flameRaw.zoneFallback),
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

/**
 * A tuple is only usable if it has three finite channels. `rgbTuple` already
 * enforces this on the way in, but these are exported and also called on
 * hand-built objects, so a short tuple must not become "rgb(1, 2, undefined)".
 */
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
