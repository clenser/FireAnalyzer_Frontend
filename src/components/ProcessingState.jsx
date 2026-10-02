import { useEffect, useState } from 'react'
import { Check, Clock, LoaderCircle } from 'lucide-react'
import { Card, IndeterminateBar } from './ui'
import { formatDuration } from '../utils/format'
import { VIDEO_STAGES } from '../hooks/useVideoAnalysis'

const IMAGE_STAGES = ['Detection', 'Segmentation', 'Material analysis', 'AI analysis']

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

function StageChips({ stages, activeStage }) {
  return (
    <ol className="stages">
      {stages.map((stage, index) => {
        const state = index < activeStage ? 'done' : index === activeStage ? 'active' : 'pending'
        return (
          <li className={`stage-chip stage-chip--${state}`} key={stage}>
            <Check size={11} strokeWidth={2.5} aria-hidden="true" />
            {stage}
          </li>
        )
      })}
    </ol>
  )
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
      setActiveStage((stage) => Math.min(IMAGE_STAGES.length - 1, stage + 1))
    }, 2600)
    return () => clearInterval(timer)
  }, [])

  return (
    <Card className="result-card processing" role="status" aria-live="polite">
      <div className="processing__head">
        <LoaderCircle size={17} strokeWidth={1.75} aria-hidden="true" className="spin-icon" />
        <p className="processing__title">Analyzing flame…</p>
        <span className="processing__elapsed is-mono">
          <Clock size={12} strokeWidth={1.75} aria-hidden="true" />
          {formatDuration(elapsedMs) ?? '0.0s'}
        </span>
      </div>

      <IndeterminateBar label="Analysis in progress" />
      <StageChips stages={IMAGE_STAGES} activeStage={activeStage} />
    </Card>
  )
}

/**
 * Video analysis: the whole pipeline (frame sampling through the Python fusion
 * vote) runs in a single server request, so progress is a real elapsed-time
 * readout plus an indeterminate bar - never a fabricated percentage. The stage
 * list advances on a timer purely to describe what the backend is doing; it is
 * not a measured progress signal.
 */
export function VideoProcessingState({ startedAt, currentStage }) {
  const elapsedMs = useElapsed(startedAt)
  const activeStage = Math.max(0, VIDEO_STAGES.indexOf(currentStage))

  return (
    <Card className="result-card processing" role="status" aria-live="polite">
      <div className="processing__head">
        <LoaderCircle size={17} strokeWidth={1.75} aria-hidden="true" className="spin-icon" />
        <p className="processing__title">Analyzing video…</p>
        <span className="processing__elapsed is-mono">
          <Clock size={12} strokeWidth={1.75} aria-hidden="true" />
          {formatDuration(elapsedMs) ?? '0.0s'}
        </span>
      </div>

      <IndeterminateBar label={currentStage ?? 'Analysis in progress'} />
      <StageChips stages={VIDEO_STAGES} activeStage={activeStage} />
    </Card>
  )
}
