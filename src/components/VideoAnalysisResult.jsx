import { useMemo } from 'react'
import { buildVideoResultModel } from '../services/viewModel'
import { Card, Chip } from './ui'
import AnalyzedFrameGallery from './AnalyzedFrameGallery'
import AllFramesDisclosure from './AllFramesDisclosure'
import VideoSummaryCard from './VideoSummaryCard'
import DetectionCard from './DetectionCard'
import MaterialCard from './MaterialCard'
import MaterialDistributionCard from './MaterialDistributionCard'
import FireClassCard from './FireClassCard'
import SuppressionCard, { DurationNote } from './SuppressionCard'

/**
 * The video dashboard, in the one fixed result order:
 *
 *   representative frames -> view all analyzed frames -> video summary ->
 *   flame detection -> material identification -> material distribution ->
 *   fire class -> processing complete
 *
 * The consolidated material, confidence and fire class are the backend's own
 * Python majority/consistency vote over the per-frame decisions - never an
 * AI-generated video conclusion, and never recomputed here. A card the data
 * cannot justify - the material card when the result is uncertain, the
 * distribution card with nothing to show - is omitted rather than padded out.
 */
export default function VideoAnalysisResult({ data, durationMs }) {
  const model = useMemo(() => buildVideoResultModel({ data, measuredDurationMs: durationMs }), [data, durationMs])

  if (!model?.hasContent) {
    return <p className="results__none">No analysis results were returned for this video.</p>
  }

  return (
    <div className="result-grid result-grid--video">
      <AnalyzedFrameGallery frames={model.gallery} className="area-gallery" />

      {model.allFrames?.length ? (
        <Card className="result-card all-frames-card area-gallery">
          <AllFramesDisclosure frames={model.allFrames} />
        </Card>
      ) : null}

      <VideoSummaryCard
        summary={model.summary}
        material={model.material}
        fireClass={model.fireClass}
        className="area-summary"
      />
      <DetectionCard detection={model.detection} className="area-detection is-solo" />
      <MaterialCard material={model.material} className="area-material is-solo" />
      <MaterialDistributionCard distribution={model.distribution} className="area-class" />
      <FireClassCard fireClass={model.fireClass} className="area-class" />

      {!model.fireClass && model.suppression ? (
        <SuppressionCard suppression={model.suppression} className="area-class" />
      ) : null}

      {model.duration || model.cached ? (
        <Card className="statusbar area-status" aria-label="Analysis status">
          <DurationNote duration={model.duration} />
          {model.cached ? <Chip tone="neutral">Cached result</Chip> : null}
        </Card>
      ) : null}
    </div>
  )
}
