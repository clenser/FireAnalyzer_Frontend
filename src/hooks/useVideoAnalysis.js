import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyzeImage } from '../services/api.js'
import { getAverageRequestDurationMs } from '../services/performanceStore.js'
import { runVideoWorkflow } from '../services/videoWorkflow.js'
import { estimateRemainingDuration, estimateVideoDuration } from '../utils/estimate.js'
import { validateVideoFile } from '../utils/validateFile.js'
import {
  describeVideoError,
  extractFrames,
  generateRandomTimestamps,
  loadVideoSource,
  resolveFrameCount,
} from '../utils/videoFrames.js'
import { DEFAULT_FRAME_COUNT } from '../config.js'

export const VIDEO_STATUS = {
  idle: 'idle',
  loading: 'loading',
  ready: 'ready',
  analyzing: 'analyzing',
  success: 'success',
  error: 'error',
}

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

/**
 * Video analysis.
 *
 * The pipeline is:
 *
 *   video -> N random timestamps -> N frames -> N x POST /analyze
 *         -> collect successful frame evidence
 *         -> average RGB / LAB
 *         -> POST /material-identification   (deterministic; source of truth)
 *         -> POST /video-material-analysis   (ONE Gemini call, all frame evidence)
 *         -> final results
 *
 * Both extra calls are independent: neither may fail the run. A deterministic
 * failure leaves the material and fire class "unavailable"; a Gemini failure (or
 * a result below the display threshold) simply omits the AI card. The reported
 * duration is the measured wall-clock time of this whole workflow - nothing is
 * estimated or fabricated.
 */
