import { Images } from 'lucide-react'
import { Card, CardHeader, Chip } from './ui'
import { ImageCanvas } from './ImageCanvas'
import { formatTimestamp } from '../utils/format'

/**
 * The two or three representative analyzed frames.
 *
 * Every sampled frame is analyzed, but only a small spread is shown - the rest are
 * counted in the video summary, so this card carries no explanation of its own:
 * the heading is plain and each tile states its own frame number, timestamp and
 * outcome. The tiles are equal width and fill the row; on a phone they stay on
 * one line and the strip, never the page, scrolls sideways.
 */
export default function AnalyzedFrameGallery({ frames, className = '' }) {
  if (!frames?.length) return null

  return (
    <Card className={`result-card gallery ${className}`.trim()}>
      <CardHeader icon={Images} title="Analyzed Frames" />

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
                {frame.hasMask ? <Chip tone="mask">Mask</Chip> : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}