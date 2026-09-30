import { useCallback, useEffect, useRef, useState } from 'react'
import Header from './components/Header'
import UploadPanel from './components/UploadPanel'
import AnalysisResults from './components/AnalysisResults'
import { Card } from './components/ui'
import { analyzeImage, checkHealth } from './services/api'
import { validateImageFile } from './utils/validateFile'

const STATUS = {
  idle: 'idle',
  ready: 'ready',
  analyzing: 'analyzing',
  success: 'success',
  error: 'error',
}

function readImageDimensions(file) {
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

export default function App() {
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [dimensions, setDimensions] = useState(null)
  const [validationError, setValidationError] = useState(null)

  const [status, setStatus] = useState(STATUS.idle)
  const [data, setData] = useState(null)
  const [rawPayload, setRawPayload] = useState(null)
  const [error, setError] = useState(null)

  const [health, setHealth] = useState({ state: 'checking' })

  const previewRef = useRef(null)
  const analysisAbort = useRef(null)

  /* ---------------- API health ---------------- */

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    checkHealth({ signal: controller.signal })
      .then((result) => {
        if (cancelled) return
        setHealth({
          state: result.status === 'ok' ? 'online' : 'offline',
          device: result.device,
        })
      })
      .catch((err) => {
        if (!cancelled && err?.name !== 'AbortError') setHealth({ state: 'offline' })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  /* ---------------- File handling ---------------- */

  const clearSelection = useCallback(() => {
    analysisAbort.current?.abort()
    analysisAbort.current = null

    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }

    setFile(null)
    setPreviewUrl(null)
    setDimensions(null)
    setValidationError(null)
    setData(null)
    setRawPayload(null)
    setError(null)
    setStatus(STATUS.idle)
  }, [])

  const handleSelect = useCallback(async (candidate) => {
    if (analysisAbort.current) {
      analysisAbort.current.abort()
      analysisAbort.current = null
    }

    if (!candidate) return

    const validation = validateImageFile(candidate)
    if (!validation.ok) {
      setValidationError(validation.message)
      return
    }

    let dimensionsResult
    try {
      dimensionsResult = await readImageDimensions(candidate)
    } catch {
      setValidationError(
        'This file could not be decoded as an image. Please select a valid JPG or PNG file.',
      )
      return
    }

    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    const objectUrl = URL.createObjectURL(candidate)
    previewRef.current = objectUrl

    setFile(candidate)
    setPreviewUrl(objectUrl)
    setDimensions(dimensionsResult)
    setValidationError(null)
    setData(null)
    setRawPayload(null)
    setError(null)
    setStatus(STATUS.ready)
  }, [])

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
  }, [])

  /* ---------------- Analysis ---------------- */

  const runAnalysis = useCallback(async () => {
    if (!file || status === STATUS.analyzing) return

    const controller = new AbortController()
    analysisAbort.current = controller

    setStatus(STATUS.analyzing)
    setError(null)
    setData(null)
    setRawPayload(null)

    try {
      const result = await analyzeImage(file, { signal: controller.signal })
      setData(result.data)
      setRawPayload(result.raw)
      setStatus(STATUS.success)
    } catch (err) {
      if (err?.name === 'AbortError') return
      setError({ message: err?.message ?? 'Analysis failed.', code: err?.code, status: err?.status })
      setStatus(STATUS.error)
    } finally {
      if (analysisAbort.current === controller) analysisAbort.current = null
    }
  }, [file, status])

  const isAnalyzing = status === STATUS.analyzing

  return (
    <div className="app">
      <Header health={health} />

      <main className="shell">
        <section className="hero">
          <p className="hero__eyebrow">Computer Vision • Fire Intelligence</p>
          <h1 className="hero__title">Analyze. Identify. Respond.</h1>
          <p className="hero__lede">
            AI-powered flame detection, segmentation, color analysis and material identification.
          </p>
        </section>

        <div className="workspace">
          <div className="workspace__col workspace__col--source">
            <UploadPanel
              file={file}
              previewUrl={previewUrl}
              dimensions={dimensions}
              onSelect={handleSelect}
              onClear={clearSelection}
              onAnalyze={runAnalysis}
              isAnalyzing={isAnalyzing}
              validationError={validationError}
              showOverlay={status === STATUS.success}
              boundingBox={data?.detection?.boundingBox ?? null}
              segmentation={data?.segmentation ?? null}
            />
          </div>

          <div className="workspace__col workspace__col--results">
            <Card className="panel results-panel">
              <AnalysisResults
                status={status}
                data={data}
                rawPayload={rawPayload}
                error={error}
                onRetry={runAnalysis}
              />
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
