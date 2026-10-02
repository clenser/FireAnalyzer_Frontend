import { Boxes, Layers } from 'lucide-react'
import { Card, CardHeader, Meter } from './ui'
import EvidenceDisclosure from './EvidenceDisclosure'

/**
 * The material the backend's Python fusion decided, with its strongest
 * alternatives (image only - a video shows its own vote distribution in a
 * separate card instead).
 *
 * `material.uncertain` is the backend's own call, not a guess the frontend
 * makes: when the evidence could not separate the leading candidates, or
 * confidence was too low, `final_material` is `null` and the card states
 * "Material uncertain" with the backend's own reasons - no material is ever
 * invented to fill the card.
 *
 * `unavailable` covers the separate, stricter case where the endpoint that
 * would have answered could not be reached at all.
 */
export default function MaterialCard({ material, unavailable = false, evidence = null, className = '' }) {
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

  if (material.uncertain) {
    return (
      <Card className={`result-card material-card ${className}`.trim()}>
        <CardHeader icon={Boxes} title={title} tone="neutral" meta={material.confidenceLevel} />
        <p className="material-uncertain__headline">Material uncertain</p>
        {material.reasons?.length ? (
          <ul className="material-uncertain__reasons">
            {material.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className="ai-unavailable">The available evidence could not reliably identify a material.</p>
        )}
        {evidence ? <EvidenceDisclosure evidence={evidence} /> : null}
      </Card>
    )
  }

  const { name, similarity, similarityRatio, alternatives, hasAlternatives } = material

  return (
    <Card className={`result-card material-card ${className}`.trim()}>
      <CardHeader icon={Boxes} title={title} meta={material.confidenceLevel} />

      <div className="split">
        <div className="split__lead">
          <div className="material">
            <p className="material__name">{name}</p>
            {similarity ? (
              <p className="material__similarity is-mono">
                {similarity}
                <span className="material__similarity-label"> confidence</span>
              </p>
            ) : null}
            {similarityRatio !== null && similarityRatio !== undefined ? (
              <Meter value={similarityRatio} label={`Material confidence ${similarity}`} tone="cyan" />
            ) : null}
          </div>
        </div>

        {hasAlternatives ? (
          <div className="split__aside">
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
      </div>

      {evidence ? <EvidenceDisclosure evidence={evidence} /> : null}
    </Card>
  )
}
