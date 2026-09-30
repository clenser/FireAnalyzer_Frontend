import { Droplets, Wind } from 'lucide-react'
import { Card, CardHeader, PanelNote } from './ui'

const METHOD_ICON = {
  water: Droplets,
  co2: Wind,
  foam: Droplets,
}

function iconFor(method) {
  const key = method.toLowerCase()
  for (const [token, Icon] of Object.entries(METHOD_ICON)) {
    if (key.includes(token)) return Icon
  }
  return null
}

export default function SuppressionCard({ suppression }) {
  if (!suppression) return null
  const { methods, source, material, databaseNotes } = suppression

  return (
    <Card className="result-card">
      <CardHeader
        icon={Droplets}
        title="Recommended Suppression"
        meta={methods.length + (methods.length === 1 ? ' method' : ' methods')}
      />

      <ul className="methods">
        {methods.map((method, index) => {
          const Icon = iconFor(method)
          return (
            <li className="method" key={`${method}-${index}`}>
              {Icon ? <Icon size={14} strokeWidth={1.75} aria-hidden="true" /> : null}
              <span className="method__name">{method}</span>
            </li>
          )
        })}
      </ul>

      {material || source ? (
        <p className="method-meta">
          {material ? <span className="notes__key">Material: </span> : null}
          {material}
          {material && source ? ' • ' : null}
          {source ? <span className="notes__key">Source: </span> : null}
          {source}
        </p>
      ) : null}

      {databaseNotes ? <PanelNote>{databaseNotes}</PanelNote> : null}
    </Card>
  )
}
