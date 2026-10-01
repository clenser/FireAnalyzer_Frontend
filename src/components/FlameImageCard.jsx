import { Flame } from 'lucide-react'
import { Card, CardHeader, Chip } from './ui'
import { ImageCanvas } from './ImageCanvas'

/**
 * The analyzed picture, with the API's segmented flame mask layered on top.
 *
 * It is the dominant element of the image dashboard, so the canvas fills its box
 * and is bounded by `object-fit: contain` plus a max height: the picture is never
 * stretched, and it can never push the rest of the results off the screen.
 *
 * The mask is the real base64 PNG the backend returns at the source resolution,
 * so it aligns exactly. If a payload only carries a bounding box, the mask is
 * simply absent - nothing is synthesised in the client to imitate one.
 */
export default function FlameImageCard({ image, className = '' }) {
  if (!image?.src) return null

  const { detected, hasMask, label } = image

  return (
    <Card className={`result-card flame-image ${className}`.trim()}>
      <CardHeader
        icon={Flame}
        title={label}
        tone={detected ? 'positive' : 'neutral'}
        meta={detected === null ? null : detected ? 'Flame detected' : 'No flame detected'}
      />

      <ImageCanvas
        className="flame-image__canvas"
        src={image.src}
        maskUrl={image.maskUrl}
        aspectRatio={image.aspectRatio}
        alt="Analyzed flame image with the detected flame region highlighted"
      />

      <div className="flame-image__footer">
        <div className="flame-image__tags">
          {hasMask ? <Chip tone="mask">Flame region</Chip> : null}
        </div>
      </div>
    </Card>
  )
}