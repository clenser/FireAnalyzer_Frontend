import { Disclosure } from './ui'
import { ImageCanvas } from './ImageCanvas'
import { formatTimestamp } from '../utils/format'

/**
 * Every analysed frame, collapsed by default. The representative frames above
 * already carry the backend's selection for an at-a-glance view; this exposes
 * the complete list - including frames that found no flame - in the same
 * compact shape: frame number, timestamp, detection status, fire class.
 * Material evidence stays in the video-level Material Identification card.
 */
export default function AllFramesDisclosure({ frames }) {
  if (!frames?.length) return null

  return (
    <Disclosure summary={`View all analyzed frames (${frames.length})`} className="all-frames">
      <ul className="frame-rows">
        {frames.map((frame) => (
          <li className="frame-row" key={frame.key}>
            <ImageCanvas
              className="frame-row__canvas"
              src={frame.dataUrl}
              maskUrl={frame.maskUrl}
              aspectRatio="4 / 3"
              alt={`${frame.label} at ${formatTimestamp(frame.timestamp)}`}
            />
            <div className="frame-row__body">
              <p className="frame-row__label">
                {frame.label}
                <span className="is-mono"> · {formatTimestamp(frame.timestamp)}</span>
              </p>
              <p className="frame-row__status">
                {frame.statusText}
                {frame.fireClassName ? <span className="is-mono"> · {frame.fireClassName}</span> : null}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Disclosure>
  )
}
