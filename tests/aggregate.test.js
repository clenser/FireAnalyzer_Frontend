import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  aggregateFrameResults,
  averageLab,
  averageRgb,
  buildVideoFrameEvidence,
  selectRepresentativeFrames,
} from '../src/utils/aggregate.js'

/** Builds the frame list `extractFrames` would have produced. */
function frames(count) {
  return Array.from({ length: count }, (_, index) => ({
    index,
    timestamp: index * 3,
    dataUrl: `blob:frame-${index}`,
    file: { name: `frame-${index}.jpg` },
  }))
}

/** Builds one frame's normalised analysis payload. */
function analysis({
  detected = true,
  confidence = 0.8,
  rgb = [200, 120, 40],
  lab = [60, 25, 55],
  color = undefined,
  mask = true,
  segmentationConfidence = null,
  areaRatio = null,
  ai = null,
} = {}) {
  return {
    detection: { detected, confidence },
    segmentation: {
      maskUrl: mask ? 'data:image/png;base64,AAA=' : null,
      confidence: segmentationConfidence,
      maskAreaRatio: areaRatio,
    },
    color: color === undefined ? { mean: { rgb, lab } } : color,
    aiMaterialAnalysis: ai ?? { available: false, matches: [] },
  }
}

const ok = (data) => ({ ok: true, data })
const fail = (message = 'frame-failed') => ({ ok: false, error: message })

/* ----------------------------- RGB / LAB mean ---------------------------- */

test('RGB is averaged channel by channel from real triples', () => {
  assert.deepEqual(averageRgb([[10, 20, 30], [20, 40, 60]]), [15, 30, 45])
  assert.deepEqual(averageRgb([[255, 0, 0]]), [255, 0, 0])
  assert.deepEqual(averageRgb([[0, 0, 0], [3, 3, 3]]), [2, 2, 2], 'channels round to integers')
})

test('LAB is averaged to one decimal place', () => {
  assert.deepEqual(averageLab([[61.7, 22.8, 52.5], [63.7, 20.8, 50.5]]), [62.7, 21.8, 51.5])
})

test('an empty or invalid colour sample yields null rather than a fake colour', () => {
  assert.equal(averageRgb([]), null)
  assert.equal(averageRgb(null), null)
  assert.equal(averageRgb([[1, 2]]), null)
  assert.equal(averageRgb([[1, 2, Number.NaN]]), null)
  assert.equal(averageLab([]), null)
  assert.equal(averageLab([['1', 2, 3]]), null)
})

/* ------------------------------ aggregation ------------------------------ */

test('a fully successful run aggregates every frame', () => {
  const source = frames(4)
  const results = [
    ok(analysis({ rgb: [200, 100, 50], lab: [60, 25, 55] })),
    ok(analysis({ rgb: [100, 200, 50], lab: [70, 15, 45] })),
    ok(analysis({ rgb: [150, 150, 50], lab: [65, 20, 50] })),
    ok(analysis({ rgb: [50, 100, 200], lab: [55, 25, 35] })),
  ]

  const aggregate = aggregateFrameResults(source, results)

  assert.equal(aggregate.framesAnalyzed, 4)
  assert.equal(aggregate.framesSucceeded, 4)
  assert.equal(aggregate.framesWithFlame, 4)
  assert.equal(aggregate.failedCount, 0)
  assert.equal(aggregate.reliable, true)
  assert.deepEqual(aggregate.rgb, [125, 138, 88])
  assert.deepEqual(aggregate.lab, [62.5, 21.3, 46.3])
  assert.equal(aggregate.colorBasis, 'detected')
  assert.equal(aggregate.averageConfidence, 0.8)
})

test('a frame that was never attempted counts as failed, not successful', () => {
  const source = frames(3)
  const results = [ok(analysis()), null, ok(analysis())]

  const aggregate = aggregateFrameResults(source, results)

  assert.equal(aggregate.framesSucceeded, 2)
  assert.equal(aggregate.failedCount, 1)
  assert.equal(aggregate.reliable, true)
})

test('partial failure is reported and still produces a result', () => {
  const source = frames(10)
  const results = source.map((_, index) => (index === 9 ? fail() : ok(analysis())))

  const aggregate = aggregateFrameResults(source, results)

  assert.equal(aggregate.framesSucceeded, 9)
  assert.equal(aggregate.failedCount, 1)
  assert.equal(aggregate.reliable, true)
  assert.equal(aggregate.successRatio, 0.9)
})

