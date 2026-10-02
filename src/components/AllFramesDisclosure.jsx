import { Disclosure } from './ui'
import { ImageCanvas } from './ImageCanvas'
import { formatTimestamp } from '../utils/format'

/**
 * Every analysed frame, collapsed by default. The representative frames above
 * already carry the backend's selection for an at-a-glance view; this exposes
 * the complete list - including frames that failed or found no flame - with
 * each frame's own result, never a textual summary in its place.
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
                {!frame.success ? (
                  <span className="is-muted">{frame.errorMessage ?? 'Not analyzed'}</span>
                ) : frame.materialUncertain ? (
                  <span className="is-muted">Material uncertain</span>
                ) : (
                  <>
                    {frame.materialName ?? 'No material result'}
                    {frame.confidence ? <span className="is-mono"> · {frame.confidence}</span> : null}
                  </>
                )}
              </p>
              <p className="frame-row__meta is-mono">
                {frame.statusText}
                {frame.detectionCount > 1 ? ` · ${frame.detectionCount} regions` : ''}
                {frame.fireClassName ? ` · ${frame.fireClassName}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Disclosure>
  )
}
