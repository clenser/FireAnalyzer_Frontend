import { CheckCircle, Droplets } from 'lucide-react'
import { Card, CardHeader } from './ui'

/**
 * The fallback agent list for a payload that reports suppression methods but no
 * fire class. It keeps the recommendation visible, in the same full-width row the
 * fire-class card would occupy, without duplicating that card.
 */
export default function SuppressionCard({ suppression, className = '' }) {
  if (!suppression?.methods?.length) return null

  return (
    <Card className={`result-card suppression-card ${className}`.trim()}>
      <CardHeader icon={Droplets} title="Suppression Methods" />
      <ul className="agents">
        {suppression.methods.map((method) => (
          <li className="agent" key={method}>
            <Droplets size={13} strokeWidth={1.75} aria-hidden="true" />
            <span className="agent__name">{method}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Measured total, or nothing at all when no reliable duration exists. */
export function DurationNote({ duration }) {
  if (!duration) return null
  return (
    <p className="statusbar__item is-mono">
      <CheckCircle size={13} strokeWidth={2} aria-hidden="true" />
      {duration.label}
    </p>
  )
}