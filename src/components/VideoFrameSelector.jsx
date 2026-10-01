import { FRAME_COUNT_OPTIONS, MAX_FRAME_COUNT, MIN_FRAME_COUNT } from '../config'
import { isValidFrameCount, resolveFrameCount } from '../utils/videoFrames'

/**
 * How many frames to sample. Quick-pick chips plus a number field, both clamped
 * to the supported range so the backend can never be flooded. The chosen count is
 * the whole story here - no explanation of what a frame is.
 */
export default function VideoFrameSelector({ value, onChange, disabled = false }) {
  const effective = resolveFrameCount(value)

  return (
    <fieldset className="frames" disabled={disabled}>
      <legend className="frames__legend">Frames to analyze</legend>

      <div className="frames__options">
        {FRAME_COUNT_OPTIONS.map((option) => {
          const active = option === effective
          return (
            <button
              key={option}
              type="button"
              className={`frames__option${active ? ' is-active' : ''}`}
              onClick={() => onChange(option)}
              aria-pressed={active}
            >
              {option}
            </button>
          )
        })}

        <span className="frames__input">
          <label className="visually-hidden" htmlFor="frame-count">
            Custom number of frames
          </label>
          <input
            id="frame-count"
            type="number"
            inputMode="numeric"
            min={MIN_FRAME_COUNT}
            max={MAX_FRAME_COUNT}
            step={1}
            value={effective}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10)
              if (Number.isNaN(next)) return
              onChange(resolveFrameCount(next))
            }}
            onBlur={(event) => {
              const next = Number.parseInt(event.target.value, 10)
              onChange(isValidFrameCount(next) ? next : resolveFrameCount(next))
            }}
          />
        </span>
      </div>
    </fieldset>
  )
}
