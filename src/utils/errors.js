/**
 * User-facing failure wording.
 *
 * Every message the user sees about a failure comes from here, so nothing raw
 * (status codes, error enums, stack traces, `undefined`) can reach the UI. The
 * original error object is still available on the thrown value for support
 * purposes; it is only the *wording* that is sanitised.
 */

const GENERIC_API_MESSAGE =
  'The analysis service could not process this image. Please try again.'

const CONNECTION_LABEL = {
  starting: 'The analysis service is starting up.',
  connecting: 'Connecting to the analysis service...',
  ready: 'The analysis service is online.',
  unavailable: 'The analysis service is not available right now.',
  checking: 'Checking the analysis service...',
  online: 'The analysis service is online.',
  offline: 'The analysis service is not available right now.',
}

const isUsable = (value) => typeof value === 'string' && value.trim().length > 0

/**
 * Wording for a failed API call. A message the backend wrote for humans is
 * preferred; a raw technical message is not, so unrecognised text is replaced.
 */
export function describeApiError(error) {
  const code = error?.code ?? null
  const message = isUsable(error?.message) ? error.message.trim() : null

  // Messages that are clearly developer-facing, however they got here.
  const looksTechnical =
    !message ||
    /^(failed to fetch|networkerror|load failed)$/i.test(message) ||
    /\b(typeerror|syntaxerror|rangeerror)\b/i.test(message) ||
    /\bat\s+\w+\s+\(/i.test(message) ||
    /\.js:\d+/i.test(message) ||
    /\bECONN|\bETIMEDOUT|\bENOTFOUND\b/.test(message)

  if (looksTechnical) {
    if (code === 'NOT_READY') {
      return 'The analysis service is still starting up. Please wait a moment and try again.'
    }
    if (code === 'NETWORK_ERROR') {
      return 'Could not reach the analysis service. Check your connection and try again.'
    }
    if (code === 'BAD_RESPONSE') {
      return 'The analysis service returned an unexpected response. Please try again.'
    }
    return GENERIC_API_MESSAGE
  }

  return message
}

/** Wording for a backend connection state. */
export function describeConnectionState(state) {
  return CONNECTION_LABEL[state] ?? CONNECTION_LABEL.checking
}
