import { Chip } from './ui'
import { ImageCanvas } from './ImageCanvas'
import { formatTimestamp } from '../utils/format'

/**
 * Two or three representative analyzed frames.
 *
 * Every sampled frame is analyzed, but only a small spread is shown - the rest are
 * counted in the video summary. The heading is plain: the individual frames carry
 * their own timestamps, so no "sampled frames" explanation is repeated here. The
 * row scrolls horizontally on narrow screens by design; the page itself never
 * does.
 */
export default function AnalyzedFrameGallery({ frames, className = '' }) {
  if (!frames?.length) return null

  return (
    <section className={`result-card gallery ${className}`.trim()}>
      <div className="gallery__head">
        <h3 className="card__title">Analyzed Frames</h3>
      </div>

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
    </section>
  )
}
