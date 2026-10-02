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

/** Representative frames shown before "View all analyzed frames" is expanded. */
export const REPRESENTATIVE_FRAME_COUNT = 3

/**
 * The user-controlled `frame_count` sent to `POST /analyze-video` - the total
 * number of evenly spaced frames the backend samples from the clip. These
 * mirror the backend's own bounds exactly (`MIN_FRAMES_LIMIT`/
 * `MAX_FRAMES_LIMIT` in `app/video_analysis.py`; the default is the backend's
 * own `FLAME_VIDEO_MAX_FRAMES`). Omitting the field preserves that default,
 * so the UI's default value and "omit" produce the same result.
 */
export const VIDEO_FRAME_COUNT_MIN = 3
export const VIDEO_FRAME_COUNT_MAX = 60
export const VIDEO_FRAME_COUNT_DEFAULT = 12

/** Alternative materials listed under the primary match. */
export const MAX_MATERIAL_ALTERNATIVES = 3

/**
 * The AI Material Analysis card (the secondary, numeric-only Gemini opinion on
 * an image) is rendered only when its top confidence reaches this percentage.
 * Below it the card is omitted entirely, so a weak opinion is never presented
 * as a finding. The backend never produces this card for a video.
 */
export const AI_VISIBILITY_THRESHOLD_PERCENT = 45

/** "Ignore the 48-hour cached result and run a new analysis." */
export const FORCE_NEW_ANALYSIS_HELP = 'Ignore the 48-hour cached result and run a new analysis.'
