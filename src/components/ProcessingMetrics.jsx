import { Gauge } from 'lucide-react'
import { formatMs } from '../utils/format'

const STAGES = [
  { key: 'detectionMs', label: 'Detection' },
  { key: 'segmentationMs', label: 'Segmentation' },
  { key: 'colorMs', label: 'Color analysis' },
  { key: 'materialMs', label: 'Material matching' },
]

export default function ProcessingMetrics({ timing }) {
  if (!timing) return null

  const stages = STAGES.map((stage) => ({ ...stage, value: timing[stage.key] })).filter(
    (stage) => stage.value !== null,
  )

  const hasTotal = timing.totalMs !== null
  if (!hasTotal && stages.length === 0) return null

  const maxValue = Math.max(timing.totalMs ?? 0, ...stages.map((s) => s.value), 0)

  return (
    <section className="metrics" aria-label="Processing metrics">
      <p className="metrics__title">
        <Gauge size={12} strokeWidth={1.75} aria-hidden="true" />
        Processing
      </p>

      {hasTotal ? (
        <div className="metrics__total">
          <span className="metrics__total-label">Total</span>
          <span className="metrics__total-value is-mono">{formatMs(timing.totalMs)}</span>
        </div>
      ) : null}

      {stages.length > 0 ? (
        <div className="metrics__stages">
          {stages.map((stage) => (
            <div className="stage" key={stage.key}>
              <span className="stage__label">{stage.label}</span>
              <span className="stage__bar" aria-hidden="true">
                <span
                  className="stage__fill"
                  style={{ width: `${maxValue > 0 ? (stage.value / maxValue) * 100 : 0}%` }}
                />
              </span>
              <span className="stage__value is-mono">{formatMs(stage.value)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
