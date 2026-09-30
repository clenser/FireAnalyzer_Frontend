/**
 * Draws the analysis over the uploaded photo.
 *
 * Two independent overlays are rendered, because the backend reports two
 * independent things:
 *  - the segmentation *mask*: the actual segmented flame pixels, returned as a
 *    base64 PNG at the source image's resolution. It is drawn as an <img> stacked
 *    over the photo with `object-fit: contain`, so it aligns pixel-for-pixel at
 *    any container size and never distorts the aspect ratio.
 *  - the detection *bounding box*: a rectangle, mapped with percentages.
 */
function overlayStyle(boundingBox, dimensions) {
  if (!boundingBox || !dimensions?.width || !dimensions?.height) return null

  const clamp = (v) => Math.max(0, Math.min(100, v))
  const left = clamp((boundingBox.x1 / dimensions.width) * 100)
  const top = clamp((boundingBox.y1 / dimensions.height) * 100)
  const right = clamp((boundingBox.x2 / dimensions.width) * 100)
  const bottom = clamp((boundingBox.y2 / dimensions.height) * 100)

  if (right - left <= 0.5 || bottom - top <= 0.5) return null

  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${right - left}%`,
    height: `${bottom - top}%`,
  }
}

function maskAlt(segmentation) {
  const count = Number.isFinite(segmentation?.flamePixelCount)
    ? `, ${segmentation.flamePixelCount} flame pixels`
    : ''
  return `Segmented flame mask${count}`
}

export default function ImagePreview({
  src,
  fileName,
  alt,
  dimensions,
  boundingBox = null,
  segmentation = null,
  scanning = false,
  showOverlay = false,
  children,
}) {
  const box = showOverlay ? overlayStyle(boundingBox, dimensions) : null
  const maskUrl = showOverlay ? (segmentation?.maskUrl ?? null) : null

  return (
    <div className="preview" data-scanning={scanning ? 'true' : 'false'}>
      <div className="preview__frame">
        <img
          className="preview__img"
          src={src}
          alt={alt || (fileName ? `Uploaded flame image: ${fileName}` : 'Uploaded flame image')}
        />

        {maskUrl ? (
          <img
            className="preview__mask"
            src={maskUrl}
            alt={maskAlt(segmentation)}
            data-mask-fallback={segmentation?.fallbackUsed ? 'true' : 'false'}
          />
        ) : null}

        {box || maskUrl ? (
          <span className="preview__legend">
            {maskUrl ? (
              <span className="preview__legend-item">
                <span
                  className={`preview__legend-key preview__legend-key--mask${
                    segmentation?.fallbackUsed ? ' is-fallback' : ''
                  }`}
                  aria-hidden="true"
                />
                {segmentation?.fallbackUsed ? 'Fallback region' : 'Segmented flame mask'}
              </span>
            ) : null}
            {box ? (
              <span className="preview__legend-item">
                <span className="preview__legend-key preview__legend-key--bbox" aria-hidden="true" />
                Detection bounding box
              </span>
            ) : null}
          </span>
        ) : null}

        {box ? (
          <div
            className="preview__bbox"
            style={box}
            role="img"
            aria-label={`Detected flame region: x1 ${Math.round(boundingBox.x1)}, y1 ${Math.round(
              boundingBox.y1,
            )}, x2 ${Math.round(boundingBox.x2)}, y2 ${Math.round(boundingBox.y2)}`}
          >
            <span className="preview__bbox-corner preview__bbox-corner--tl" aria-hidden="true" />
            <span className="preview__bbox-corner preview__bbox-corner--tr" aria-hidden="true" />
            <span className="preview__bbox-corner preview__bbox-corner--bl" aria-hidden="true" />
            <span className="preview__bbox-corner preview__bbox-corner--br" aria-hidden="true" />
          </div>
        ) : null}

        {scanning ? <span className="preview__scanline" aria-hidden="true" /> : null}
      </div>
      {children}
    </div>
  )
}
