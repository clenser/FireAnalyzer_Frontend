import { Flame, Cpu } from 'lucide-react'

const STATE_LABEL = {
  checking: 'Checking API',
  online: 'API Online',
  offline: 'API Offline',
}

function StatusDot({ state }) {
  return <span className={`status-dot status-dot--${state}`} aria-hidden="true" />
}

export default function Header({ health }) {
  const state = health?.state ?? 'checking'
  const label = STATE_LABEL[state] ?? STATE_LABEL.checking

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <Flame size={19} strokeWidth={1.75} />
          </span>
          <span className="brand__text">
            <span className="brand__name">FlameAnalyzer</span>
            <span className="brand__tag">AI Fire Analysis</span>
          </span>
        </div>

        <div className="api-status">
          <StatusDot state={state} />
          <span className="api-status__label">{label}</span>
          {health?.device ? (
            <span className="api-status__meta">
              <Cpu size={12} strokeWidth={1.75} aria-hidden="true" />
              <span className="is-mono">{health.device.toUpperCase()}</span>
            </span>
          ) : null}
        </div>
      </div>
    </header>
  )
}
