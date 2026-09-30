import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ALGORITHM_LABELS,
  CLUSTERING_KEYS,
  ZONE_KEYS,
  formatLab,
  formatRgb,
  maskDataUrl,
  normaliseResponse,
  rgbToCss,
} from '../src/services/normalize.js'

const EXPECTED_KEYS = [
  'vb_gmm',
  'gmm',
  'kmeans_pp',
  'dbscan',
  'mean_shift',
  'agglomerative',
]
const EXPECTED_LABELS = [
  'VB-GMM',
  'GMM',
  'K-Means++',
  'DBSCAN',
  'Mean-Shift',
  'Agglomerative',
]

function cluster(method, overrides = {}) {
  return {
    rgb: [255, 203, 89],
    lab: [84.7, 7.62, 62.79],
    method,
    cluster_count: 2,
    samples_used: 2000,
    pixels_sampled: true,
    dominant_cluster: 0,
    dominant_color: { rgb: [255, 214, 105], lab: [86.24, 2.1, 71.4] },
    centroids: [
      {
        index: 0,
        size: 1502,
        weight: 0.751,
        rgb: [255, 214, 105],
        lab: [86.24, 2.1, 71.4],
        cluster_id: 0,
        pixel_count: 1502,
        percentage: 75.1,
      },
      {
        index: 1,
        size: 498,
        weight: 0.249,
        rgb: [255, 165, 0],
        lab: [72.1, 23.4, 78.9],
        cluster_id: 1,
        pixel_count: 498,
        percentage: 24.9,
      },
    ],
    noise_count: 0,
    noise_percentage: 0.0,
    representative: 'unweighted mean of the cluster means',
    fallback: false,
    component_count: null,
    max_components: null,
    inactive_components: 0,
    ...overrides,
  }
}

const MEAN = { rgb: [255, 221, 98], lab: [89.09, -0.36, 63.31] }

function payload(flameOverrides = {}) {
  return {
    success: true,
    fire_detection: { detected: true, confidence: 0.9, bounding_box: { x1: 1, y1: 2, x2: 3, y2: 4 } },
    segmentation: { available: true, flame_pixel_count: 44820, mask: 'aGk=' },
    flame_analysis: {
      mean_flame_color: MEAN,
      algorithms: {
        vb_gmm: cluster('vb_gmm', {
          component_count: 2,
          max_components: 5,
          inactive_components: 3,
        }),
        gmm: cluster('gmm', { component_count: 2, max_components: 2 }),
        kmeans_pp: cluster('kmeans_pp'),
        dbscan: cluster('dbscan', { cluster_count: 1, noise_count: 16, noise_percentage: 0.8 }),
        mean_shift: cluster('mean_shift', { cluster_count: 3 }),
        agglomerative: cluster('agglomerative'),
      },
      algorithm_names: EXPECTED_LABELS,
      flame_pixel_count: 44820,
      samples_used: 2000,
      pixels_sampled: true,
      n_clusters: 2,
      skipped_reason: null,
      ...flameOverrides,
    },
    material_analysis: { primary_material: 'Natural Fibers', similarity: 0.92 },
    fire_class: { class: 'Class A', description: 'Ordinary combustibles' },
    extinguishing_agents: [{ name: 'Water', type: 'cooling', compound: null }],
  }
}

test('the six algorithms are declared in the required order', () => {
  assert.deepEqual(
    CLUSTERING_KEYS.map((entry) => entry.key),
    EXPECTED_KEYS,
  )
  assert.deepEqual(
    CLUSTERING_KEYS.map((entry) => entry.label),
    EXPECTED_LABELS,
  )
  assert.deepEqual(ALGORITHM_LABELS, {
    vb_gmm: 'VB-GMM',
    gmm: 'GMM',
    kmeans_pp: 'K-Means++',
    dbscan: 'DBSCAN',
    mean_shift: 'Mean-Shift',
    agglomerative: 'Agglomerative',
  })
})

test('every algorithm is normalised in order with its display name', () => {
  const { color } = normaliseResponse(payload())
  assert.deepEqual(Object.keys(color.algorithms), EXPECTED_KEYS)
  assert.deepEqual(
    CLUSTERING_KEYS.map(({ key }) => color.algorithms[key].label),
    EXPECTED_LABELS,
  )
  assert.deepEqual(color.algorithmNames, EXPECTED_LABELS)
  assert.equal(color.mean.rgb.join(','), MEAN.rgb.join(','))
  assert.equal(color.flamePixelCount, 44820)
})

