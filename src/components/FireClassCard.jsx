import { Droplets, Flame, Layers, SprayCan, Wind } from 'lucide-react'
import { Card, CardHeader } from './ui'

/** Icons for the agent categories the dataset records. */
const AGENT_ICON = {
  cooling: Droplets,
  oxygen_displacement: Wind,
  blanketing: Layers,
  chemical_chain_break: SprayCan,
}

function agentIcon(name, type) {
  if (type && AGENT_ICON[type]) return AGENT_ICON[type]
  const key = String(name).toLowerCase()
  if (key.includes('foam')) return Droplets
  if (key.includes('co2') || key.includes('carbon')) return Wind
  if (key.includes('powder') || key.includes('dry chem')) return SprayCan
  if (key.includes('water')) return Droplets
  return null
}

/**
 * The fire class derived from the matched material, plus the agents recorded
 * for it. One short sentence of explanation, and nothing about the mapping or
 * score derivation.
 */
export default function FireClassCard({ fireClass, className = '' }) {
  if (!fireClass) return null

  const { name, description, material, agents, sentence } = fireClass

  return (
    <Card className={`result-card fireclass-card ${className}`.trim()}>
      <CardHeader icon={Flame} title="Fire Class" tone="positive" meta={name ?? null} />

      <div className="fireclass">
        <p className="fireclass__name">{name ?? '--'}</p>
        {description ? <p className="fireclass__desc">{description}</p> : null}
        {material ? (
          <p className="fireclass__material">
            Matched from <span className="fireclass__material-name">{material}</span>
          </p>
        ) : null}
        {sentence ? <p className="fireclass__sentence">{sentence}</p> : null}
      </div>

      {agents.length > 0 ? (
        <div className="subsection">
          <p className="subsection__title">Suitable extinguishing agents</p>
          <ul className="agents">
            {agents.map((agent) => {
              const Icon = agentIcon(agent.name, agent.type)
              return (
                <li className="agent" key={agent.name}>
                  {Icon ? <Icon size={13} strokeWidth={1.75} aria-hidden="true" /> : null}
                  <span className="agent__name">{agent.name}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </Card>
  )
}
