import { useState } from 'react'
import { ChevronDown, FileJson } from 'lucide-react'

export default function TechnicalDetails({ payload }) {
  const [open, setOpen] = useState(false)

  if (!payload) return null

  const serialised = JSON.stringify(payload, null, 2)
  const lineCount = serialised.split('\n').length

  return (
    <section className="technical">
      <button
        type="button"
        className="technical__trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="technical-body"
      >
        <span className="technical__trigger-main">
          <FileJson size={14} strokeWidth={1.75} aria-hidden="true" />
          <span className="technical__title">Technical Details</span>
          <span className="technical__count is-mono">{lineCount} lines</span>
        </span>
        <ChevronDown
          size={15}
          strokeWidth={1.75}
          aria-hidden="true"
          className={`technical__chevron${open ? ' is-open' : ''}`}
        />
      </button>

      {open ? (
        <div className="technical__body" id="technical-body">
          <pre className="json" tabIndex={0}>
            <code>{serialised}</code>
          </pre>
        </div>
      ) : null}
    </section>
  )
}