test('too few successful frames is flagged as unreliable', () => {
  const source = frames(10)
  const results = source.map((_, index) => (index < 3 ? ok(analysis()) : fail()))

  const aggregate = aggregateFrameResults(source, results)

  assert.equal(aggregate.framesSucceeded, 3)
  assert.equal(aggregate.reliable, false)
})

test('a single frame run is always reliable when it succeeds', () => {
  const aggregate = aggregateFrameResults(frames(1), [ok(analysis())])
  assert.equal(aggregate.reliable, true)
})

test('only flame-detected frames with a colour feed the average', () => {
  const source = frames(3)
  const results = [
    ok(analysis({ rgb: [200, 100, 50], detected: true })),
    ok(analysis({ rgb: [0, 0, 255], detected: false })),
    ok(analysis({ rgb: [100, 100, 100], detected: true })),
  ]

  const aggregate = aggregateFrameResults(source, results)

  assert.equal(aggregate.framesWithFlame, 2)
  assert.deepEqual(aggregate.rgb, [150, 100, 75], 'the non-detected frame is excluded')
  assert.equal(aggregate.colorSampleCount, 2)
})

test('a clip with no detected flame falls back to every valid frame and says so', () => {
  const source = frames(2)
  const results = [
    ok(analysis({ rgb: [200, 100, 50], detected: false })),
    ok(analysis({ rgb: [100, 100, 100], detected: false })),
  ]

  const aggregate = aggregateFrameResults(source, results)

  assert.equal(aggregate.framesWithFlame, 0)
  assert.equal(aggregate.colorBasis, 'all-valid')
  assert.deepEqual(aggregate.rgb, [150, 100, 75])
})

test('a frame with no colour at all never contributes a zero to the average', () => {
  const source = frames(2)
  const results = [ok(analysis({ rgb: [200, 100, 50] })), ok(analysis({ color: null }))]

  const aggregate = aggregateFrameResults(source, results)

  assert.deepEqual(aggregate.rgb, [200, 100, 50])
})

test('a run with no usable colour reports no colour rather than black', () => {
  const source = frames(2)
  const results = [ok(analysis({ color: null })), ok(analysis({ color: null }))]

  const aggregate = aggregateFrameResults(source, results)

  assert.equal(aggregate.rgb, null)
  assert.equal(aggregate.lab, null)
  assert.equal(aggregate.colorBasis, 'none')
})

test('an empty run is not reliable and reports zero frames', () => {
  const aggregate = aggregateFrameResults([], [])
  assert.equal(aggregate.framesAnalyzed, 0)
  assert.equal(aggregate.reliable, false)
  assert.equal(aggregate.rgb, null)
})

/* ------------------------ representative frame set ----------------------- */

test('at most three frames are chosen for display', () => {
  const aggregate = aggregateFrameResults(frames(10), frames(10).map(() => ok(analysis())))
  const shown = selectRepresentativeFrames(aggregate.frames, 3)

  assert.equal(shown.length, 3)
  assert.deepEqual(
    shown.map((frame) => frame.index),
    [0, 5, 9],
    'the selection is spread across the clip',
  )
})

test('a short run shows every analysed frame', () => {
  const aggregate = aggregateFrameResults(frames(2), [ok(analysis()), ok(analysis())])
  assert.equal(selectRepresentativeFrames(aggregate.frames, 3).length, 2)
})

test('the gallery never offers a lone frame when two or more succeeded', () => {
  const source = frames(5)
  const results = [ok(analysis()), fail(), fail(), fail(), fail()]
  const aggregate = aggregateFrameResults(source, results)

  const shown = selectRepresentativeFrames(aggregate.frames, 3)
  assert.equal(shown.length, 1, 'one usable frame is all the run produced')

  const twoUsable = aggregateFrameResults(frames(5), [ok(analysis()), fail(), ok(analysis()), fail(), fail()])
  assert.equal(selectRepresentativeFrames(twoUsable.frames, 3).length, 2)
})

test('the gallery shows at most three frames whatever the clip length', () => {
  for (const count of [4, 6, 10, 20]) {
    const source = frames(count)
    const aggregate = aggregateFrameResults(source, source.map(() => ok(analysis())))
    assert.equal(selectRepresentativeFrames(aggregate.frames, 3).length, 3)
  }
})

