import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { normaliseResponse } from '../src/services/normalize.js'
import { buildImageResultModel, buildVideoResultModel } from '../src/services/viewModel.js'
import { aggregateFrameResults } from '../src/utils/aggregate.js'
import { REPRESENTATIVE_FRAME_COUNT } from '../src/config.js'

/**
 * The compactness and responsiveness of the result data model.
 *
 * Two things are asserted here. First, what the view model hands the components:
 * a gallery of two or three frames, a summary of three numbers, a colour card of
 * a swatch plus two values, and at most three alternatives - so a card cannot be
 * given content that would stretch it. Second, the stylesheet itself: no fixed
 * heights, no large min-heights, no `height: 100%` and no stretching alignment on
 * the result grid, plus a single-column mobile layout with the gallery as the
 * only horizontal scroll.
 */

const readSource = (relative) =>
  readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8')

/* ------------------------------ the data model ---------------------------- */

const frameResults = (count, extra = () => ({})) =>
  Array.from({ length: count }, (_, index) => ({
    ok: true,
    data: {
      detection: { detected: true, confidence: 0.8, boundingBox: null },
      segmentation: { maskUrl: `data:image/png;base64,${index}`, confidence: 0.9, maskAreaRatio: 0.2 },
      color: { mean: { rgb: [210 + index, 110, 30], lab: [62, 24, 55] } },
      ...extra(index),
    },
  }))

function videoModel({ frameCount = 10, results = null, representativeCount = REPRESENTATIVE_FRAME_COUNT } = {}) {
  const frames = Array.from({ length: frameCount }, (_, index) => ({
    index,
    timestamp: index * 2,
    dataUrl: `blob:frame-${index}`,
  }))

  return buildVideoResultModel({
    frames,
    aggregation: aggregateFrameResults(frames, results ?? frameResults(frameCount)),
    representativeCount,
    measuredDurationMs: 5200,
    selectedFrameCount: frameCount,
  })
}

test('the gallery is 2-3 frames whatever the clip length', () => {
  for (const frameCount of [2, 3, 5, 10, 15, 20]) {
    const { gallery } = videoModel({ frameCount })
    assert.ok(gallery.length >= 2, `${frameCount} frames -> at least 2 shown`)
    assert.ok(gallery.length <= 3, `${frameCount} frames -> at most 3 shown`)
  }
})

test('each gallery entry carries only what a frame tile needs', () => {
  const { gallery } = videoModel({ frameCount: 6 })

  assert.deepEqual(Object.keys(gallery[0]).sort(), [
    'dataUrl',
    'detected',
    'hasMask',
    'key',
    'label',
    'maskUrl',
    'statusText',
    'timestamp',
  ])
  for (const frame of gallery) {
    assert.ok(typeof frame.timestamp === 'number', 'the timestamp stays on the frame')
    assert.ok(['Detected', 'Not detected'].includes(frame.statusText))
    assert.equal(frame.hasMask, true)
  }
})

test('the gallery never offers more than the configured maximum', () => {
  const { gallery } = videoModel({ frameCount: 12, representativeCount: 2 })
  assert.equal(gallery.length, 2)
})

test('the video summary is three counts and nothing else', () => {
  const { summary } = videoModel({ frameCount: 15 })

  assert.equal(summary.analyzedFrames, 15)
  assert.equal(summary.flameFrameText, '15 / 15')
  assert.equal(summary.failedFrames, 0)
  assert.equal(summary.warning, null, 'a clean run carries no warning line')
  assert.equal(
    Object.values(summary).filter((value) => typeof value === 'string').length,
    1,
    'only the "n / n" flame count is a string; no prose fields remain',
  )
})

test('the average colour card holds a swatch, RGB and LAB only', () => {
  const { flameColor } = videoModel({ frameCount: 5 })

  assert.deepEqual(Object.keys(flameColor).sort(), [
    'average',
    'hasLab',
    'hasRgb',
    'lab',
    'rgb',
    'swatch',
    'title',
  ])
  assert.equal(flameColor.title, 'Average Flame Color')
  assert.match(flameColor.lab, /^L [\d.]+ · a [\d.-]+ · b [\d.-]+$/)
})

test('both source types cap alternative materials at three', () => {
  const image = buildImageResultModel({
    data: normaliseResponse({
      material_analysis: {
        primary_material: 'Wood Materials',
        similarity: 0.8,
        alternatives: [1, 2, 3, 4, 5].map((n) => ({ material: `Alt ${n}`, similarity: n / 10 })),
      },
    }),
  })
  assert.equal(image.material.alternatives.length, 3)

  const video = videoModel({
    frameCount: 4,
    results: frameResults(4),
  })
  assert.equal(video.material, null)
})

