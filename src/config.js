/**
 * Product-level configuration: what the user may upload, and the limits the UI
 * enforces before a request is made.
 *
 * The API base URL is intentionally NOT configured here. It is discovered at
 * runtime by `services/connectionManager` (Lambda wake -> dynamic API URL ->
 * health poll -> heartbeat), so no host is ever hard-coded in the app.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png']

export const ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,.jpg,.jpeg,.png'

export const SUPPORTED_LABEL = 'JPG, JPEG, PNG'

export const SUPPORTED_DETAIL = `${SUPPORTED_LABEL} · up to ${Math.round(
  MAX_UPLOAD_BYTES / (1024 * 1024),
)} MB`

/* ---------------------------------- Video --------------------------------- */

export const MAX_VIDEO_BYTES = 200 * 1024 * 1024

export const ACCEPTED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

export const ACCEPT_VIDEO_ATTRIBUTE =
  'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v'

export const VIDEO_SUPPORTED_LABEL = 'MP4, WebM, MOV'

export const VIDEO_SUPPORTED_DETAIL = `${VIDEO_SUPPORTED_LABEL} · up to ${Math.round(
  MAX_VIDEO_BYTES / (1024 * 1024),
)} MB`

/** Number of sampled frames a user may request, one frame per analysis call. */
export const MIN_FRAME_COUNT = 1
export const MAX_FRAME_COUNT = 20
export const DEFAULT_FRAME_COUNT = 10

/** Quick-pick chips in the frame selector. */
export const FRAME_COUNT_OPTIONS = [5, 10, 15, 20]

/** Frames shown in the result gallery. The rest are analysed but not displayed. */
export const REPRESENTATIVE_FRAME_COUNT = 3

/** Fewest representative frames worth showing; below this the gallery is noise. */
export const MIN_REPRESENTATIVE_FRAME_COUNT = 2

/** Alternative materials listed under the primary match. */
export const MAX_MATERIAL_ALTERNATIVES = 3

/**
 * The AI Material Analysis card is rendered only when the final primary AI
 * confidence reaches this percentage - for an image and for a video alike.
 *
 * Below it the card is omitted entirely (no empty card, no "uncertain" note), so
 * a weak opinion is never presented as a finding. `null`, unavailable and
 * malformed results are hidden by the same rule. The backend reports the same
 * threshold with the video result; this value is the frontend's own definition.
 */
export const AI_VISIBILITY_THRESHOLD_PERCENT = 45

/** Below this success ratio the video result is not presented as reliable. */
export const MIN_FRAME_SUCCESS_RATIO = 0.5

/** Extracted frames are downscaled to this width before upload (payload size). */
export const FRAME_MAX_WIDTH = 1280
