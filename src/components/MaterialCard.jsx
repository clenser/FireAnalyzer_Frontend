import { Boxes, Layers } from 'lucide-react'
import { Card, CardHeader, Meter } from './ui'

/**
 * The material the flame colour matched, with the three strongest alternatives.
 *
 * For an image the match comes from the same `POST /analyze` call; for a video it
 * comes from the deterministic `POST /material-identification` endpoint, which
 * returns the same structure. Either way the backend decides - the client's only
 * job is to show its answer.
 *
 * When that endpoint could not answer, the caller passes `unavailable` and this
 * renders a single compact line. No material is invented to fill the card.
 */
export default function MaterialCard({ material, unavailable = false, className = '' }) {
  const title = material?.title ?? 'Material Identification'

  if (!material) {
    if (!unavailable) return null

    return (
      <Card className={`result-card material-card ${className}`.trim()}>
        <CardHeader icon={Boxes} title={title} tone="neutral" />
        <p className="ai-unavailable">Material identification unavailable</p>
      </Card>
    )
  }

  const { name, similarity, similarityRatio, alternatives, hasAlternatives } = material

  return (
    <Card className={`result-card material-card ${className}`.trim()}>
      <CardHeader icon={Boxes} title={title} />

      <div className="material">
        <p className="material__name">{name}</p>
        {similarity ? (
          <p className="material__similarity is-mono">
            {similarity}
            <span className="material__similarity-label"> match</span>
          </p>
        ) : null}
        {similarityRatio !== null && similarityRatio !== undefined ? (
          <Meter
            value={similarityRatio}
            label={`Material match similarity ${similarity}`}
            tone="cyan"
          />
        ) : null}
      </div>

      {hasAlternatives ? (
        <div className="subsection">
          <p className="subsection__title">
            <Layers size={12} strokeWidth={1.75} aria-hidden="true" />
            Alternative matches
          </p>
          <ol className="alts">
            {alternatives.map((alt) => (
              <li className="alt" key={`${alt.name}-${alt.rank}`}>
                <span className="alt__rank is-mono">{alt.label}</span>
                <span className="alt__name">{alt.name}</span>
                <span className="alt__sim is-mono">{alt.similarity ?? '--'}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Card>
  )
}
