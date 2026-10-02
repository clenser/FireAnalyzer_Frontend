import { Film } from 'lucide-react'
import { Card, CardHeader, Stat } from './ui'

/**
 * The video's at-a-glance outcome: how many frames were sampled and how many
 * showed a flame. Nothing else - the material and fire-class verdicts have
 * their own dedicated cards below, so they are not repeated here.
 */
export default function VideoSummaryCard({ summary, className = '' }) {
  if (!summary) return null

  const { framesSampled, flameFrameText, anyFlame } = summary

  return (
    <Card className={`result-card video-summary ${className}`.trim()}>
      <CardHeader
        icon={Film}
        title="Video Summary"
        tone={anyFlame ? 'positive' : 'neutral'}
        meta={anyFlame ? 'Flame detected' : 'No flame detected'}
      />

      <div className="video-summary__stats">
        <Stat label="Frames sampled" value={String(framesSampled)} />
        <Stat label="Flame detected in" value={flameFrameText} />
      </div>
    </Card>
  )
}
