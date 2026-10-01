import { Sparkles } from 'lucide-react'
import { Card, CardHeader, Chip, Disclosure, Meter } from './ui'

/**
 * The AI second opinion.
 *
 * The card renders only when the view model says it should: `ai` is `null`
 * whenever the final primary confidence is below the 45% display threshold,
 * unavailable, missing or malformed. Hiding the card outright - rather than
 * showing it empty or with an "uncertain" note - is what keeps a weak opinion
 * from reading as a finding.
 *
 * What it shows is deliberately small: the primary material, its confidence, a
 * confidence level, the top three ranked matches and, behind a collapsed
 * "Why?" control, the model's reasoning.
 */
export default function AiMaterialCard({ ai, className = '' }) {
  if (!ai || ai.available !== true) return null

  const { aggregated, primaryMaterial, confidenceText, level, levelTone, matches, why } = ai

  return (
    <Card className={`result-card ai-card ${className}`.trim()}>
      <CardHeader
        icon={Sparkles}
        title="AI Material Analysis"
        meta={level ?? null}
        tone="default"
      />

      <div className="ai-primary">
        <p className="ai-primary__name">{primaryMaterial ?? '--'}</p>
        {confidenceText ? (
          <p className="ai-primary__confidence is-mono">
            {confidenceText}
            <span> confidence</span>
          </p>
        ) : null}
      </div>

      {aggregated ? (
        <p className="ai-scope">One assessment for the whole video</p>
      ) : null}

      {levelTone ? (
        <div className="ai-levels">
          <Chip tone={levelTone}>Confidence: {level}</Chip>
        </div>
      ) : null}

      {matches.length > 0 ? (
        <div className="subsection">
          <p className="subsection__title">Top matches</p>
          <ol className="alts">
            {matches.map((match) => (
              <li className="alt" key={match.material}>
                <span className="alt__rank is-mono">{match.label}</span>
                <span className="alt__name">{match.material}</span>
                <span className="alt__sim is-mono">{match.confidence ?? '--'}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <Meter value={ai.confidence / 100} label={`AI confidence ${confidenceText}`} tone="cyan" />

      {why ? (
        <Disclosure label="Why?">
          <p className="ai-why">{why}</p>
        </Disclosure>
      ) : null}
    </Card>
  )
}
