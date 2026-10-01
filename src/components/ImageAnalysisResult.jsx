import { useMemo } from 'react'
import { buildImageResultModel } from '../services/viewModel'
import { Card } from './ui'
import FlameImageCard from './FlameImageCard'
import DetectionCard from './DetectionCard'
import FlameColorCard from './FlameColorCard'
import MaterialCard from './MaterialCard'
import AiMaterialCard from './AiMaterialCard'
import FireClassCard from './FireClassCard'
import SuppressionCard, { DurationNote } from './SuppressionCard'

/**
 * The image dashboard: one screen, not a column of cards.
 *
 * Grid areas are declared in CSS per breakpoint, so the DOM stays in result
 * priority order (detection, flame visual, fire class, material, colour, AI)
 * while desktop can place the picture and detection side by side. Cards render at
 * their natural height and the AI card is absent unless its confidence clears the
 * display threshold.
 */
export default function ImageAnalysisResult({ data, previewUrl, dimensions, durationMs }) {
  const model = useMemo(
    () => buildImageResultModel({ data, previewUrl, dimensions, measuredDurationMs: durationMs }),
    [data, dimensions, durationMs, previewUrl],
  )

  if (!model?.hasContent) {
    return <p className="results__none">No analysis results were returned for this image.</p>
  }

  return (
    <div className="result-grid result-grid--image">
      <DetectionCard detection={model.detection} className="area-detection" />
      <FlameImageCard image={model.flameImage} className="area-image" />
      <FireClassCard fireClass={model.fireClass} className="area-class" />
      <MaterialCard material={model.material} className="area-material" />
      <FlameColorCard color={model.flameColor} className="area-color" />
      <AiMaterialCard ai={model.ai} className="area-ai" />
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
