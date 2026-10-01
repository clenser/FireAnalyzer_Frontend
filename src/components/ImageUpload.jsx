import { useRef, useState } from 'react'
import { Flame, Upload, TriangleAlert, X } from 'lucide-react'
import { ACCEPT_ATTRIBUTE, SUPPORTED_DETAIL } from '../config'
import { formatBytes } from '../utils/format'
import { ImageCanvas } from './ImageCanvas'

/**
 * A dropzone plus a size-constrained preview.
 *
 * The preview box has a fixed aspect ratio and its own max-height, and the image
 * is absolutely positioned with `object-fit: contain`, so selecting a tall photo
 * can never stretch the panel beyond a viewport-bounded height.
 */
export default function ImageUpload({
  file,
  previewUrl,
  dimensions,
  onSelect,
  onClear,
  isAnalyzing,
  validationError,
  children,
}) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const openPicker = () => {
    if (!isAnalyzing) inputRef.current?.click()
  }

  const handleInputChange = (event) => {
    const selected = event.target.files?.[0]
    if (selected) onSelect(selected)
    event.target.value = ''
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    if (isAnalyzing) return
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) onSelect(dropped)
  }

  return (
    <div className="upload">
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
        <div className="upload__selected">
          <ImageCanvas
            className="upload__preview"
            src={previewUrl}
            alt={file.name ? `Selected flame image: ${file.name}` : 'Selected flame image'}
            aspectRatio={
              dimensions?.width && dimensions?.height ? `${dimensions.width} / ${dimensions.height}` : '4 / 3'
            }
            scanning={isAnalyzing}
          />

          <div className="filebar">
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

          {children}
        </div>
      ) : (
        <div
          className="dropzone"
          data-dragging={isDragging ? 'true' : 'false'}
          onClick={openPicker}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openPicker()
            }
          }}
          onDrop={handleDrop}
          onDragOver={(event) => {
            event.preventDefault()
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
          }}
          onDragEnter={(event) => {
            event.preventDefault()
            if (!isAnalyzing) setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          role="button"
          tabIndex={0}
          aria-label="Upload a flame image"
        >
          <span className="dropzone__icon" aria-hidden="true">
            <Flame size={24} strokeWidth={1.5} />
          </span>
          <p className="dropzone__title">Drop an image here</p>
          <p className="dropzone__desc">or choose a file to analyse.</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={(event) => {
              event.stopPropagation()
              openPicker()
            }}
          >
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
    </div>
  )
}
