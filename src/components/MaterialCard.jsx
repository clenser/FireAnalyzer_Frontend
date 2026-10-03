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
 * confidence was too low, `final_material` is `null` - no material is ever
 * invented to fill the card, whatever the variant.
 *
 * `material.variant` decides how an uncertain card reads. An image states the
 * uncertainty with the backend's own reasons. A video must not: those reasons
 * are per-frame diagnostics ("every analysed frame was individually
 * uncertain"), which say nothing useful about the video and read as a bad
 * result. The video instead leads with the strongest evidence actually
 * available - its top colour match and top AI vision match - and keeps every
 * remaining candidate in the same collapsed evidence disclosure below.
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

  if (material.uncertain && material.variant === 'video') {
    const topMatches = [material.topMatches?.colour, material.topMatches?.vision].filter(Boolean)

    return (
      <Card className={`result-card material-card ${className}`.trim()}>
        <CardHeader icon={Boxes} title={title} tone="neutral" />

        {topMatches.length ? (
          topMatches.map((match, index) => (
            <div className={`subsection${index === 0 ? ' subsection--first' : ''}`} key={match.heading}>
              <p className="subsection__title">{match.heading}</p>
              <ol className="alts">
                <li className="alt">
                  <span className="alt__rank is-mono">01</span>
                  <span className="alt__name">{match.name}</span>
                  <span className="alt__sim is-mono">{match.confidence ?? '--'}</span>
                </li>
              </ol>
            </div>
          ))
        ) : (
          <p className="ai-unavailable">No individual evidence source produced a usable top match.</p>
        )}

        {evidence ? <EvidenceDisclosure evidence={evidence} /> : null}
      </Card>
    )
  }

  if (material.uncertain) {
    const { colour, vision } = material.topMatches ?? {}

    return (
      <Card className={`result-card material-card ${className}`.trim()}>
        <CardHeader icon={Boxes} title={title} tone="neutral" />

        {material.hasTopMatches ? (
          <div className="subsection subsection--first">
            <p className="subsection__title">Top Matches</p>
            <ul className="top-matches">
              {colour ? (
                <li className="top-match">
                  <span className="top-match__tag">{colour.label}</span>
                  <span className="top-match__name">{colour.name}</span>
                  <span className="top-match__value is-mono">{colour.confidence ?? '--'}</span>
                </li>
              ) : null}
              {vision ? (
                <li className="top-match">
                  <span className="top-match__tag">{vision.label}</span>
                  <span className="top-match__name">{vision.name}</span>
                  <span className="top-match__value is-mono">{vision.confidence ?? '--'}</span>
                </li>
              ) : null}
            </ul>
          </div>
        ) : (
          <p className="ai-unavailable">No individual evidence source produced a usable top match.</p>
        )}

        <div className="subsection">
          <p className="subsection__title">Confidence / evidence explanation</p>
          {material.reasons?.length ? (
            <ul className="material-uncertain__reasons">
              {material.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="ai-unavailable">The available evidence could not reliably identify a material.</p>
          )}
        </div>

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
