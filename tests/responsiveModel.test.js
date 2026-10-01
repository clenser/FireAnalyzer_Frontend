import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { normaliseResponse } from '../src/services/normalize.js'
import { buildImageResultModel, buildVideoResultModel } from '../src/services/viewModel.js'
import { aggregateFrameResults } from '../src/utils/aggregate.js'
import { REPRESENTATIVE_FRAME_COUNT } from '../src/config.js'

/**
 * The compactness and responsiveness of the result data model, and of the layout
 * that presents it.
 *
 * Three things are asserted here. First, what the view model hands the
 * components: a gallery of two or three frames, a summary of three numbers, a
 * colour card of a swatch plus two values, and at most three alternatives - so a
 * card cannot be given content that would stretch it. Second, the layout itself:
 * one results grid, every card placed by an explicit `grid-column`, no
 * `grid-auto-flow` and no named areas deciding where a result lands, no fixed
 * heights, and no stretching. Third, the two viewports: a two-column workspace
 * above 900px and a single-column one below it, where the half-width pairs stop
 * existing.
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

/* ------------------------------- the layout ------------------------------- */

/** Every `@media (width)` block in the stylesheet, with its condition in px. */
function mediaBlocks(css) {
  return [...css.matchAll(/@media \((?:min|max)-width: (\d+)px\) \{/g)].map((match) => {
    const start = match.index + match[0].length
    const next = css.indexOf('\n@media', start)
    const end = next === -1 ? css.length : next
    return { condition: Number(match[1]), start, end, body: css.slice(start, end) }
  })
}

const RESULT_CARDS = [
  'AnalyzedFrameGallery',
  'VideoSummaryCard',
  'FlameImageCard',
  'DetectionCard',
  'FlameColorCard',
  'MaterialCard',
  'AiMaterialCard',
  'FireClassCard',
  'SuppressionCard',
  'DurationNote',
]

/** The result cards in the order the component renders them. */
const renderedOrder = (component) => {
  const source = readSource(`src/components/${component}`)
  return [...source.matchAll(/<([A-Z][A-Za-z]+)\b/g)]
    .map((match) => match[1])
    .filter((name) => RESULT_CARDS.includes(name))
}

test('the video dashboard renders in one fixed card order', () => {
  assert.deepEqual(renderedOrder('VideoAnalysisResult.jsx'), [
    'AnalyzedFrameGallery',
    'VideoSummaryCard',
    'DetectionCard',
    'FlameColorCard',
    'MaterialCard',
    'AiMaterialCard',
    'FireClassCard',
    'SuppressionCard',
    'DurationNote',
  ])
})

test('the image dashboard renders in one fixed card order', () => {
  assert.deepEqual(renderedOrder('ImageAnalysisResult.jsx'), [
    'FlameImageCard',
    'DetectionCard',
    'FlameColorCard',
    'MaterialCard',
    'AiMaterialCard',
    'FireClassCard',
    'SuppressionCard',
    'DurationNote',
  ])
})

test('the results are one twelve-column grid that never stretches a card', () => {
  const css = readSource('src/index.css')
  const grid = css.slice(css.indexOf('.result-grid {'), css.indexOf('.result-card {'))

  assert.match(grid, /grid-template-columns:\s*repeat\(12, minmax\(0, 1fr\)\);/, 'twelve tracks')
  assert.match(grid, /gap:\s*var\(--result-gap\);/, 'one uniform gap')
  assert.match(grid, /align-items:\s*start;/, 'cards keep their natural height')
})

test('a result card is never placed by a named area or by auto-placement', () => {
  const css = readSource('src/index.css')

  assert.equal(/grid-template-areas/.test(css), false, 'no named areas decide placement')
  assert.equal(/(^|[\s;{])grid-area:/.test(css), false, 'no card is placed by grid-area')
  assert.equal(/\.result-grid[^{]*\{[^}]*grid-auto-flow/.test(css), false, 'no auto-flow')
})

test('every result card class declares the columns it occupies', () => {
  const css = readSource('src/index.css')
  const defaults = css.slice(css.indexOf('.area-gallery,'), css.indexOf('@media (min-width: 901px) {\n  /* Video'))

  for (const area of [
    'area-gallery',
    'area-summary',
    'area-image',
    'area-detection',
    'area-color',
    'area-material',
    'area-ai',
    'area-class',
    'area-status',
  ]) {
    assert.ok(defaults.includes(`.${area}`), `${area} is placed by the grid`)
  }
  assert.match(defaults, /grid-column:\s*1 \/ -1;/, 'the default is the full results width')
})

test('the only half-width cards are the video pair and the image pairs', () => {
  const css = readSource('src/index.css')
  const spans = [...css.matchAll(/grid-column:\s*span \d+;/g)]

  assert.equal(spans.length, 3, 'exactly the three deliberate pairs: video, image, image')
  assert.match(css, /\.result-grid--video \.area-detection,\s*\.result-grid--video \.area-color \{\s*grid-column:\s*span 6;/)
  assert.match(css, /\.result-grid--image \.area-image,\s*\.result-grid--image \.area-color \{\s*grid-column:\s*span 7;/)
  assert.match(css, /\.result-grid--image \.area-detection,\s*\.result-grid--image \.area-material \{\s*grid-column:\s*span 5;/)

  for (const span of spans) {
    const block = mediaBlocks(css).find((entry) => span.index >= entry.start && span.index <= entry.end)
    assert.ok(block, `a span outside any media query: ${span[0]}`)
    assert.equal(block.condition, 901, 'pairs only exist on the two-column viewport')
  }
})

test('a pair card with no partner fills its row instead of leaving half blank', () => {
  const css = readSource('src/index.css')
  assert.match(css, /\.result-grid \.is-solo \{\s*grid-column:\s*1 \/ -1;/)

  for (const component of ['VideoAnalysisResult.jsx', 'ImageAnalysisResult.jsx']) {
    const source = readSource(`src/components/${component}`)
    assert.match(source, /is-solo/, `${component} marks an unpaired card`)
  }
})

test('the workspace is two columns above 900px and one column below it', () => {
  const css = readSource('src/index.css')
  const workspace = css.slice(css.indexOf('.workspace {'), css.indexOf('.workspace__col {'))

  assert.match(workspace, /grid-template-columns:\s*minmax\(0, 1fr\);/, 'one column by default')
  assert.match(workspace, /align-items:\s*start;/, 'the source panel is never stretched')

  const wide = mediaBlocks(css).find((block) => block.condition === 901 && block.body.includes('.workspace {'))
  assert.ok(wide, 'the two-column workspace is declared')
  assert.match(wide.body, /grid-template-columns:\s*var\(--workspace-input\) minmax\(0, 1fr\);/)
})

test('the source panel is content-sized and the page is a bounded canvas', () => {
  const css = readSource('src/index.css')

  assert.match(css, /\.input-panel \{[\s\S]*?align-self:\s*start;/, 'the source panel keeps its own height')
  assert.equal(/\.input-panel \{[^}]*height:/.test(css), false, 'the source panel has no height of its own')
  assert.match(css, /--app-width:\s*min\(100% - 32px, 1400px\);/, 'the canvas stops growing at 1400px')
  assert.match(css, /\.shell \{[\s\S]*?width:\s*var\(--app-width\);[\s\S]*?margin-inline:\s*auto;/)
})

test('the frame gallery is the only horizontally scrolling element', () => {
  const css = readSource('src/index.css')
  const scrollers = [...css.matchAll(/([^{}]+)\{([^{}]*overflow-x:\s*auto[^{}]*)\}/g)]

  assert.equal(scrollers.length, 1, 'exactly one horizontal scroll container')
  assert.match(scrollers[0][1].trim(), /\.gallery__track/)
  assert.match(css, /body \{[\s\S]*?overflow-x:\s*hidden;/, 'the page never scrolls sideways')
})
