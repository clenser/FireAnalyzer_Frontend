import { PieChart } from 'lucide-react'
import { Card, CardHeader } from './ui'

/**
 * How the per-frame decisions voted, straight from the backend's own
 * `candidate_materials` distribution - never recomputed here. This is what
 * backs the single consolidated material above: a frame-by-frame breakdown
 * rather than a black-box average.
 */
export default function MaterialDistributionCard({ distribution, className = '' }) {
  if (!distribution?.length) return null

  return (
    <Card className={`result-card distribution-card ${className}`.trim()}>
      <CardHeader icon={PieChart} title="Material Distribution" />
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
    </Card>
  )
}
