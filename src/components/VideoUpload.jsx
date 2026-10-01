import { useRef, useState } from 'react'
import { FileVideo, LoaderCircle, TriangleAlert, Upload, X } from 'lucide-react'
import { ACCEPT_VIDEO_ATTRIBUTE, VIDEO_SUPPORTED_DETAIL } from '../config'
import { formatApproxSeconds, formatBytes, formatDurationRange, formatTimestamp } from '../utils/format'
import { describeEstimateBasis } from '../utils/estimate'
import VideoFrameSelector from './VideoFrameSelector'

/**
 * Video source selection: dropzone, metadata readout, frame-count choice and a
 * measured time estimate. The panel keeps a fixed maximum height and scrolls
 * internally, so a long clip name or a large frame count cannot stretch it.
 */
export default function VideoUpload({
  file,
  metadata,
  frameCount,
  estimate,
  onSelect,
  onClear,
  onFrameCountChange,
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

          <VideoFrameSelector
            value={frameCount}
            onChange={onFrameCountChange}
            disabled={isBusy}
          />

          {estimate ? (
            <div className="estimate">
              <span className="estimate__label">Estimated processing time</span>
              <span className="estimate__value is-mono">
                {formatDurationRange(estimate.totalMs) ?? '--'}
              </span>
              <span className="estimate__basis">
                {describeEstimateBasis(estimate.measured)} · about{' '}
                {formatApproxSeconds(estimate.perFrameMs)} per frame
              </span>
            </div>
          ) : null}

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
          <p className="dropzone__desc">randomly sampled frames are analyzed, not the whole clip.</p>
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
