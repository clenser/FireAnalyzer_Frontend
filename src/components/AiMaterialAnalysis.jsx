import { Sparkles } from 'lucide-react'
import { Card, CardHeader, Meter, PanelNote } from './ui'

/** Gemini reports confidence on a 0-100 scale; the meter is 0-1. */
function formatConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return `${value.toFixed(1)}%`
}

function UnavailableState({ error }) {
  return (
    <div className="ai-unavailable">
      <p className="ai-unavailable__title">Unavailable</p>
      {error ? <p className="ai-unavailable__error">{error}</p> : null}
      <p className="ai-unavailable__note">
        The deterministic FlameAnalyzer analysis remains available.
      </p>
    </div>
  )
}

export default function AiMaterialAnalysis({ aiMaterialAnalysis }) {
  if (!aiMaterialAnalysis) return null

  if (!aiMaterialAnalysis.available) {
    return (
      <Card className="result-card ai-material-card">
        <CardHeader icon={Sparkles} title="AI Material Analysis" />
        <UnavailableState error={aiMaterialAnalysis.error} />
      </Card>
    )
  }

  const { primaryMaterial, matches, overallConfidenceLevel, uncertain, reasoningSummary } =
    aiMaterialAnalysis
  const topMatch = matches[0] ?? null
  const topConfidence = topMatch?.confidencePercent ?? null

  return (
    <Card className="result-card ai-material-card">
      <CardHeader icon={Sparkles} title="AI Material Analysis" meta="Powered by Gemini" />

      {uncertain ? (
        <p className="ai-uncertain">
          <Sparkles size={12} strokeWidth={1.75} aria-hidden="true" />
          AI analysis is uncertain
        </p>
      ) : null}

      <div className="ai-primary">
        <p className="ai-primary__name">{primaryMaterial ?? '--'}</p>
        <p className="ai-primary__conf is-mono">
          {topConfidence !== null ? (
            <>
              {formatConfidence(topConfidence)} confidence
              <span> AI confidence score</span>
            </>
          ) : (
            '--'
          )}
        </p>
        {topConfidence !== null ? (
          <div className="confidence">
            <Meter
              value={topConfidence / 100}
              label={`AI confidence ${formatConfidence(topConfidence)}`}
              tone="cyan"
            />
          </div>
        ) : null}
      </div>

      {overallConfidenceLevel ? (
        <p className="ai-level is-mono">{overallConfidenceLevel.toUpperCase()} CONFIDENCE</p>
      ) : null}

      {matches.length > 0 ? (
        <div className="subsection">
          <p className="subsection__title">Top Matches</p>
          <ol className="ai-matches">
            {matches.map((match) => (
              <li className="ai-match" key={`${match.rank}-${match.material}`}>
                <span className="ai-match__rank is-mono">{String(match.rank).padStart(2, '0')}</span>
                <span className="ai-match__name">{match.material}</span>
                <span className="ai-match__conf is-mono">{formatConfidence(match.confidencePercent)}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {reasoningSummary ? (
        <div className="ai-reasoning">
          <p className="ai-reasoning__title">Reasoning:</p>
          <p className="ai-reasoning__text">{reasoningSummary}</p>
        </div>
      ) : null}

      <PanelNote>
        AI confidence scores are heuristic and are not calibrated probabilities.
      </PanelNote>
    </Card>
  )
}