test('clusters expose clusterId, pixelCount and percentage', () => {
  const { color } = normaliseResponse(payload())
  const first = color.algorithms.kmeans_pp.centroids[0]
  assert.equal(first.clusterId, 0)
  assert.equal(first.pixelCount, 1502)
  assert.equal(first.percentage, 75.1)
  // The legacy aliases carry the same values.
  assert.equal(first.index, first.clusterId)
  assert.equal(first.size, first.pixelCount)
  assert.equal(first.rgb.join(','), '255,214,105')
})

test('percentage is derived from weight when the backend omits it', () => {
  const raw = cluster('kmeans_pp')
  raw.centroids = [{ index: 0, size: 750, weight: 0.75, rgb: [1, 2, 3], lab: [1, 2, 3] }]
  const { color } = normaliseResponse({
    flame_analysis: {
      mean_flame_color: MEAN,
      algorithms: { kmeans_pp: raw },
    },
  })
  assert.equal(color.algorithms.kmeans_pp.centroids[0].percentage, 75)
  assert.equal(color.algorithms.kmeans_pp.centroids[0].pixelCount, 750)
})

test('noise and VB-GMM component bookkeeping are surfaced', () => {
  const { color } = normaliseResponse(payload())

  const dbscan = color.algorithms.dbscan
  assert.equal(dbscan.noiseCount, 16)
  assert.equal(dbscan.noisePercentage, 0.8)

  const vbGmm = color.algorithms.vb_gmm
  assert.equal(vbGmm.componentCount, 2)
  assert.equal(vbGmm.maxComponents, 5)
  assert.equal(vbGmm.inactiveComponents, 3)

  // Algorithms with no notion of components report null, not a fake zero.
  assert.equal(color.algorithms.kmeans_pp.componentCount, null)
  assert.equal(color.algorithms.mean_shift.maxComponents, null)
})

test('the short algorithm aliases are exposed', () => {
  const { color } = normaliseResponse(payload())
  assert.equal(color.kmeans, color.algorithms.kmeans_pp)
  assert.equal(color.gmm, color.algorithms.gmm)
  assert.equal(color.vbGmm, color.algorithms.vb_gmm)
  assert.equal(color.dbscan, color.algorithms.dbscan)
  assert.equal(color.meanShift, color.algorithms.mean_shift)
  assert.equal(color.agglomerative, color.algorithms.agglomerative)
})

test('an older payload with top-level keys and a name array still renders', () => {
  const { color } = normaliseResponse({
    flame_analysis: {
      kmeans: cluster('kmeans'),
      gmm: cluster('gmm'),
      bayesian_gmm: cluster('bayesian_gmm'),
      dbscan: cluster('dbscan'),
      agglomerative: cluster('agglomerative'),
      mean_color: MEAN,
      algorithms: ['K-Means', 'GMM', 'Bayesian GMM', 'DBSCAN', 'Agglomerative'],
    },
  })

  // Only the five the old payload actually carried; Mean-Shift is absent
  // because the old backend never ran it, so the UI just renders fewer rows.
  assert.deepEqual(Object.keys(color.algorithms), [
    'vb_gmm',
    'gmm',
    'kmeans_pp',
    'dbscan',
    'agglomerative',
  ])
  assert.equal(color.algorithms.mean_shift, undefined)
  // The backend's mean_color alias is still the Mean Flame Color.
  assert.equal(color.mean.rgb.join(','), MEAN.rgb.join(','))
  // The old display names are passed through rather than replaced.
  assert.equal(color.algorithmNames.length, 5)
  // Pre-rename machine names are relabelled to the current ones.
  assert.equal(color.algorithms.kmeans_pp.label, 'K-Means++')
  assert.equal(color.algorithms.vb_gmm.label, 'VB-GMM')
})

test('missing and malformed sections normalise to null instead of throwing', () => {
  for (const bad of [null, undefined, 42, 'nope', []]) {
    const result = normaliseResponse(bad)
    assert.equal(result.color, null)
    assert.equal(result.detection, null)
    assert.equal(result.segmentation, null)
    assert.deepEqual(result.agents, [])
  }

  const partial = normaliseResponse({ flame_analysis: { algorithms: { gmm: null } } })
  assert.deepEqual(Object.keys(partial.color.algorithms), [])
  assert.equal(partial.color.mean, null)
})

