import { Disclosure } from './ui'

/**
 * A compact, collapsed-by-default breakdown of what fed the fusion decision:
 * the colour-matcher's ranking and, when a vision model answered, its ranked
 * candidates. This is the raw evidence, shown for transparency - it is not the
 * fusion engine's internal weighting, which stays out of the UI entirely.
 */
export default function EvidenceDisclosure({ evidence }) {
  if (!evidence) return null
  const { evidenceQuality, ranking, visionProvider, visionCandidates, distribution } = evidence
  if (!ranking?.length && !visionCandidates?.length && !distribution?.length) return null

  return (
    <Disclosure summary="Analysis evidence" className="evidence">
      {evidenceQuality ? <p className="evidence__quality">Flame-region evidence quality: {evidenceQuality}</p> : null}

      {ranking?.length ? (
        <div className="evidence__group">
          <p className="subsection__title">Colour match</p>
          <ol className="alts">
            {ranking.map((entry, index) => (
              <li className="alt" key={entry.material}>
                <span className="alt__rank is-mono">{String(index + 1).padStart(2, '0')}</span>
                <span className="alt__name">{entry.material}</span>
                <span className="alt__sim is-mono">{entry.similarity ?? '--'}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {visionCandidates?.length ? (
        <div className="evidence__group">
          <p className="subsection__title">{visionProvider ? `${visionProvider} vision evidence` : 'Vision evidence'}</p>
          <ol className="alts">
            {visionCandidates.map((entry, index) => (
              <li className="alt" key={entry.material}>
                <span className="alt__rank is-mono">{String(index + 1).padStart(2, '0')}</span>
                <span className="alt__name">{entry.material}</span>
                <span className="alt__sim is-mono">{entry.confidence ?? '--'}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {distribution?.length ? (
        <div className="evidence__group">
          <p className="subsection__title">Material distribution across frames</p>
          <ol className="alts">
            {distribution.map((entry, index) => (
              <li className="alt" key={entry.material}>
                <span className="alt__rank is-mono">{String(index + 1).padStart(2, '0')}</span>
                <span className="alt__name">{entry.material}</span>
                <span className="alt__sim is-mono">
                  {entry.framesText}
                  {entry.share ? ` · ${entry.share}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Disclosure>
  )
}