test('the image model keeps every card short', () => {
  const model = buildImageResultModel({
    data: normaliseResponse({
      fire_detection: { detected: true, confidence: 0.9 },
      flame_analysis: {
        mean_flame_color: { rgb: [220, 120, 30], lab: [63, 24, 57] },
        algorithms: {
          kmeans_pp: { cluster_count: 3, centroids: [{ cluster_id: 0, rgb: [1, 2, 3], pixel_count: 9 }] },
        },
        zones: { inner_core: { mean_color: { rgb: [255, 200, 40] } } },
      },
      material_analysis: { primary_material: 'Natural Fibers', similarity: 0.93 },
      fire_class: { class: 'Class A' },
      ai_material_analysis: {
        available: true,
        matches: [{ rank: 1, material: 'Natural Fibers', confidence_percent: 70 }],
      },
    }),
    measuredDurationMs: 1200,
  })

  assert.equal(model.flameColor.rgb, 'rgb(220, 120, 30)')
  assert.equal(model.ai.confidence, 70)
  assert.equal(JSON.stringify(model).includes('kmeans'), false, 'no clustering detail reaches a card')
})

/* ------------------------------ the stylesheet ---------------------------- */

/** The result-grid block of the stylesheet, without any media query. */
function resultGridBlock() {
  const css = readSource('src/index.css')
  const start = css.indexOf('.result-grid {')
  const end = css.indexOf('.result-card .card__header')
  assert.ok(start > 0 && end > start, 'the result grid block exists')
  return css.slice(start, end)
}

test('the result grid never stretches a card to match a taller neighbour', () => {
  const block = resultGridBlock()
  assert.match(block, /align-items:\s*start;/, 'cards keep their natural height')
  assert.equal(/align-items:\s*(stretch|baseline)/.test(block), false)
})

test('no result card uses a fixed height or a min-height', () => {
  const css = readSource('src/index.css')
  const cardRules = [...css.matchAll(/\.(?:result-card|area-[a-z]+|gallery|statusbar)[\s\S]{0,220}?\}/g)]

  for (const [rule] of cardRules) {
    assert.equal(/height:\s*\d/.test(rule), false, `fixed height in: ${rule.slice(0, 60)}`)
    assert.equal(/min-height:\s*\d/.test(rule), false, `min-height in: ${rule.slice(0, 60)}`)
    assert.equal(/height:\s*100%/.test(rule), false, `height:100% in: ${rule.slice(0, 60)}`)
  }
})

test('the video result order is frames, summary, detection, colour, material, AI, class', () => {
  const css = readSource('src/index.css')
  const areas = css.match(/\.result-grid--video \{[\s\S]*?\}/g).at(-1)
  const order = [...areas.matchAll(/'([a-z ]+)'/g)].map((match) => match[1].trim())

  assert.deepEqual(order, [
    'gallery gallery gallery',
    'summary summary detection',
    'color material material',
    'ai ai class',
    'status status status',
  ])
})

test('both result grids are a single column below the first breakpoint', () => {
  const css = readSource('src/index.css')
  const base = css.slice(
    css.indexOf('.result-grid--image {'),
    css.indexOf('.area-detection'),
  )
  assert.match(base, /\.result-grid--image \{[\s\S]*?grid-template-areas:([\s\S]*?);/, 'image areas declared')
  assert.match(base, /\.result-grid--video \{[\s\S]*?grid-template-areas:([\s\S]*?);/, 'video areas declared')
  // Every base area is one column wide: nothing spans, so mobile is one column.
  const areas = [...base.matchAll(/grid-template-areas:\s*([\s\S]*?);/g)].map((match) =>
    [...match[1].matchAll(/'([a-z ]+)'/g)].map((row) => row[1].trim()),
  )
  for (const rows of areas) {
    for (const row of rows) {
      assert.equal(row.includes(' '), false, `"${row}" must be a single column on mobile`)
    }
  }
})

test('the frame gallery is the only horizontally scrolling element', () => {
  const css = readSource('src/index.css')
  const scrollers = [...css.matchAll(/([^{}]+)\{([^{}]*overflow-x:\s*auto[^{}]*)\}/g)]

  assert.equal(scrollers.length, 1, 'exactly one horizontal scroll container')
  assert.match(scrollers[0][1].trim(), /\.gallery__track/)
  assert.match(readSource('src/index.css'), /body \{[\s\S]*?overflow-x:\s*hidden;/, 'the page never scrolls sideways')
})