test('a colourless algorithm entry is kept and flagged, not silently dropped', () => {
  // The backend saying an algorithm ran is worth surfacing even without a colour,
  // so the row is kept with null rgb/lab and the UI renders it as "n/a".
  const { color } = normaliseResponse({
    flame_analysis: {
      mean_flame_color: MEAN,
      algorithms: { gmm: { cluster_count: 2, samples_used: 10 } },
    },
  })
  assert.deepEqual(Object.keys(color.algorithms), ['gmm'])
  assert.equal(color.algorithms.gmm.rgb, null)
  assert.equal(color.algorithms.gmm.lab, null)
  assert.equal(color.algorithms.gmm.clusterCount, 2)
  // ...and a null entry is dropped.
  const dropped = normaliseResponse({
    flame_analysis: { mean_flame_color: MEAN, algorithms: { gmm: null } },
  })
  assert.deepEqual(Object.keys(dropped.color.algorithms), [])
})

test('formatters degrade gracefully', () => {
  assert.equal(formatRgb([1, 2, 3]), 'rgb(1, 2, 3)')
  assert.equal(formatRgb(null), null)
  assert.equal(formatRgb([1, 2]), null)
  assert.equal(rgbToCss([1, 2, 3]), 'rgb(1, 2, 3)')
  assert.equal(rgbToCss(null), null)
  assert.match(formatLab([50, 10, -20]), /^L 50\.0 · a 10\.0 · b -20\.0$/)
  assert.equal(formatLab(null), null)
  assert.equal(formatLab([1]), null)
})

test('maskDataUrl only accepts the documented encoding', () => {
  assert.equal(maskDataUrl('aGk=', 'png_base64'), 'data:image/png;base64,aGk=')
  assert.equal(maskDataUrl('  aGk=  ', 'png_base64'), 'data:image/png;base64,aGk=')
  assert.equal(maskDataUrl('data:image/png;base64,aGk=', 'png_base64'), 'data:image/png;base64,aGk=')
  assert.equal(maskDataUrl('aGk=', 'raw'), null)
  assert.equal(maskDataUrl('', 'png_base64'), null)
  assert.equal(maskDataUrl(null, 'png_base64'), null)
})

test('the rest of the payload is still normalised', () => {
  const result = normaliseResponse(payload())
  assert.equal(result.detection.detected, true)
  assert.deepEqual(result.detection.boundingBox, { x1: 1, y1: 2, x2: 3, y2: 4, width: 2, height: 2 })
  assert.equal(result.segmentation.flamePixelCount, 44820)
  assert.equal(result.segmentation.maskUrl, 'data:image/png;base64,aGk=')
  assert.equal(result.material.name, 'Natural Fibers')
  assert.equal(result.fireClass.name, 'Class A')
  assert.equal(result.agents[0].name, 'Water')
  assert.equal(result.agents[0].compound, null)
})

// ---------------------------------------------------------------------------
// Spatial flame zones
// ---------------------------------------------------------------------------
function zone(overrides = {}) {
  return {
    weight: 0.4,
    pixel_count: 6537,
    percentage_of_mask: 14.58,
    mean_color: { rgb: [253, 225, 60], lab: [88.0, -2.0, 66.0] },
    ...overrides,
  }
}

function payloadWithZones(zoneOverrides = {}) {
  const base = {
    inner_core: zone(),
    middle_transition: zone({ weight: 0.35, pixel_count: 19006, percentage_of_mask: 42.4, mean_color: { rgb: [253, 239, 95], lab: [90.0, -1.0, 60.0] } }),
    outer_radiative: zone({ weight: 0.25, pixel_count: 19277, percentage_of_mask: 43.02, mean_color: { rgb: [250, 203, 61], lab: [80.0, 12.0, 44.0] } }),
  }
  const zones = {}
  for (const key of Object.keys(base)) {
    const override = zoneOverrides[key]
    // A null override drops the zone; anything else is merged over the base zone.
    zones[key] = override === null ? null : { ...base[key], ...override }
  }
  return { ...payload(), flame_analysis: { ...payload().flame_analysis, zones } }
}

