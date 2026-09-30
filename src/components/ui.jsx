export function Card({ as: Tag = 'section', className = '', children, ...rest }) {
  return (
    <Tag className={`card ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  )
}

export function CardHeader({ icon: Icon, title, meta, tone = 'default' }) {
  return (
    <header className="card__header">
      <div className="card__header-main">
        {Icon ? <Icon size={15} strokeWidth={1.75} aria-hidden="true" /> : null}
        <h3 className="card__title">{title}</h3>
      </div>
      {meta ? <span className={`card__meta card__meta--${tone}`}>{meta}</span> : null}
    </header>
  )
}

export function Meter({ value, label, tone = 'amber' }) {
  const clamped = Math.max(0, Math.min(1, value ?? 0))
  const percent = `${(clamped * 100).toFixed(1)}%`
  return (
    <div
      className="meter"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Number((clamped * 100).toFixed(1))}
      aria-label={label}
    >
      <span className={`meter__fill meter__fill--${tone}`} style={{ width: percent }} />
    </div>
  )
}

export function DataRow({ label, value, mono = false, valueTone }) {
  return (
    <div className="drow">
      <span className="drow__label">{label}</span>
      <span className={`drow__value${mono ? ' is-mono' : ''}${valueTone ? ` is-${valueTone}` : ''}`}>
        {value ?? '--'}
      </span>
    </div>
  )
}

export function Chip({ children, tone = 'neutral' }) {
  return <span className={`chip chip--${tone}`}>{children}</span>
}

export function PanelNote({ children }) {
  return <p className="panel-note">{children}</p>
}
