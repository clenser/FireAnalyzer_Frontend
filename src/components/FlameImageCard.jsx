import { Chip } from './ui'
import { ImageCanvas } from './ImageCanvas'

/**
 * The analyzed picture, with the API's segmented flame mask layered on top.
 *
 * The mask is the real base64 PNG the backend returns at the source resolution,
 * so it aligns exactly. If a payload only carries a bounding box, the mask is
 * simply absent - nothing is synthesised in the client to imitate one.
 */
export default function FlameImageCard({ image, className = '' }) {
  if (!image?.src) return null

  return (
    <section className={`result-card flame-image ${className}`.trim()}>
      <ImageCanvas
        className="flame-image__canvas"
        src={image.src}
        maskUrl={image.maskUrl}
        aspectRatio={image.aspectRatio}
        alt="Analyzed flame image with the detected flame region highlighted"
      />

      <div className="flame-image__footer">
        <span className="flame-image__label">{image.label}</span>
        <div className="flame-image__tags">
          {image.detected !== null ? (
            <Chip tone={image.detected ? 'positive' : 'neutral'}>
              {image.detected ? 'Flame detected' : 'No flame detected'}
            </Chip>
          ) : null}
          {image.hasMask ? <Chip tone="mask">Flame region</Chip> : null}
        </div>
      </div>
    </section>
  )
}
