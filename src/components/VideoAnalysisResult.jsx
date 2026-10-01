import { useMemo } from 'react'
import { buildVideoResultModel } from '../services/viewModel'
import { REPRESENTATIVE_FRAME_COUNT } from '../config'
import { Card } from './ui'
import AnalyzedFrameGallery from './AnalyzedFrameGallery'
import VideoSummaryCard from './VideoSummaryCard'
import DetectionCard from './DetectionCard'
import FlameColorCard from './FlameColorCard'
import MaterialCard from './MaterialCard'
import AiMaterialCard from './AiMaterialCard'
import FireClassCard from './FireClassCard'
import SuppressionCard, { DurationNote } from './SuppressionCard'

/**
 * The video dashboard, in result order:
 *
 *   analyzed frames -> video summary -> flame detection + average flame colour
 *   -> material identification -> AI material analysis (only when confident)
 *   -> fire class -> processing complete
 *
 * Grid placement is declared in CSS per breakpoint, so the DOM keeps this order
 * on every screen while desktop can pair cards. Every card is rendered at its
 * natural height, and a card whose data is absent - the AI card below the
 * confidence threshold, the material card when the deterministic endpoint could
 * not answer - is omitted rather than padded out.
 */
export default function VideoAnalysisResult({ result, durationMs }) {
  const model = useMemo(
    () =>
      buildVideoResultModel({
        frames: result?.frames,
        aggregation: result?.aggregation,
        materialIdentification: result?.materialIdentification,
        materialIdentificationFailed: result?.materialIdentificationFailed,
        videoAi: result?.videoAi,
        measuredDurationMs: durationMs,
        selectedFrameCount: result?.selectedFrameCount,
        representativeCount: REPRESENTATIVE_FRAME_COUNT,
      }),
    [durationMs, result],
  )

  if (!model?.hasContent) {
    return <p className="results__none">No analysis results were returned for this video.</p>
  }

  return (
    <div className="result-grid result-grid--video">
      <AnalyzedFrameGallery frames={model.gallery} className="area-gallery" />
      <VideoSummaryCard summary={model.summary} className="area-summary" />
      <DetectionCard detection={model.detection} className="area-detection" />
      <FlameColorCard color={model.flameColor} className="area-color" />
      <MaterialCard
        material={model.material}
        unavailable={model.summary.materialUnavailable}
        className="area-material"
      />
      <AiMaterialCard ai={model.ai} className="area-ai" />
      <FireClassCard fireClass={model.fireClass} className="area-class" />

      {!model.fireClass && model.suppression ? (
        <SuppressionCard suppression={model.suppression} className="area-class" />
      ) : null}

      {model.duration ? (
        <Card className="result-card statusbar area-status" aria-label="Analysis status">
          <DurationNote duration={model.duration} />
        </Card>
      ) : null}
    </div>
  )
}
