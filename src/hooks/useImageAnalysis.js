import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeImage } from '../services/api.js'
import { notifyActivity } from '../services/activityHeartbeat.js'
import { validateImageFile } from '../utils/validateFile.js'

export const IMAGE_STATUS = {
  idle: 'idle',
  ready: 'ready',
  analyzing: 'analyzing',
  success: 'success',
  error: 'error',
}

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

/** Reads the natural size of a picked image so the preview keeps its ratio. */
export function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode-failed'))
    }
    image.src = url
  })
}

/**
 * Image selection, analysis and result state.
 *
 * The measured request duration is kept here (not a backend timing field) so the
 * UI only ever shows a time the user actually waited.
 */
export default function useImageAnalysis() {
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [dimensions, setDimensions] = useState(null)
  const [validationError, setValidationError] = useState(null)
  const [status, setStatus] = useState(IMAGE_STATUS.idle)
  const [data, setData] = useState(null)
  const [durationMs, setDurationMs] = useState(null)
  const [error, setError] = useState(null)
  const [startedAt, setStartedAt] = useState(null)
  const [forceNewAnalysis, setForceNewAnalysis] = useState(false)
  // The flag actually used by the last completed request, captured at request
  // time so a later toggle change can never relabel a result that already came
  // back.
  const [wasForced, setWasForced] = useState(false)

  const previewRef = useRef(null)
  const abortRef = useRef(null)

  const revokePreview = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }
  }, [])

  useEffect(() => revokePreview, [revokePreview])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    revokePreview()

    setFile(null)
    setPreviewUrl(null)
    setDimensions(null)
    setValidationError(null)
    setStatus(IMAGE_STATUS.idle)
    setData(null)
    setDurationMs(null)
    setError(null)
    setStartedAt(null)
    setWasForced(false)
  }, [revokePreview])

  const select = useCallback(
    async (candidate) => {
      abortRef.current?.abort()
      abortRef.current = null
      notifyActivity()

      if (!candidate) return null

      const validation = validateImageFile(candidate)
      if (!validation.ok) {
        setValidationError(validation.message)
        return null
      }

      let size
      try {
        size = await readImageDimensions(candidate)
      } catch {
        setValidationError('This file could not be read as an image. Please choose a JPG or PNG file.')
        return null
      }

      revokePreview()
      const objectUrl = URL.createObjectURL(candidate)
      previewRef.current = objectUrl

      setFile(candidate)
      setPreviewUrl(objectUrl)
      setDimensions(size)
      setValidationError(null)
      setStatus(IMAGE_STATUS.ready)
      setData(null)
      setDurationMs(null)
      setError(null)
      setStartedAt(null)

      return objectUrl
    },
    [revokePreview],
  )

  const run = useCallback(async () => {
    if (!file || status === IMAGE_STATUS.analyzing) return
    notifyActivity()

    const controller = new AbortController()
    abortRef.current = controller
    const runStartedAt = now()

    setStatus(IMAGE_STATUS.analyzing)
    setStartedAt(runStartedAt)
    setError(null)
    setData(null)
    setDurationMs(null)
    setWasForced(forceNewAnalysis)

    try {
      const result = await analyzeImage(file, { signal: controller.signal, forceNewAnalysis })
      setData(result.data)
      setDurationMs(result.durationMs)
      setStatus(IMAGE_STATUS.success)
    } catch (err) {
      if (err?.name === 'AbortError') return
      setError({
        message: err?.message ?? 'Analysis failed.',
        code: err?.code ?? null,
        status: err?.status ?? null,
      })
      setStatus(IMAGE_STATUS.error)
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [file, status, forceNewAnalysis])

  return {
    file,
    previewUrl,
    dimensions,
    validationError,
    status,
    data,
    durationMs,
    error,
    startedAt,
    forceNewAnalysis,
    setForceNewAnalysis,
    wasForced,
    isAnalyzing: status === IMAGE_STATUS.analyzing,
    hasResult: status === IMAGE_STATUS.success,
    select,
    clear,
    run,
  }
}