test('the three zones are declared in the required order with the exact weights', () => {
  assert.deepEqual(
    ZONE_KEYS.map((entry) => entry.key),
    ['inner_core', 'middle_transition', 'outer_radiative'],
  )
  assert.deepEqual(
    ZONE_KEYS.map((entry) => entry.label),
    ['Inner/Core', 'Middle/Transition', 'Outer/Radiative'],
  )
  assert.deepEqual(
    ZONE_KEYS.map((entry) => entry.weight),
    [0.4, 0.35, 0.25],
  )
})

test('a normal three-zone response is normalised with colours, counts and shares', () => {
  const { color } = normaliseResponse(payloadWithZones())
  assert.deepEqual(Object.keys(color.zones), ['inner_core', 'middle_transition', 'outer_radiative'])

  const inner = color.zones.inner_core
  assert.equal(inner.weight, 0.4)
  assert.equal(inner.pixelCount, 6537)
  assert.equal(inner.percentageOfMask, 14.58)
  assert.equal(inner.meanColor.rgb.join(','), '253,225,60')
  assert.equal(inner.meanColor.lab.join(','), '88,-2,66')

  const outer = color.zones.outer_radiative
  assert.equal(outer.weight, 0.25)
  assert.equal(outer.pixelCount, 19277)
  assert.equal(outer.percentageOfMask, 43.02)
})

test('missing zones normalise to an empty object instead of throwing', () => {
  const { color } = normaliseResponse(payload())
  assert.deepEqual(color.zones, {})
  assert.equal(color.zoneFallback, null)
})

test('null zone data is dropped without crashing', () => {
  const { color } = normaliseResponse(payloadWithZones({ inner_core: null }))
  assert.deepEqual(Object.keys(color.zones), ['middle_transition', 'outer_radiative'])
})

test('malformed zone RGB/LAB values never produce rgb(undefined)', () => {
  // A zone whose colour arrays are short or non-numeric must be dropped (when
  // both are bad) or rendered as n/a (when one is bad) - never serialised into
  // "rgb(1, 2, undefined)".
  const { color } = normaliseResponse(
    payloadWithZones({
      inner_core: { mean_color: { rgb: [1, 2], lab: [1, 2] } },
      middle_transition: { mean_color: { rgb: [1, 2, 'x'], lab: [1, 2, 3] } },
    }),
  )
  // inner_core has neither a valid RGB nor a valid LAB triple, so it is dropped.
  // middle_transition has a valid LAB triple, so it is kept and its malformed RGB
  // renders as n/a rather than "rgb(1, 2, undefined)".
  assert.deepEqual(Object.keys(color.zones), ['middle_transition', 'outer_radiative'])
  assert.equal(color.zones.middle_transition.meanColor.rgb, null)
  assert.equal(color.zones.middle_transition.meanColor.lab.join(','), '1,2,3')
  // The formatters return null for a malformed triple, never a broken string.
  assert.equal(formatRgb(color.zones.middle_transition.meanColor.rgb), null)
  assert.equal(formatRgb([1, 2, 'x']), null)
  assert.equal(formatRgb([1, 2]), null)
  // The surviving valid zone still formats correctly.
  assert.equal(formatRgb(color.zones.outer_radiative.meanColor.rgb), 'rgb(250, 203, 61)')
})

test('a zone with a valid colour but no counts still renders', () => {
  const { color } = normaliseResponse(
    payloadWithZones({ inner_core: { pixel_count: null, percentage_of_mask: null } }),
  )
  const inner = color.zones.inner_core
  assert.equal(inner.pixelCount, null)
  assert.equal(inner.percentageOfMask, null)
  assert.equal(inner.meanColor.rgb.join(','), '253,225,60')
})

test('zone fallback flag is surfaced', () => {
  const { color } = normaliseResponse({
    ...payload(),
    flame_analysis: { ...payload().flame_analysis, zones: {}, zone_fallback: true },
  })
  assert.equal(color.zoneFallback, true)
  assert.deepEqual(color.zones, {})
})

test('the six algorithms and Mean-Shift are still present alongside zones', () => {
  const { color } = normaliseResponse(payloadWithZones())
  assert.deepEqual(Object.keys(color.algorithms), EXPECTED_KEYS)
  assert.equal(color.algorithms.mean_shift.method, 'mean_shift')
  assert.equal(color.algorithmNames.includes('Mean-Shift'), true)
  // Zones do not disturb the whole-mask contract.
  assert.equal(color.mean.rgb.join(','), MEAN.rgb.join(','))
})
