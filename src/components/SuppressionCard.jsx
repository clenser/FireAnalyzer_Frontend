import { Clock, Droplets } from 'lucide-react'

/**
 * The fallback agent list for a payload that reports suppression methods but no
 * fire class. It keeps the recommendation visible without duplicating the
 * fire-class card.
 */
export default function SuppressionCard({ suppression, className = '' }) {
  if (!suppression?.methods?.length) return null

  return (
    <section className={`result-card suppression-card ${className}`.trim()}>
      <div className="gallery__head">
        <h3 className="card__title">
          <Droplets size={14} strokeWidth={1.75} aria-hidden="true" />
          Suppression Methods
        </h3>
      </div>
      <ul className="agents">
        {suppression.methods.map((method) => (
          <li className="agent" key={method}>
            <Droplets size={13} strokeWidth={1.75} aria-hidden="true" />
            <span className="agent__name">{method}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Measured total, or nothing at all when no reliable duration exists. */
export function DurationNote({ duration }) {
  if (!duration) return null
  return (
    <p className="statusbar__item is-mono">
      <Clock size={12} strokeWidth={1.75} aria-hidden="true" />
      {duration.label}
    </p>
  )
}
