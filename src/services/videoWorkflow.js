/**
 * The video workflow, as a pure orchestration step.
 *
 * Once every extracted frame has been through `POST /analyze`, the clip needs two
 * backend answers and nothing else:
 *
 *   1. `POST /material-identification` - deterministic. The client has measured
 *      and averaged the flame colour; the backend's own matcher turns it into the
 *      primary material, the alternatives, the fire class and the agents. No
 *      classification happens in JavaScript, and no AI model is involved.
 *   2. `POST /video-material-analysis` - ONE Gemini request over every analysed
 *      frame's evidence, returning ONE consolidated video-level assessment.
 *      Gemini is never called per frame and per-frame confidences are never
 *      averaged.
 *
 * Both are optional by design: neither may fail the run. A deterministic failure
 * leaves the material and fire class unavailable - stated, never invented - while
 * the measurements around it stand. A Gemini failure (or a result below the
 * display threshold) simply omits the AI card.
 *
 * Keeping this separate from the React hook makes the guarantees above directly
 * testable: the number and order of requests is observable without a browser.
 */

import { analyzeVideoMaterial, identifyMaterial } from './api.js'
import { aggregateFrameResults, buildVideoFrameEvidence } from '../utils/aggregate.js'

/**
 * Runs the post-frame-analysis stage for a clip.
 *
 * @param {object} params
 * @param {Array}  params.frames   Frames as produced by `extractFrames`.
 * @param {Array}  params.results  Per-frame outcome (`{ ok, data }` or `{ ok: false, error }`).
 * @param {AbortSignal} [params.signal]
 * @param {(stage: string) => void} [params.onStage] Progress hook, for UI text.
 */
export async function runVideoWorkflow({ frames = [], results = [], signal, onStage } = {}) {
  const aggregation = aggregateFrameResults(frames, results)
  const report = typeof onStage === 'function' ? onStage : () => {}

  // Enough successful frames? A few failures are tolerated; a mostly-failed run is
  // not presented as a result at all.
  if (!aggregation.reliable) {
    return { aggregation, insufficientFrames: true }
  }

  let materialIdentification = null
  let materialIdentificationFailed = false

  if (aggregation.rgb && aggregation.lab) {
    report('material')
    try {
      const identified = await identifyMaterial(
        { rgb: aggregation.rgb, lab: aggregation.lab },
        { signal },
      )
      materialIdentification = identified.data
    } catch (error) {
      // A cancelled run is not a failure: it is re-thrown by the caller below.
      if (error?.name === 'AbortError') throw error
      materialIdentification = null
      materialIdentificationFailed = true
    }
  }

  let videoAi = null
  const evidence = buildVideoFrameEvidence(aggregation.frames)

  if (evidence.length > 0) {
    report('ai')
    try {
      const analysed = await analyzeVideoMaterial(evidence, { signal })
      videoAi = analysed.data
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      videoAi = null
    }
  }

  return {
    aggregation,
    insufficientFrames: false,
    materialIdentification,
    materialIdentificationFailed,
    videoAi,
  }
}
