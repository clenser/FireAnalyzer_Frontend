import { CircleCheck, CircleAlert, Flame } from 'lucide-react'
import { Card, CardHeader, Meter, Stat } from './ui'

/**
 * The detection verdict, in the plainest terms possible: was a flame found, how
 * confident the model is, and how much of the image it covers. Bounding-box
 * coordinates, mask resolution, segmentation confidence and fallback details
 * stay in the parsed payload and never reach this card.
 */
export default function DetectionCard({ detection, className = '' }) {
  if (!detection) return null

  const { detected, statusText, headline, confidence, flameArea } = detection

  return (
    <Card className={`result-card detection-card ${className}`.trim()} data-detected={detected ? 'true' : 'false'}>
      <CardHeader icon={Flame} title="Flame Detection" tone={detected ? 'positive' : 'neutral'} meta={statusText} />

      <div className="verdict">
        <span className="verdict__icon" aria-hidden="true">
          {detected ? (
            <CircleCheck size={22} strokeWidth={1.75} />
          ) : (
            <CircleAlert size={22} strokeWidth={1.75} />
          )}
        </span>
        <div className="verdict__body">
          <p className="verdict__headline">{headline}</p>
        </div>
      </div>

      <div className="stat-row">
        <Stat label="Confidence" value={confidence} mono />
        {flameArea ? <Stat label="Flame area" value={flameArea} mono /> : null}
      </div>

      {detection.confidenceRatio !== null && detection.confidenceRatio !== undefined ? (
        <Meter
          value={detection.confidenceRatio}
          label={`Flame detection confidence ${confidence}`}
          tone={detected ? 'amber' : 'red'}
        />
      ) : null}
    </Card>
  )
}