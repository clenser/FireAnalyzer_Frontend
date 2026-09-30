import { Flame, CircleCheck, CircleAlert, ScanLine } from 'lucide-react'
import { Card, CardHeader, Meter, DataRow } from './ui'
import { formatPercent, formatCount } from '../utils/format'

function ConfidenceMeter({ value, label }) {
  const percent = formatPercent(value)
  if (percent === null) return null
  return (
    <div className="confidence">
      <Meter value={value} label={`${label} ${percent}`} tone="amber" />
    </div>
  )
}

export default function DetectionCard({ detection, segmentation }) {
  if (!detection) return null

  const detected = detection.detected === true
  const bbox = detection.boundingBox

  return (
    <Card className={`result-card detection-card${detected ? ' is-positive' : ' is-negative'}`}>
      <CardHeader
        icon={Flame}
        title="Fire Detection"
        tone={detected ? 'positive' : 'negative'}
        meta={detected ? 'Detected' : 'Not detected'}
      />

      <div className="verdict">
        <div className="verdict__state">
          <span className="verdict__icon" aria-hidden="true">
            {detected ? (
              <CircleCheck size={20} strokeWidth={1.75} />
            ) : (
              <CircleAlert size={20} strokeWidth={1.75} />
            )}
          </span>
          <div>
            <p className="verdict__headline">{detected ? 'Fire detected' : 'No fire detected'}</p>
            <p className="verdict__sub">
              {detection.confidence !== null
                ? `${formatPercent(detection.confidence)} detection confidence`
                : 'Confidence not reported by the model'}
            </p>
          </div>
          <p className="verdict__score is-mono">{formatPercent(detection.confidence) ?? '--'}</p>
        </div>
        <ConfidenceMeter value={detection.confidence} label="Detection confidence" />
      </div>

      <div className="drow-list">
        <DataRow
          label="Detection"
          value={detected ? 'Detected' : 'Not detected'}
          valueTone={detected ? 'positive' : 'negative'}
        />
        <DataRow label="Confidence" value={formatPercent(detection.confidence)} mono />
        <DataRow
          label="Bounding box"
          value={
            bbox
              ? `x1 ${bbox.x1} · y1 ${bbox.y1} · x2 ${bbox.x2} · y2 ${bbox.y2}`
              : 'Not reported'
          }
          mono
        />
      </div>

      {segmentation ? (
        <div className="subsection">
          <p className="subsection__title">
            <ScanLine size={13} strokeWidth={1.75} aria-hidden="true" />
            Segmentation
          </p>
          <div className="drow-list">
            <DataRow
              label="Availability"
              value={
                segmentation.available === null
                  ? '--'
                  : segmentation.available
                    ? 'Available'
                    : 'Unavailable'
              }
              valueTone={segmentation.available ? 'positive' : 'muted'}
            />
            <DataRow
              label="Fallback"
              value={
                segmentation.fallbackUsed === null
                  ? '--'
                  : segmentation.fallbackUsed
                    ? 'Fallback used'
                    : 'Not used'
              }
            />
            <DataRow
              label="Flame pixels"
              value={formatCount(segmentation.flamePixelCount)}
              mono
            />
            <DataRow
              label="Mask area ratio"
              value={formatPercent(segmentation.maskAreaRatio, 2)}
              mono
            />
            <DataRow
              label="Segmentation confidence"
              value={formatPercent(segmentation.confidence)}
              mono
            />
            {segmentation.maskWidth !== null && segmentation.maskHeight !== null ? (
              <DataRow
                label="Mask resolution"
                value={`${segmentation.maskWidth} × ${segmentation.maskHeight}`}
                mono
              />
            ) : null}
            <DataRow
              label="Mask overlay"
              value={segmentation.maskUrl ? 'Shown on image' : 'Not available'}
              valueTone={segmentation.maskUrl ? 'positive' : 'muted'}
            />
          </div>
          {segmentation.bboxFallbackReason ? (
            <p className="panel-note">
              The segmentation model did not return a usable mask, so the detection bounding box was
              rasterised instead: {segmentation.bboxFallbackReason}. The overlay therefore shows a
              rectangle, not the segmented flame region.
            </p>
          ) : (
            <p className="panel-note">
              The overlay draws the segmented flame mask returned by the API. It is the actual
              segmented region and is independent of the detection bounding box above.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  )
}
