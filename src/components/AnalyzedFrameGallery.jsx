import { Images } from 'lucide-react'
import { Card, CardHeader } from './ui'
import { ImageCanvas } from './ImageCanvas'
import { formatTimestamp } from '../utils/format'

/**
 * The backend's own representative frames (up to 3, already chosen server-side -
 * never re-picked here). Every sampled frame was analysed; the rest are
 * available in "View all analyzed frames" below. Each tile stays compact: frame
 * number, timestamp, detection status and the detected fire class. Material
 * evidence belongs to the video-level Material Identification card, not to a
 * per-frame tile.
 */
export default function AnalyzedFrameGallery({ frames, className = '' }) {
  if (!frames?.length) return null

  return (
    <Card className={`result-card gallery ${className}`.trim()}>
      <CardHeader icon={Images} title="Representative Frames" />

      <ul className="gallery__track">
        {frames.map((frame) => (
          <li className="gallery__item" key={frame.key}>
            <ImageCanvas
              className="gallery__canvas"
              src={frame.dataUrl}
              maskUrl={frame.maskUrl}
              aspectRatio="16 / 10"
              alt={`${frame.label} at ${formatTimestamp(frame.timestamp)}`}
            />
            <div className="gallery__meta">
              <p className="gallery__label">
                {frame.label}
                <span className="gallery__time is-mono"> · {formatTimestamp(frame.timestamp)}</span>
              </p>
              <p className="gallery__status">
                {frame.statusText}
                {frame.fireClassName ? <span className="is-mono"> · {frame.fireClassName}</span> : null}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
