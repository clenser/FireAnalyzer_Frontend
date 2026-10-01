import { RefreshCw, TriangleAlert } from 'lucide-react'
import { describeApiError } from '../utils/errors'
import { Card } from './ui'

/**
 * Failure states in plain language. The backend error code stays available for
 * support, but it is never the headline: the message goes through
 * `describeApiError`, so a raw technical string can never reach this card.
 */
export default function ErrorNotice({ error, onRetry }) {
  if (!error) return null

  const message = describeApiError(error)

  return (
    <Card className="result-card error-card" role="alert">
      <div className="error-card__head">
        <span className="error-card__icon" aria-hidden="true">
          <TriangleAlert size={18} strokeWidth={1.75} />
        </span>
        <div className="error-card__body">
          <p className="error-card__title">Analysis could not be completed</p>
          <p className="error-card__message">{message}</p>
          {error.notice ? <p className="error-card__message">{error.notice}</p> : null}
        </div>
      </div>

      {onRetry ? (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
          Try again
        </button>
      ) : null}
    </Card>
  )
}
