import { Flame, ShieldAlert, Droplets, Wind, Layers, SprayCan } from 'lucide-react'
import { Card, CardHeader, DataRow, Meter, PanelNote } from './ui'
import { formatPercent } from '../utils/format'

/** Human-readable names for the suppression mechanism categories. */
const MECHANISM_LABEL = {
  cooling: 'Cooling',
  oxygen_displacement: 'Oxygen displacement',
  blanketing: 'Blanketing',
  chemical_chain_break: 'Chemical chain break',
  unspecified: 'Mechanism not recorded',
}

const MECHANISM_ICON = {
  cooling: Droplets,
  oxygen_displacement: Wind,
  blanketing: Layers,
  chemical_chain_break: SprayCan,
}

/**
 * The derived fire class and the agents recorded for it.
 *
 * The class is *not* predicted by the detection model: it is derived from the
 * matched material through a documented mapping, and the agents are the names
 * stored in the project's material dataset. `compound` is null because the
 * dataset records no chemical identity, so nothing is asserted here.
 */
export default function FireClassCard({ fireClass, agents, material, suppression }) {
  const agentList = agents?.length ? agents : (suppression?.methods ?? []).map((name) => ({ name }))

  if (!fireClass && !agentList.length) return null

  return (
    <Card className="result-card fireclass-card">
      <CardHeader
        icon={fireClass ? Flame : ShieldAlert}
        title="Fire Class"
        meta={fireClass ? 'Derived from material' : null}
      />

      {fireClass ? (
        <div className="fireclass">
          <div className="fireclass__head">
            <span className="fireclass__name">{fireClass.name}</span>
            {fireClass.description ? (
              <span className="fireclass__desc">{fireClass.description}</span>
            ) : null}
          </div>

          {fireClass.confidence !== null ? (
            <Meter
              value={fireClass.confidence}
              label={`Material match similarity ${formatPercent(fireClass.confidence)}`}
              tone={fireClass.confidence >= 0.7 ? 'amber' : 'red'}
            />
          ) : null}

          <div className="drow-list">
            <DataRow label="Material" value={fireClass.material ?? material?.name ?? '--'} />
            {fireClass.confidence !== null ? (
              <DataRow label="Match similarity" value={formatPercent(fireClass.confidence)} mono />
            ) : null}
          </div>
        </div>
      ) : null}

      {agentList.length ? (
        <>
          <h4 className="card__subtitle">Suitable agents</h4>
          <ul className="agents">
            {agentList.map((agent, index) => {
              const Icon = MECHANISM_ICON[agent.type] ?? null
              const mechanism = MECHANISM_LABEL[agent.type] ?? agent.type
              return (
                <li className="agent" key={`${agent.name}-${index}`}>
                  <span className="agent__icon" aria-hidden="true">
                    {Icon ? <Icon size={14} strokeWidth={1.75} /> : null}
                  </span>
                  <span className="agent__name">{agent.name}</span>
                  {mechanism ? (
                    <span className="agent__mechanism">{mechanism}</span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      <PanelNote>
        The fire class is derived from the matched material through a documented mapping, not
        predicted by the detection model, and the similarity above is a distance-based score rather
        than a calibrated probability. Agent names are taken verbatim from the material dataset,
        which records no chemical compounds, so no formulas are shown.
      </PanelNote>
    </Card>
  )
}
