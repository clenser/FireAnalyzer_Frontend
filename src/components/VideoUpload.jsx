import { useRef, useState } from 'react'
import { FileVideo, LoaderCircle, TriangleAlert, Upload, X } from 'lucide-react'
import { ACCEPT_VIDEO_ATTRIBUTE, VIDEO_SUPPORTED_DETAIL } from '../config'
import { formatBytes, formatTimestamp } from '../utils/format'

/**
 * Video source selection: dropzone plus a metadata readout, the file's own
 * duration and resolution read locally before upload. The frame-count control
 * and Force New Analysis toggle are passed in as `children`, rendered once a
 * file is selected and before analysis starts. The panel keeps a fixed
 * maximum height and scrolls internally, so a long clip name cannot stretch
 * it.
 */
export default function VideoUpload({
  file,
  metadata,
  onSelect,
  onClear,
  isBusy,
  validationError,
  children,
}) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const openPicker = () => {
    if (!isBusy) inputRef.current?.click()
  }

  const handleInputChange = (event) => {
    const selected = event.target.files?.[0]
    if (selected) onSelect(selected)
    event.target.value = ''
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    if (isBusy) return
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) onSelect(dropped)
  }

  return (
    <div className="upload">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_VIDEO_ATTRIBUTE}
        className="visually-hidden"
        onChange={handleInputChange}
        tabIndex={-1}
        aria-hidden="true"
      />

      {file && metadata ? (
        <div className="upload__selected">
          <div className="videometa">
            <span className="videometa__icon" aria-hidden="true">
              <FileVideo size={18} strokeWidth={1.75} />
            </span>
            <div className="videometa__body">
              <p className="videometa__name" title={file.name}>
                {file.name}
              </p>
              <p className="videometa__facts is-mono">
                {formatBytes(file.size)}
                <span aria-hidden="true"> · </span>
                {formatTimestamp(metadata.durationSec)}
                {metadata.width && metadata.height ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    {metadata.width}×{metadata.height}
                  </>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={onClear}
              disabled={isBusy}
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
            if (!isBusy) setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          role="button"
          tabIndex={0}
          aria-label="Upload a fire video"
        >
          <span className="dropzone__icon" aria-hidden="true">
            <FileVideo size={24} strokeWidth={1.5} />
          </span>
          <p className="dropzone__title">Drop a video here</p>
          <p className="dropzone__desc">or choose a file to analyze.</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={(event) => {
              event.stopPropagation()
              openPicker()
            }}
          >
            <Upload size={15} strokeWidth={2} aria-hidden="true" />
            Choose Video
          </button>
          <p className="dropzone__meta">{VIDEO_SUPPORTED_DETAIL}</p>
        </div>
      )}

      {isBusy && !metadata ? (
        <p className="upload__loading" role="status">
          <LoaderCircle size={13} strokeWidth={2} aria-hidden="true" className="spin-icon" />
          <span>Reading video…</span>
        </p>
      ) : null}

      {validationError ? (
        <p className="alert alert--error" role="alert">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />
          <span>{validationError}</span>
        </p>
      ) : null}
    </div>
  )
}
