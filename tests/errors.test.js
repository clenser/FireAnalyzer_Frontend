import assert from 'node:assert/strict'
import { test } from 'node:test'

import { describeVideoError } from '../src/utils/videoFrames.js'
import { describeApiError, describeConnectionState } from '../src/utils/errors.js'

/**
 * Every failure the user can hit must end up as a sentence they can act on. This
 * module owns that wording, so the tests pin it: no stack traces, no status
 * codes, no jargon, and a recovery step where one exists.
 */

const FORBIDDEN = [
  'undefined',
  'null',
  'NaN',
  'at Object',
  '.js:',
  'HTTP',
  'status 5',
  'ECONN',
  'TypeError',
  'SyntaxError',
]

const assertPlain = (text) => {
  assert.equal(typeof text, 'string')
  assert.ok(text.length > 0, 'wording must not be empty')
  assert.match(text, /[.!]$/, 'wording reads as a finished sentence')
  for (const token of FORBIDDEN) {
    assert.equal(text.includes(token), false, `"${token}" must not appear in user wording`)
  }
}

test('a video failure always names a next step', () => {
  const cases = [
    ['UNSUPPORTED', /not supported/i, /mp4|webm/i],
    ['METADATA_FAILED', /could not be read/i, /different|supported/i],
    ['NO_FRAMES', /no frames/i, /different/i],
    ['BACKEND_UNAVAILABLE', /not available/i, /online|wait/i],
    ['INSUFFICIENT_FRAMES', /not enough valid frames/i, null],
  ]

  for (const [code, expected, recovery] of cases) {
    const text = describeVideoError({ code })
    assertPlain(text)
    assert.match(text, expected, `${code} wording`)
    if (recovery) assert.match(text, recovery, `${code} must suggest a recovery step`)
  }
})

test('an unrecognised video failure still reads as a sentence', () => {
  assertPlain(describeVideoError(new Error('Something odd happened.')))
})

test('a failure with no message at all still says something useful', () => {
  assertPlain(describeVideoError(null))
  assertPlain(describeVideoError({}))
})

test('a backend error shows its message, or a safe generic one', () => {
  const specific = describeApiError({ message: 'Models are still loading.' })
  assertPlain(specific)
  assert.equal(specific, 'Models are still loading.')

  const generic = describeApiError({ message: null, code: 'NO_FLAME' })
  assertPlain(generic)
  assert.doesNotMatch(generic, /NO_FLAME/, 'the code is never shown to the user')
})

test('a raw thrown value is never rendered as-is', () => {
  assertPlain(describeApiError(new TypeError('Failed to fetch')))
  assertPlain(describeApiError({ message: '  ' }))
  assertPlain(describeApiError(undefined))
})

test('every connection state is described in user terms', () => {
  const states = ['starting', 'connecting', 'ready', 'unavailable']
  for (const state of states) {
    assertPlain(describeConnectionState(state))
  }
})

test('an unknown connection state degrades to a neutral message', () => {
  assertPlain(describeConnectionState('weird-state'))
  assertPlain(describeConnectionState(undefined))
})

test('the unavailable state tells the user the service is the problem, not their file', () => {
  const text = describeConnectionState('unavailable')
  assert.match(text, /service/i)
  assert.doesNotMatch(text, /file|image|video/i)
})