test('failed frames are never displayed', () => {
  const source = frames(5)
  const results = [fail(), ok(analysis()), fail(), ok(analysis()), fail()]
  const aggregate = aggregateFrameResults(source, results)

  const shown = selectRepresentativeFrames(aggregate.frames, 3)
  assert.equal(shown.length, 2)
  assert.equal(shown.every((frame) => frame.error === null), true)
})

test('frames without a detected flame are shown only when nothing was detected', () => {
  const source = frames(4)
  const results = source.map((_, index) => ok(analysis({ detected: index < 2 })))
  const aggregate = aggregateFrameResults(source, results)

  const shown = selectRepresentativeFrames(aggregate.frames, 3)
  assert.equal(shown.length, 2)
  assert.equal(shown.every((frame) => frame.detected), true)
})

test('no frames means no gallery', () => {
  assert.deepEqual(selectRepresentativeFrames([], 3), [])
  assert.deepEqual(selectRepresentativeFrames(null, 3), [])
  assert.deepEqual(selectRepresentativeFrames(frames(3).map(() => ({ error: 'x' })), 3), [])
})

/* -------------------------- consolidated AI evidence ---------------------- */

test('every analysed frame contributes its measurements to one evidence list', () => {
  const source = frames(4)
  const results = source.map((_, index) =>
    ok(
      analysis({
        rgb: [200 - index, 100 + index, 50],
        lab: [60 + index, 25, 55],
        confidence: 0.8 + index / 100,
        segmentationConfidence: 0.9,
        areaRatio: 0.25 + index / 100,
      }),
    ),
  )

  const evidence = buildVideoFrameEvidence(aggregateFrameResults(source, results).frames)

  assert.equal(evidence.length, 4, 'all frames travel in the single request')
  assert.deepEqual(evidence[1], {
    frame_index: 1,
    rgb: [199, 101, 50],
    lab: [61, 25, 55],
    timestamp_seconds: 3,
    detection_confidence: 0.81,
    segmentation_confidence: 0.9,
    flame_area_ratio: 0.26,
  })
})

test('evidence carries measurements only, never an image or a mask', () => {
  const source = frames(2)
  const aggregate = aggregateFrameResults(source, [ok(analysis({ mask: true })), ok(analysis())])
  const evidence = buildVideoFrameEvidence(aggregate.frames)

  assert.equal(evidence.length, 2)
  for (const entry of evidence) {
    for (const key of Object.keys(entry)) {
      assert.match(key, /^(frame_index|rgb|lab|timestamp_seconds|detection_confidence|segmentation_confidence|flame_area_ratio)$/)
    }
    assert.equal(JSON.stringify(entry).includes('base64'), false)
    assert.equal(JSON.stringify(entry).includes('dataUrl'), false)
  }
})

test('failed and colourless frames are left out of the evidence', () => {
  const source = frames(4)
  const results = [ok(analysis()), fail(), ok(analysis({ color: null })), ok(analysis())]
  const aggregate = aggregateFrameResults(source, results)

  const evidence = buildVideoFrameEvidence(aggregate.frames)

  assert.deepEqual(
    evidence.map((entry) => entry.frame_index),
    [0, 3],
  )
})

test('a frame missing optional measurements still yields the required fields', () => {
  const bare = {
    index: 0,
    error: null,
    rgb: [10, 20, 30],
    lab: [50, 5, 20],
    timestamp: null,
    confidence: null,
    segmentationConfidence: null,
    flameAreaRatio: null,
  }

  assert.deepEqual(buildVideoFrameEvidence([bare]), [
    { frame_index: 0, rgb: [10, 20, 30], lab: [50, 5, 20] },
  ])
})

test('no analysed frame means no evidence, so no AI request is made at all', () => {
  assert.deepEqual(buildVideoFrameEvidence([]), [])
  assert.deepEqual(buildVideoFrameEvidence(null), [])
  assert.deepEqual(buildVideoFrameEvidence([{ index: 0, error: 'frame-failed' }]), [])
})

test('the per-frame AI answer is never retained on the aggregated frame', () => {
  const aggregate = aggregateFrameResults(frames(1), [
    ok(analysis({ ai: { available: true, matches: [{ rank: 1, material: 'Wood Materials', confidencePercent: 80 }] } })),
  ])

  assert.equal(aggregate.frames[0].aiMaterialAnalysis, undefined)
  assert.equal(JSON.stringify(aggregate.frames[0]).includes('Wood Materials'), false)
})
