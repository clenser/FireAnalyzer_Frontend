import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeVideo } from '../services/api.js'
import { notifyActivity } from '../services/activityHeartbeat.js'
import { validateVideoFile } from '../utils/validateFile.js'
import { describeVideoError, loadVideoSource } from '../utils/videoFrames.js'
import { VIDEO_FRAME_COUNT_DEFAULT, VIDEO_FRAME_COUNT_MAX, VIDEO_FRAME_COUNT_MIN } from '../config.js'

export const VIDEO_STATUS = {
  idle: 'idle',
  loading: 'loading',
  ready: 'ready',
  analyzing: 'analyzing',
  success: 'success',
  error: 'error',
}

/** Stages shown while the request is in flight - a real timeline, no fake percentage. */
export const VIDEO_STAGES = [
  'Preparing video',
  'Sampling frames',
  'Analyzing flames',
  'Building material result',
  'Finalizing results',
]

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

/**
 * Video analysis.
 *
 * The whole pipeline - frame sampling, per-frame detection/segmentation/colour/
 * vision evidence, Python fusion and the majority vote - runs server-side in a
 * single `POST /analyze-video` call. The frontend only reads the file's
 * duration/resolution locally for display before upload; it never extracts,
 * encodes or uploads individual frames itself.
 */
export default function useVideoAnalysis() {
  const [file, setFile] = useState(null)
  const [metadata, setMetadata] = useState(null)
  const [validationError, setValidationError] = useState(null)
  const [status, setStatus] = useState(VIDEO_STATUS.idle)
  const [result, setResult] = useState(null)
  const [durationMs, setDurationMs] = useState(null)
  const [error, setError] = useState(null)
  const [stageIndex, setStageIndex] = useState(0)
  const [startedAt, setStartedAt] = useState(null)
  const [forceNewAnalysis, setForceNewAnalysis] = useState(false)
  // The frame count the user chose before analysis starts - sent to the
  // backend as `frame_count`. There is no mid-analysis prompt for this: once
  // `run` fires, the value is locked in for that request.
  const [frameCount, setFrameCount] = useState(VIDEO_FRAME_COUNT_DEFAULT)
  // The flag actually used by the last completed request, captured at request
  // time so a later toggle change can never relabel a result that already came
  // back.
  const [wasForced, setWasForced] = useState(false)

  const abortRef = useRef(null)
  const stageTimerRef = useRef(null)

  const clearStageTimer = useCallback(() => {
    if (stageTimerRef.current) {
      clearInterval(stageTimerRef.current)
      stageTimerRef.current = null
    }
  }, [])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      clearStageTimer()
    },
    [clearStageTimer],
  )

  const resetRunState = useCallback(() => {
    setResult(null)
    setDurationMs(null)
    setError(null)
    setStageIndex(0)
    setStartedAt(null)
    setWasForced(false)
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    clearStageTimer()
    resetRunState()

    setFile(null)
    setMetadata(null)
    setValidationError(null)
    setStatus(VIDEO_STATUS.idle)
  }, [clearStageTimer, resetRunState])

  const select = useCallback(
    async (candidate) => {
      abortRef.current?.abort()
      abortRef.current = null
      notifyActivity()

      if (!candidate) return null

      const validation = validateVideoFile(candidate)
      if (!validation.ok) {
        setValidationError(validation.message)
        return null
      }

      resetRunState()
      setFile(null)
      setMetadata(null)
      setValidationError(null)
      setStatus(VIDEO_STATUS.loading)

      try {
        const source = await loadVideoSource(candidate)
        const videoMetadata = source.metadata
        source.dispose()
        setMetadata(videoMetadata)
        setFile(candidate)
        setStatus(VIDEO_STATUS.ready)
        return videoMetadata
      } catch (err) {
        setStatus(VIDEO_STATUS.idle)
        setValidationError(describeVideoError(err))
        return null
      }
    },
    [resetRunState],
  )

  const run = useCallback(async () => {
    if (!file) return
    if (status === VIDEO_STATUS.analyzing || status === VIDEO_STATUS.loading) return
    notifyActivity()

    const controller = new AbortController()
    abortRef.current = controller
    const runStartedAt = now()

    setStatus(VIDEO_STATUS.analyzing)
    resetRunState()
    setStartedAt(runStartedAt)
    setStageIndex(0)
    setWasForced(forceNewAnalysis)

    clearStageTimer()
    stageTimerRef.current = setInterval(() => {
      setStageIndex((stage) => Math.min(VIDEO_STAGES.length - 1, stage + 1))
    }, 3500)

    // Defence in depth: FrameCountInput already keeps this in range, but a
    // request is never sent with a value outside what the backend accepts.
    const clampedFrameCount = Math.min(
      VIDEO_FRAME_COUNT_MAX,
      Math.max(VIDEO_FRAME_COUNT_MIN, Math.round(frameCount) || VIDEO_FRAME_COUNT_DEFAULT),
    )

    try {
      const response = await analyzeVideo(file, {
        signal: controller.signal,
        forceNewAnalysis,
        frameCount: clampedFrameCount,
      })
      clearStageTimer()
      setResult(response.data)
      setDurationMs(response.durationMs)
      setStatus(VIDEO_STATUS.success)
    } catch (err) {
      clearStageTimer()
      if (err?.name === 'AbortError') return
      setError({ message: err?.message ?? 'Analysis failed.', code: err?.code ?? null, status: err?.status ?? null })
      setStatus(VIDEO_STATUS.error)
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [file, status, forceNewAnalysis, frameCount, resetRunState, clearStageTimer])

  return {
    file,
    metadata,
    validationError,
    status,
    result,
    durationMs,
    error,
    startedAt,
    currentStage: VIDEO_STAGES[stageIndex] ?? VIDEO_STAGES[0],
    forceNewAnalysis,
    setForceNewAnalysis,
    frameCount,
    setFrameCount,
    wasForced,
    isAnalyzing: status === VIDEO_STATUS.analyzing,
    isLoading: status === VIDEO_STATUS.loading,
    isBusy: status === VIDEO_STATUS.analyzing || status === VIDEO_STATUS.loading,
    hasResult: status === VIDEO_STATUS.success,
    select,
    clear,
    run,
  }
}
