import { useMemo } from 'react'
import { buildImageResultModel } from '../services/viewModel'
import { Card, Chip } from './ui'
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
 *   analyzed image + mean flame colour (left column) beside flame detection +
 *   material identification (right column) -> AI material analysis (only when
 *   confident) -> fire class -> processing complete.
 *
 * The left and right columns are two independent flex columns, not two halves
 * of one shared grid row: each is sized only by its own content, so a short
 * Flame Detection card sits directly above Material Identification with a
 * small constant gap, never stranded by the height of the analysed image
 * beside it. See `.results-main` / `.results-cols` in index.css.
 *
 * On a narrow screen the columns flatten into a single one, in reading order:
 * image, detection, material, colour, then the full-width cards below.
 */
export default function ImageAnalysisResult({ data, previewUrl, dimensions, durationMs, wasForced }) {
  const model = useMemo(
    () => buildImageResultModel({ data, previewUrl, dimensions, measuredDurationMs: durationMs, wasForced }),
    [data, dimensions, durationMs, previewUrl, wasForced],
  )

  if (!model?.hasContent) {
    return <p className="results__none">No analysis results were returned for this image.</p>
  }

  return (
    <div className="results-main">
      <div className="results-cols">
        <div className="results-col results-col--left">
          <FlameImageCard image={model.flameImage} className="area-image" />
          <FlameColorCard color={model.flameColor} className="area-color" />
        </div>
        <div className="results-col results-col--right">
          <DetectionCard detection={model.detection} className="area-detection" />
          <MaterialCard material={model.material} evidence={model.evidence} className="area-material" />
        </div>
      </div>

      <AiMaterialCard ai={model.ai} />
      <FireClassCard fireClass={model.fireClass} />
      {!model.fireClass && model.suppression ? <SuppressionCard suppression={model.suppression} /> : null}

      {model.duration || model.cached || model.wasForced ? (
        <Card className="statusbar" aria-label="Analysis status">
          <DurationNote duration={model.duration} />
          {model.wasForced ? <Chip tone="positive">Fresh analysis</Chip> : model.cached ? <Chip tone="neutral">Cached result</Chip> : null}
        </Card>
      ) : null}
    </div>
  )
}
