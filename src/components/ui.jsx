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

export function Chip({ children, tone = 'neutral', icon: Icon }) {
  return (
    <span className={`chip chip--${tone}`}>
      {Icon ? <Icon size={12} strokeWidth={2} aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

export function PanelNote({ children }) {
  return <p className="panel-note">{children}</p>
}

/**
 * A label/value pair sized for the compact result cards.
 * `tone` conveys status with a word as well as a colour, never colour alone.
 */
export function Stat({ label, value, mono = false, tone = null, hint = null }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={`stat__value${mono ? ' is-mono' : ''}${tone ? ` is-${tone}` : ''}`}>
        {value ?? '--'}
      </span>
      {hint ? <span className="stat__hint">{hint}</span> : null}
    </div>
  )
}

/** Determinate progress bar used by the video processing state. */
export function ProgressBar({ value, max, label }) {
  const safeMax = max > 0 ? max : 1
  const ratio = Math.max(0, Math.min(1, (value ?? 0) / safeMax))
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={value}
      aria-label={label}
    >
      <span className="progress__fill" style={{ width: `${(ratio * 100).toFixed(1)}%` }} />
    </div>
  )
}

/** Indeterminate bar for a single-request analysis. */
export function IndeterminateBar({ label }) {
  return (
    <div className="progress progress--indeterminate" role="progressbar" aria-label={label}>
      <span className="progress__bar" />
    </div>
  )
}

/**
 * A compact on/off switch, used for Force New Analysis. Deliberately small and
 * unobtrusive - a label, the switch itself, and an optional one-line help text
 * shown as a native tooltip so it never crowds the control.
 */
export function Toggle({ checked, onChange, label, help, disabled = false }) {
  return (
    <label className="toggle" data-disabled={disabled ? 'true' : 'false'} title={help}>
      <input
        type="checkbox"
        className="toggle__input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
      <span className="toggle__label">{label}</span>
    </label>
  )
}

/** A compact expandable section (native <details>), used for secondary detail. */
export function Disclosure({ summary, children, className = '' }) {
  return (
    <details className={`disclosure ${className}`.trim()}>
      <summary className="disclosure__summary">{summary}</summary>
      <div className="disclosure__body">{children}</div>
    </details>
  )
}

/** Small colour swatch for a reported RGB value. */
export function Swatch({ css, label }) {
  return (
    <span
      className="swatch"
      style={css ? { background: css } : undefined}
      role={label ? 'img' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      {css ? null : 'n/a'}
    </span>
  )
}
