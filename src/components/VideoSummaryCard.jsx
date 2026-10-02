import { Film } from 'lucide-react'
import { Card, CardHeader, Stat } from './ui'

/**
 * The video's overall outcome: how many frames were sampled, how many showed a
 * flame, and the backend's own deterministic material/fire-class/confidence -
 * the Python majority vote, never an AI-generated conclusion.
 */
export default function VideoSummaryCard({ summary, material, fireClass, className = '' }) {
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
        <Stat label="Frames with flame" value={flameFrameText} />
        <Stat
          label="Final material"
          value={material && !material.uncertain ? material.name : 'Uncertain'}
        />
        <Stat label="Fire class" value={fireClass?.name ?? '--'} />
      </div>
    </Card>
  )
}
