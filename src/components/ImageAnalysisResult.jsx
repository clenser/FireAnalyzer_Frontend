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
 * The image dashboard, in the one fixed result order:
 *
 *   analyzed image + flame detection -> mean flame colour + material
 *   identification -> AI material analysis (only when confident) -> fire class
 *   -> processing complete
 *
 * One grid, not a tall column of cards. The DOM follows the order above on every
 * screen and each card states the grid columns it occupies (`.area-*`): the
 * analyzed picture takes the wider half of the first row with detection beside
 * it, the mean colour and material pair repeat that same column boundary, and
 * everything after them is full width. A card whose partner the data did not
 * produce is marked `is-solo` and takes the whole row rather than leaving half
 * of it blank.
 *
 * Every card renders at its natural height, and the AI card is absent unless its
 * confidence clears the display threshold.
 */
export default function ImageAnalysisResult({ data, previewUrl, dimensions, durationMs }) {
  const model = useMemo(
    () => buildImageResultModel({ data, previewUrl, dimensions, measuredDurationMs: durationMs }),
    [data, dimensions, durationMs, previewUrl],
  )

  if (!model?.hasContent) {
    return <p className="results__none">No analysis results were returned for this image.</p>
  }

  const imageClass = model.detection ? 'area-image' : 'area-image is-solo'
  const detectionClass = model.flameImage?.src ? 'area-detection' : 'area-detection is-solo'
  const colorClass = model.material ? 'area-color' : 'area-color is-solo'
  const materialClass = model.flameColor ? 'area-material' : 'area-material is-solo'

  return (
    <div className="result-grid result-grid--image">
      <FlameImageCard image={model.flameImage} className={imageClass} />
      <DetectionCard detection={model.detection} className={detectionClass} />
      <FlameColorCard color={model.flameColor} className={colorClass} />
      <MaterialCard material={model.material} className={materialClass} />
      <AiMaterialCard ai={model.ai} className="area-ai" />
      <FireClassCard fireClass={model.fireClass} className="area-class" />
      {!model.fireClass && model.suppression ? (
        <SuppressionCard suppression={model.suppression} className="area-class" />
      ) : null}

      {model.duration ? (
        <Card className="statusbar area-status" aria-label="Analysis status">
          <DurationNote duration={model.duration} />
        </Card>
      ) : null}
    </div>
  )
}
