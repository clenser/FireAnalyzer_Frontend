/**
 * A fixed-ratio image box.
 *
 * This is the only place an image and its mask are layered, and it is the fix for
 * the old layout problem where a tall photo stretched the whole panel and where an
 * absolutely-positioned legend collided with the picture:
 *  - the box is `position: relative` with a bounded `aspect-ratio`/`max-height`;
 *  - the picture and the mask are both absolutely positioned with
 *    `object-fit: contain`, so they align pixel-for-pixel at any box size and
 *    never change the box's height;
 *  - no text is ever positioned over the image - the caption is normal flow
 *    below the frame.
 */
export function ImageCanvas({
  src,
  alt,
  maskUrl = null,
  aspectRatio = '4 / 3',
  scanning = false,
  className = '',
  caption = null,
}) {
  return (
    <figure className={`canvas${className ? ` ${className}` : ''}`} data-scanning={scanning ? 'true' : 'false'}>
      <div className="canvas__frame" style={{ aspectRatio }}>
        {src ? <img className="canvas__img" src={src} alt={alt ?? ''} /> : null}

        {maskUrl ? (
          <img className="canvas__mask" src={maskUrl} alt="" aria-hidden="true" data-mask="true" />
        ) : null}

        {scanning ? <span className="canvas__scanline" aria-hidden="true" /> : null}
      </div>

      {caption ? <figcaption className="canvas__caption">{caption}</figcaption> : null}
    </figure>
  )
}

export default ImageCanvas