export default function useVideoAnalysis() {
  const [file, setFile] = useState(null)
  const [source, setSource] = useState(null)
  const [metadata, setMetadata] = useState(null)
  const [frameCount, setFrameCount] = useState(DEFAULT_FRAME_COUNT)
  const [validationError, setValidationError] = useState(null)
  const [status, setStatus] = useState(VIDEO_STATUS.idle)
  const [result, setResult] = useState(null)
  const [durationMs, setDurationMs] = useState(null)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(null)
  /** Mean duration of real image requests; feeds the estimate once measured. */
  const [measuredFrameMs, setMeasuredFrameMs] = useState(null)

  const sourceRef = useRef(null)
  const abortRef = useRef(null)
  const frameUrlsRef = useRef([])

  const estimate = useMemo(
    () => estimateVideoDuration({ frameCount, averageFrameMs: measuredFrameMs }),
    [frameCount, measuredFrameMs],
  )

  const releaseFrames = useCallback(() => {
    for (const url of frameUrlsRef.current) URL.revokeObjectURL(url)
    frameUrlsRef.current = []
  }, [])

  const disposeSource = useCallback(() => {
    sourceRef.current?.dispose?.()
    sourceRef.current = null
  }, [])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      releaseFrames()
      disposeSource()
    },
    [disposeSource, releaseFrames],
  )

  const resetRunState = useCallback(() => {
    setResult(null)
    setDurationMs(null)
    setError(null)
    setProgress(null)
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    releaseFrames()
    disposeSource()
    resetRunState()

    setFile(null)
    setSource(null)
    setMetadata(null)
    setValidationError(null)
    setStatus(VIDEO_STATUS.idle)
  }, [disposeSource, releaseFrames, resetRunState])

  const select = useCallback(
    async (candidate) => {
      abortRef.current?.abort()
      abortRef.current = null

      if (!candidate) return null

      const validation = validateVideoFile(candidate)
      if (!validation.ok) {
        setValidationError(validation.message)
        return null
      }

      releaseFrames()
      disposeSource()
      resetRunState()

      setFile(null)
      setSource(null)
      setMetadata(null)
      setValidationError(null)
      setStatus(VIDEO_STATUS.loading)

      try {
        const loaded = await loadVideoSource(candidate)
        sourceRef.current = loaded
        setSource(loaded)
        setMetadata(loaded.metadata)
        setFile(candidate)
        setStatus(VIDEO_STATUS.ready)
        return loaded
      } catch (err) {
        setStatus(VIDEO_STATUS.idle)
        setValidationError(describeVideoError(err))
        return null
      }
    },
    [disposeSource, releaseFrames, resetRunState],
  )

  const changeFrameCount = useCallback((value) => {
    setFrameCount(resolveFrameCount(value))
  }, [])

  const run = useCallback(async () => {
    if (!file || !source) return
    if (status === VIDEO_STATUS.analyzing || status === VIDEO_STATUS.loading) return

    const controller = new AbortController()
    abortRef.current = controller
    const startedAt = now()
    const { video, metadata: videoMeta } = source
    const total = resolveFrameCount(frameCount)

    setStatus(VIDEO_STATUS.analyzing)
    resetRunState()
    setProgress({ phase: 'extracting', completed: 0, total, timestamp: null, startedAt })

    let frames
    try {
      const timestamps = generateRandomTimestamps(videoMeta.durationSec, total)
      frames = await extractFrames(video, timestamps, {
        onFrame: ({ completed, total: extractedTotal, timestamp }) => {
          setProgress({
            phase: 'extracting',
            completed,
            total: extractedTotal,
            timestamp,
            startedAt,
          })
        },
      })
    } catch (err) {
      if (controller.signal.aborted) return
      setProgress(null)
      setError({ message: describeVideoError(err), code: err?.code ?? null, notice: null })
      setStatus(VIDEO_STATUS.error)
      return
    }

    if (controller.signal.aborted) return

    releaseFrames()
    frameUrlsRef.current = frames.map((frame) => frame.dataUrl).filter(Boolean)
    const results = Array.from({ length: frames.length }, () => null)

    for (const [position, frame] of frames.entries()) {
      if (controller.signal.aborted) return
      if (!frame.file) {
        results[position] = { ok: false, error: 'frame-extraction-failed' }
        continue
      }
      try {
        const response = await analyzeImage(frame.file, { signal: controller.signal })
        results[position] = { ok: true, data: response.data, durationMs: response.durationMs }
      } catch (err) {
        if (err?.name === 'AbortError' || controller.signal.aborted) return
        results[position] = { ok: false, error: err?.message ?? 'frame-failed' }
      }
      setProgress({
        phase: 'analyzing',
        completed: position + 1,
        total: frames.length,
        timestamp: frame.timestamp,
        startedAt,
      })
    }

    const { aggregation, insufficientFrames, materialIdentification, materialIdentificationFailed, videoAi } =
      await runVideoWorkflow({
        frames,
        results,
        signal: controller.signal,
      })

    if (controller.signal.aborted) return
    setMeasuredFrameMs(getAverageRequestDurationMs())

    if (insufficientFrames) {
      setProgress(null)
      setDurationMs(now() - startedAt)
      setError({
        message: describeVideoError({ code: 'INSUFFICIENT_FRAMES' }),
        code: 'INSUFFICIENT_FRAMES',
        notice: `${aggregation.framesSucceeded} of ${aggregation.framesAnalyzed} frames analyzed successfully`,
      })
      setStatus(VIDEO_STATUS.error)
      return
    }

    setDurationMs(now() - startedAt)
    setResult({
      frames,
      aggregation,
      materialIdentification,
      materialIdentificationFailed,
      videoAi,
      selectedFrameCount: total,
    })
    setProgress(null)
    setStatus(VIDEO_STATUS.success)
  }, [file, frameCount, resetRunState, releaseFrames, source, status])

  const remainingFrames =
    progress && progress.total > progress.completed ? progress.total - progress.completed : estimate.frameCount

  const estimatedRemainingMs = useMemo(
    () =>
      estimateRemainingDuration({ framesRemaining: remainingFrames, perFrameMs: estimate.perFrameMs }),
    [estimate.perFrameMs, remainingFrames],
  )

  return {
    file,
    metadata,
    frameCount,
    validationError,
    status,
    result,
    durationMs,
    error,
    progress,
    estimate,
    estimatedRemainingMs,
    isAnalyzing: status === VIDEO_STATUS.analyzing,
    isLoading: status === VIDEO_STATUS.loading,
    isBusy: status === VIDEO_STATUS.analyzing || status === VIDEO_STATUS.loading,
    hasResult: status === VIDEO_STATUS.success,
    select,
    clear,
    changeFrameCount,
    run,
  }
}
