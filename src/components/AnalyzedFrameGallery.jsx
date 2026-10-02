import { Images } from 'lucide-react'
import { Card, CardHeader, Chip } from './ui'
import { ImageCanvas } from './ImageCanvas'
import { formatTimestamp } from '../utils/format'

/**
 * The backend's own representative frames (up to 3, already chosen server-side -
 * never re-picked here). Every sampled frame was analysed; the rest are
 * available in "View all analyzed frames" below. Each tile carries its own
 * material/fire-class result, since the merged mask is per frame, not a single
 * image-wide answer.
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
                <span className="gallery__time is-mono">{formatTimestamp(frame.timestamp)}</span>
              </p>
              <div className="gallery__tags">
                <Chip tone={frame.detected ? 'positive' : 'neutral'}>{frame.statusText}</Chip>
                {frame.detectionCount > 1 ? <Chip tone="mask">{frame.detectionCount} regions</Chip> : null}
              </div>
              <p className="gallery__material">
                {frame.materialUncertain ? (
                  <span className="is-muted">Material uncertain</span>
                ) : frame.materialName ? (
                  <>
                    {frame.materialName}
                    {frame.confidence ? <span className="is-mono"> · {frame.confidence}</span> : null}
                  </>
                ) : (
                  <span className="is-muted">No material result</span>
                )}
              </p>
              {frame.fireClassName ? <p className="gallery__fireclass is-mono">{frame.fireClassName}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
