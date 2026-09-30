import { Boxes, Layers, Info } from 'lucide-react'
import { Card, Meter, PanelNote } from './ui'
import { formatPercent } from '../utils/format'

export default function MaterialCard({ material }) {
  if (!material) return null

  const { name, similarity, alternatives, databaseNotes, scoreBasis } = material

  return (
    <Card className="result-card material-card">
      <header className="card__header">
        <div className="card__header-main">
          <Boxes size={15} strokeWidth={1.75} aria-hidden="true" />
          <h3 className="card__title">Material Identification</h3>
        </div>
      </header>

      <div className="material-primary">
        <p className="material-primary__name">{name}</p>
        <p className="material-primary__sim is-mono">
          {similarity !== null ? formatPercent(similarity) : '--'}
          {similarity !== null ? <span> similarity</span> : null}
        </p>
        {similarity !== null ? (
          <div className="confidence">
            <Meter value={similarity} label={`Material similarity ${formatPercent(similarity)}`} tone="cyan" />
          </div>
        ) : null}
      </div>

      {alternatives.length > 0 ? (
        <div className="subsection">
          <p className="subsection__title">
            <Layers size={13} strokeWidth={1.75} aria-hidden="true" />
            Alternative Matches
          </p>
          <ol className="alts">
            {alternatives.map((alt, index) => (
              <li className="alt" key={`${alt.name}-${index}`}>
                <span className="alt__rank is-mono">{String(index + 1).padStart(2, '0')}</span>
                <span className="alt__name">{alt.name}</span>
                <span className="alt__sim is-mono">{formatPercent(alt.similarity) ?? '--'}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {databaseNotes || scoreBasis ? (
        <div className="notes">
          {databaseNotes ? (
            <p className="notes__row">
              <Info size={12} strokeWidth={1.75} aria-hidden="true" />
              <span>{databaseNotes}</span>
            </p>
          ) : null}
          {scoreBasis ? (
            <p className="notes__row">
              <Info size={12} strokeWidth={1.75} aria-hidden="true" />
              <span>
                <span className="notes__key">Score basis: </span>
                {scoreBasis}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      <PanelNote>Matches are returned by the backend model and are shown without modification.</PanelNote>
    </Card>
  )
}
