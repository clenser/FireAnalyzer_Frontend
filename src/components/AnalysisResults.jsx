import { BarChart3, LoaderCircle, TriangleAlert, RefreshCw, CornerDownRight } from 'lucide-react'
import DetectionCard from './DetectionCard'
import FlameCharacteristics from './FlameCharacteristics'
import FlameZones from './FlameZones'
import MaterialCard from './MaterialCard'
import FireClassCard from './FireClassCard'
import SuppressionCard from './SuppressionCard'
import ProcessingMetrics from './ProcessingMetrics'
import TechnicalDetails from './TechnicalDetails'
import { Card } from './ui'

const PIPELINE_STEPS = ['Detection', 'Segmentation', 'Colour analysis', 'Material matching']

function EmptyState() {
  return (
    <div className="results-empty">
      <span className="results-empty__icon" aria-hidden="true">
        <BarChart3 size={22} strokeWidth={1.5} />
      </span>
      <h3 className="results-empty__title">Analysis results</h3>
      <p className="results-empty__desc">Upload a flame image to begin.</p>
    </div>
  )
}

function AnalyzingState() {
  return (
    <div className="results-analyzing" role="status" aria-live="polite">
      <div className="scanner" aria-hidden="true">
        <span className="scanner__ring" />
        <span className="scanner__ring scanner__ring--inner" />
        <span className="scanner__core">
          <LoaderCircle size={20} strokeWidth={1.75} />
        </span>
      </div>

      <h3 className="results-analyzing__title">Analyzing flame…</h3>
      <p className="results-analyzing__desc">
        Running detection • segmentation • material analysis
      </p>

      <div className="indeterminate" aria-hidden="true">
        <span className="indeterminate__bar" />
      </div>

      <ul className="pipeline">
        {PIPELINE_STEPS.map((step) => (
          <li className="pipeline__step" key={step}>
            {step}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ErrorState({ error, onRetry, canRetry }) {
  return (
    <Card className="result-card error-card" role="alert">
      <div className="error-card__head">
        <span className="error-card__icon" aria-hidden="true">
          <TriangleAlert size={18} strokeWidth={1.75} />
        </span>
        <div>
          <h3 className="error-card__title">Analysis failed</h3>
          <p className="error-card__message">{error?.message}</p>
        </div>
      </div>

      {error?.code ? (
        <p className="error-card__code is-mono">
          <CornerDownRight size={12} strokeWidth={1.75} aria-hidden="true" />
          {error.code}
          {error?.status ? ` · HTTP ${error.status}` : ''}
        </p>
      ) : null}

      {canRetry ? (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
          Retry analysis
        </button>
      ) : null}
    </Card>
  )
}

export default function AnalysisResults({ status, data, rawPayload, error, onRetry }) {
  if (status === 'analyzing') return <AnalyzingState />
  if (status === 'error') {
    return <ErrorState error={error} onRetry={onRetry} canRetry={Boolean(onRetry)} />
  }
  if (status !== 'success' || !data) return <EmptyState />

  const hasContent =
    data.detection ||
    data.segmentation ||
    data.color ||
    data.material ||
    data.suppression ||
    data.fireClass ||
    data.agents?.length

  // The agents are shown once, with their mechanism, on the fire-class card. The
  // older suppression card only stands in when that card has nothing to show,
  // so an older payload without `fire_class` still lists its methods.
  const showsAgents = Boolean(data.fireClass) || Boolean(data.agents?.length)

  return (
    <div className="results">
      {hasContent ? (
        <>
          <DetectionCard detection={data.detection} segmentation={data.segmentation} />
          <FlameCharacteristics color={data.color} />
          <FlameZones color={data.color} />
          <MaterialCard material={data.material} />
          <FireClassCard
            fireClass={data.fireClass}
            agents={data.agents}
            material={data.material}
            suppression={data.suppression}
          />
          {showsAgents ? null : <SuppressionCard suppression={data.suppression} />}
        </>
      ) : (
        <p className="results__none">The service returned no analysable fields for this image.</p>
      )}

      <ProcessingMetrics timing={data.timing} />
      <TechnicalDetails payload={rawPayload} />
    </div>
  )
}
