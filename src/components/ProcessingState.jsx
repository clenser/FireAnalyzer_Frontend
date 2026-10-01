import { useEffect, useState } from 'react'
import { Check, Clock, LoaderCircle } from 'lucide-react'
import { Card, IndeterminateBar, ProgressBar, Stat } from './ui'
import { formatApproxSeconds, formatDuration, formatTimestamp } from '../utils/format'

const STAGES = ['Detection', 'Segmentation', 'Material analysis', 'AI analysis']

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

/** A live, real elapsed-time readout. Never a fabricated total. */
function useElapsed(startedAt) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!startedAt) return undefined
    const timer = setInterval(() => setElapsedMs(now() - startedAt), 200)
    return () => clearInterval(timer)
  }, [startedAt])

  return elapsedMs
}

/**
 * Image analysis: one request covers every stage, so the steps advance on a
 * timer while the indeterminate bar shows that the request is in flight, and the
 * elapsed readout is the real measured time.
 */
export function ImageProcessingState({ startedAt }) {
  const elapsedMs = useElapsed(startedAt)
  const [activeStage, setActiveStage] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStage((stage) => Math.min(STAGES.length - 1, stage + 1))
    }, 2600)
    return () => clearInterval(timer)
  }, [])

  return (
    <Card className="result-card processing" role="status" aria-live="polite">
      <div className="processing__head">
        <LoaderCircle size={17} strokeWidth={1.75} aria-hidden="true" className="spin-icon" />
        <div>
          <p className="processing__title">Analyzing flame…</p>
          <p className="processing__sub">One request covers every step below.</p>
        </div>
        <span className="processing__elapsed is-mono">
          <Clock size={12} strokeWidth={1.75} aria-hidden="true" />
          {formatDuration(elapsedMs) ?? '0.0s'}
        </span>
      </div>

      <IndeterminateBar label="Analysis in progress" />

      <ol className="stages">
        {STAGES.map((stage, index) => {
          const state = index < activeStage ? 'done' : index === activeStage ? 'active' : 'pending'
          return (
            <li className={`stage-chip stage-chip--${state}`} key={stage}>
              <Check size={11} strokeWidth={2.5} aria-hidden="true" />
              {stage}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

/**
 * Video analysis: frame extraction then one request per frame, so progress is
 * real and determinate. The remaining time is an estimate derived from measured
 * request durations, and is labelled as such.
 */
export function VideoProcessingState({ progress, estimatedRemainingMs, startedAt }) {
  const elapsedMs = useElapsed(startedAt ?? progress?.startedAt)
  const completed = progress?.completed ?? 0
  const total = progress?.total ?? 0
  const extracting = progress?.phase === 'extracting'

  return (
    <Card className="result-card processing" role="status" aria-live="polite">
      <div className="processing__head">
        <LoaderCircle size={17} strokeWidth={1.75} aria-hidden="true" className="spin-icon" />
        <div>
          <p className="processing__title">
            {extracting ? 'Preparing frames…' : `Analyzing ${total || ''} sampled frames`}
          </p>
          <p className="processing__sub">Randomly sampled points across the video.</p>
        </div>
        <span className="processing__elapsed is-mono">
          <Clock size={12} strokeWidth={1.75} aria-hidden="true" />
          {formatDuration(elapsedMs) ?? '0.0s'}
        </span>
      </div>

      <ProgressBar value={completed} max={total} label={`${completed} of ${total} frames`} />

      <div className="stat-row stat-row--three">
        <Stat
          label="Progress"
          value={total > 0 ? `${completed} / ${total}` : '--'}
          mono
        />
        <Stat
          label={extracting ? 'Reading frame' : 'Current frame'}
          value={progress?.timestamp !== null && progress?.timestamp !== undefined
            ? formatTimestamp(progress.timestamp)
            : '--:--'}
          mono
        />
        <Stat
          label="Estimated remaining"
          value={formatApproxSeconds(estimatedRemainingMs) ?? '--'}
          mono
        />
      </div>
    </Card>
  )
}
