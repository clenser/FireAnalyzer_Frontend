import assert from 'node:assert/strict'
import { test } from 'node:test'

import { VideoError, loadVideoSource, readVideoMetadata } from '../src/utils/videoFrames.js'
import { createFakeVideo, installBrowserStubs } from './helpers/browserStubs.js'

/** Runs a configured fake video through the real metadata-read path. */
function metadataStubs(options) {
  const video = createFakeVideo(options)
  const stubs = installBrowserStubs({ videoFactory: () => video })
  return { video, stubs }
}

test('video metadata is read from the real element', async () => {
  const { video, stubs } = metadataStubs({ duration: 42.5, width: 1920, height: 1080 })
  try {
    const loading = loadVideoSource({ name: 'clip.mp4', type: 'video/mp4' })
    video.emit('loadedmetadata')

    const source = await loading
    assert.equal(source.metadata.durationSec, 42.5)
    assert.equal(source.metadata.width, 1920)
    assert.equal(source.metadata.height, 1080)
    assert.match(source.url, /^blob:/)
    assert.equal(typeof source.dispose, 'function')

    source.dispose()
  } finally {
    stubs.restore()
  }
})

test('a video with no readable duration is rejected', async () => {
  const { video, stubs } = metadataStubs({ duration: 0 })
  try {
    const loading = loadVideoSource({ name: 'clip.mp4' })
    video.emit('loadedmetadata')

    await assert.rejects(loading, (error) => error instanceof VideoError && error.code === 'NO_FRAMES')
  } finally {
    stubs.restore()
  }
})

test('an undecodable video is reported as unreadable', async () => {
  const { video, stubs } = metadataStubs({ duration: 10 })
  try {
    const loading = loadVideoSource({ name: 'broken.mov' })
    video.emit('error')

    await assert.rejects(
      loading,
      (error) => error instanceof VideoError && error.code === 'METADATA_FAILED',
    )
  } finally {
    stubs.restore()
  }
})

test('a stalled video read times out instead of hanging', async () => {
  const { video, stubs } = metadataStubs({ duration: 10 })
  try {
    await assert.rejects(
      loadVideoSource({ name: 'stalled.mp4' }, { timeoutMs: 20 }),
      (error) => error instanceof VideoError && error.code === 'METADATA_FAILED',
    )
    assert.equal(video.listenerCount('loadedmetadata'), 0)
  } finally {
    stubs.restore()
  }
})

test('metadata-only reads release the source afterwards', async () => {
  const { video, stubs } = metadataStubs({ duration: 8 })
  try {
    const loading = readVideoMetadata({ name: 'clip.webm' })
    video.emit('loadedmetadata')
    const metadata = await loading
    assert.equal(metadata.durationSec, 8)
    assert.equal(video.loadCount, 2, 'the element is released when only metadata was needed')
  } finally {
    stubs.restore()
  }
})
