import { useId, useState } from 'react'
import { VIDEO_FRAME_COUNT_DEFAULT, VIDEO_FRAME_COUNT_MAX, VIDEO_FRAME_COUNT_MIN } from '../config'

/**
 * The user-controlled `frame_count` sent to `POST /analyze-video`, asked for
 * before analysis starts - never after.
 *
 * Typing is unrestricted (so the field never feels stuck), but a value is
 * only forwarded to the backend once it is a valid integer in
 * `[VIDEO_FRAME_COUNT_MIN, VIDEO_FRAME_COUNT_MAX]`; on blur, an empty or
 * invalid entry snaps back to the last valid value rather than being sent
 * as-is, so an invalid `frame_count` can never reach the request.
 */
export default function FrameCountInput({ value, onChange, disabled = false }) {
  const id = useId()
  const [text, setText] = useState(String(value))
  // The committed value can also change from outside (e.g. clearing the
  // video resets it to the default) - adjusted during render rather than in
  // an effect, so the field is in sync on the very render that changed it.
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(String(value))
  }

  const clamp = (n) => Math.min(VIDEO_FRAME_COUNT_MAX, Math.max(VIDEO_FRAME_COUNT_MIN, n))

  const handleChange = (event) => {
    const raw = event.target.value
    setText(raw)
    const trimmed = raw.trim()
    const parsed = Number.parseInt(trimmed, 10)
    // Only a clean integer (no "12.5", no "12abc") commits immediately;
    // anything else waits for blur to resolve, so a mid-edit keystroke never
    // sends a bad value.
    if (trimmed !== '' && Number.isInteger(parsed) && String(parsed) === trimmed) {
      onChange(clamp(parsed))
    }
  }

  const handleBlur = () => {
    const parsed = Number.parseInt(text, 10)
    const next = Number.isFinite(parsed) ? clamp(parsed) : VIDEO_FRAME_COUNT_DEFAULT
    setText(String(next))
    onChange(next)
  }

  return (
    <div className="field" data-disabled={disabled ? 'true' : 'false'}>
      <label className="field__label" htmlFor={id}>
        Frames to Analyze
      </label>
      <div className="field__row">
        <input
          id={id}
          type="number"
          className="field__input is-mono"
          min={VIDEO_FRAME_COUNT_MIN}
          max={VIDEO_FRAME_COUNT_MAX}
          step={1}
          inputMode="numeric"
          value={text}
          disabled={disabled}
          onChange={handleChange}
          onBlur={handleBlur}
          aria-describedby={`${id}-hint`}
        />
        <span className="field__hint is-mono" id={`${id}-hint`}>
          {VIDEO_FRAME_COUNT_MIN}-{VIDEO_FRAME_COUNT_MAX} · default {VIDEO_FRAME_COUNT_DEFAULT}
        </span>
      </div>
    </div>
  )
}
