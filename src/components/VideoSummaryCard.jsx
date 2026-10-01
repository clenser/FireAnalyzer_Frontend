import { CircleAlert, Film } from 'lucide-react'
import { Card, CardHeader, Stat } from './ui'

/**
 * The video's overall outcome, as three counts side by side: how many frames were
 * analyzed, how many showed a flame, and how many could not be read. Nothing
 * else - the numbers are the summary, and every card below explains itself.
 */
export default function VideoSummaryCard({ summary, className = '' }) {
  if (!summary) return null

  const { analyzedFrames, failedFrames, flameFrameText, anyFlame, reliable } = summary

  return (
    <Card className={`result-card video-summary ${className}`.trim()}>
      <CardHeader
        icon={Film}
        title="Video Summary"
        tone={anyFlame ? 'positive' : 'neutral'}
        meta={anyFlame ? 'Flame detected' : 'No flame detected'}
      />

      <div className="video-summary__stats">
        <Stat label="Frames analyzed" value={String(analyzedFrames)} />
        <Stat label="Frames with flame" value={flameFrameText} />
        <Stat label="Frames failed" value={String(failedFrames)} tone={failedFrames > 0 ? 'warn' : null} />
      </div>

      {reliable ? null : (
        <p className="video-summary__warning" role="alert">
          <CircleAlert size={13} strokeWidth={1.75} aria-hidden="true" />
          <span>Not enough valid frames to produce a reliable result.</span>
        </p>
      )}
    </Card>
  )
}