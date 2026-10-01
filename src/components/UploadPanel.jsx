import { useRef, useState } from 'react'
import { Flame, Upload, X, ScanLine, TriangleAlert, ImageIcon } from 'lucide-react'
import { ACCEPT_ATTRIBUTE, SUPPORTED_DETAIL } from '../config'
import { formatBytes } from '../utils/format'
import ImagePreview from './ImagePreview'
import { Card } from './ui'

export default function UploadPanel({
  file,
  previewUrl,
  dimensions,
  onSelect,
  onClear,
  onAnalyze,
  isAnalyzing,
  connectionReady,
  showOverlay,
  boundingBox,
  segmentation,
  validationError,
}) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragDepth = useRef(0)

  const openPicker = () => {
    if (!isAnalyzing) inputRef.current?.click()
  }

  // The dropzone itself is clickable; the inner button stops the click bubbling
  // so the file dialog is not opened twice.
  const handleChooseClick = (event) => {
    event.stopPropagation()
    openPicker()
  }

  const handleInputChange = (event) => {
    const selected = event.target.files?.[0]
    if (selected) onSelect(selected)
    event.target.value = ''
  }

  const handleDrop = (event) => {
    event.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    if (isAnalyzing) return

    const dropped = event.dataTransfer.files?.[0]
    if (dropped) onSelect(dropped)
  }

  const handleDragEnter = (event) => {
    event.preventDefault()
    dragDepth.current += 1
    if (!isAnalyzing) setIsDragging(true)
  }

  const handleDragLeave = (event) => {
    event.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setIsDragging(false)
    }
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  return (
    <Card className="panel upload-panel">
      <header className="panel__header">
        <h2 className="panel__title">Source Image</h2>
        <span className="panel__hint">{SUPPORTED_DETAIL}</span>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="visually-hidden"
        onChange={handleInputChange}
        tabIndex={-1}
        aria-hidden="true"
      />

      {file && previewUrl ? (
        <div className="upload-panel__selected">
          <ImagePreview
            src={previewUrl}
            fileName={file.name}
            alt={file.name ? `Flame image to analyse, ${file.name}` : 'Flame image to analyse'}
            dimensions={dimensions}
            boundingBox={boundingBox}
            segmentation={segmentation}
            showOverlay={showOverlay}
            scanning={isAnalyzing}
          />

          <div className="filebar">
            <ImageIcon size={14} strokeWidth={1.75} aria-hidden="true" className="filebar__icon" />
            <span className="filebar__name" title={file.name}>
              {file.name}
            </span>
            <span className="filebar__size is-mono">{formatBytes(file.size)}</span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={onClear}
              disabled={isAnalyzing}
            >
              <X size={13} strokeWidth={2} aria-hidden="true" />
              Remove
            </button>
          </div>

          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={onAnalyze}
            disabled={isAnalyzing || !connectionReady}
          >
            {isAnalyzing ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Analyzing…
              </>
            ) : (
              <>
                <ScanLine size={16} strokeWidth={2} aria-hidden="true" />
                Analyze Flame
              </>
            )}
          </button>
        </div>
      ) : (
        <div
          className="dropzone"
          data-dragging={isDragging ? 'true' : 'false'}
          onClick={openPicker}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <span className="dropzone__icon" aria-hidden="true">
            <Flame size={26} strokeWidth={1.5} />
          </span>
          <p className="dropzone__title">Upload a flame image</p>
          <p className="dropzone__desc">Drop an image here or select a file to begin analysis.</p>
          <button type="button" className="btn btn--primary" onClick={handleChooseClick}>
            <Upload size={15} strokeWidth={2} aria-hidden="true" />
            Choose Image
          </button>
          <p className="dropzone__meta">{SUPPORTED_DETAIL}</p>
        </div>
      )}

      {validationError ? (
        <p className="alert alert--error" role="alert">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />
          <span>{validationError}</span>
        </p>
      ) : null}
    </Card>
  )
}
