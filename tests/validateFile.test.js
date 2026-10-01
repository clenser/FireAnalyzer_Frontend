import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES } from '../src/config.js'
import { formatBytes } from '../src/utils/format.js'
import { validateImageFile, validateVideoFile } from '../src/utils/validateFile.js'

/** A file-like object; only the three fields the validators read. */
const file = (name, type, size) => ({ name, type, size })

/* --------------------------------- image --------------------------------- */

test('a valid JPEG is accepted', () => {
  assert.deepEqual(validateImageFile(file('kitchen.jpg', 'image/jpeg', 1_500_000)), { ok: true })
  assert.deepEqual(validateImageFile(file('kitchen.jpeg', 'image/jpeg', 1_500_000)), { ok: true })
  assert.deepEqual(validateImageFile(file('kitchen.png', 'image/png', 1_500_000)), { ok: true })
})

test('an image with no MIME type is judged on its extension', () => {
  assert.equal(validateImageFile(file('scan.PNG', '', 900_000)).ok, true)
  assert.equal(validateImageFile(file('scan.jpg', 'application/octet-stream', 900_000)).ok, true)
})

test('a non-image is rejected by type and by extension', () => {
  assert.equal(validateImageFile(file('clip.mp4', 'video/mp4', 2_000_000)).ok, false)
  assert.equal(validateImageFile(file('notes.txt', 'text/plain', 100)).ok, false)
  assert.equal(validateImageFile(file('photo.gif', 'image/gif', 100)).ok, false)
})

test('a wrong extension never overrides a real image MIME type', () => {
  assert.equal(validateImageFile(file('noextension', 'image/png', 900_000)).ok, true)
})

test('an empty image is rejected', () => {
  const result = validateImageFile(file('empty.jpg', 'image/jpeg', 0))
  assert.equal(result.ok, false)
  assert.match(result.message, /empty/i)
})

test('an oversized image is rejected with both sizes spelled out', () => {
  const result = validateImageFile(file('huge.jpg', 'image/jpeg', MAX_UPLOAD_BYTES + 1))
  assert.equal(result.ok, false)
  assert.match(result.message, new RegExp(formatBytes(MAX_UPLOAD_BYTES).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('an image at exactly the limit is still accepted', () => {
  assert.equal(validateImageFile(file('limit.jpg', 'image/jpeg', MAX_UPLOAD_BYTES)).ok, true)
})

test('a missing image is reported plainly', () => {
  const result = validateImageFile(null)
  assert.equal(result.ok, false)
  assert.match(result.message, /no file/i)
})

/* --------------------------------- video --------------------------------- */

test('a valid video is accepted', () => {
  assert.equal(validateVideoFile(file('clip.mp4', 'video/mp4', 40_000_000)).ok, true)
  assert.equal(validateVideoFile(file('clip.webm', 'video/webm', 40_000_000)).ok, true)
  assert.equal(validateVideoFile(file('clip.mov', 'video/quicktime', 40_000_000)).ok, true)
  assert.equal(validateVideoFile(file('clip.m4v', '', 40_000_000)).ok, true)
})

test('an image is not accepted where a video is required', () => {
  const result = validateVideoFile(file('kitchen.jpg', 'image/jpeg', 1_500_000))
  assert.equal(result.ok, false)
  assert.match(result.message, /mp4, webm or mov/i)
})

test('an empty video is rejected', () => {
  const result = validateVideoFile(file('empty.mp4', 'video/mp4', 0))
  assert.equal(result.ok, false)
  assert.match(result.message, /empty/i)
})

test('an oversized video is rejected with both sizes spelled out', () => {
  const result = validateVideoFile(file('huge.mp4', 'video/mp4', MAX_VIDEO_BYTES + 1))
  assert.equal(result.ok, false)
  assert.match(result.message, new RegExp(formatBytes(MAX_VIDEO_BYTES).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('a video at exactly the limit is still accepted', () => {
  assert.equal(validateVideoFile(file('limit.mp4', 'video/mp4', MAX_VIDEO_BYTES)).ok, true)
})

test('a missing video is reported plainly', () => {
  assert.equal(validateVideoFile(undefined).ok, false)
})

test('the two validators never accept the same file', () => {
  for (const candidate of [
    file('a.jpg', 'image/jpeg', 1000),
    file('a.mp4', 'video/mp4', 1000),
    file('a.txt', 'text/plain', 1000),
  ]) {
    const asImage = validateImageFile(candidate).ok
    const asVideo = validateVideoFile(candidate).ok
    assert.equal(asImage && asVideo, false, `${candidate.name} cannot be both`)
  }
})
