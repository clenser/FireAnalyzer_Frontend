import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as videoFrames from '../src/utils/videoFrames.js'
import { VideoError, extractFrames } from '../src/utils/videoFrames.js'
import { FRAME_MAX_WIDTH } from '../src/config.js'
import {
  createFakeCanvas,
  createFakeVideo,
  installBrowserStubs,
} from './helpers/browserStubs.js'

function withCanvas(options, run) {
  const canvas = createFakeCanvas(options)
  const stubs = installBrowserStubs({ canvas })
  const video = createFakeVideo(options)
  return run({ video, canvas, stubs })
}

test('each requested timestamp becomes an uploadable JPEG file', async () => {
  await withCanvas({}, async ({ video, canvas, stubs }) => {
    try {
      const timestamps = [1, 4, 9]
      const frames = await extractFrames(video, timestamps)

      assert.equal(frames.length, 3)
      assert.equal(canvas.calls.drawImage, 3, 'every frame is drawn to the canvas')

      for (const [index, frame] of frames.entries()) {
        assert.equal(frame.index, index)
        assert.equal(frame.timestamp, timestamps[index])
        assert.equal(frame.error, null)
        assert.ok(frame.file instanceof Blob)
        assert.equal(frame.file.type, 'image/jpeg')
        assert.equal(frame.file.name, `frame-${String(index + 1).padStart(3, '0')}.jpg`)
        assert.match(frame.dataUrl, /^blob:/)
      }

      assert.deepEqual(video.seeks, timestamps)
    } finally {
      stubs.restore()
    }
  })
})

test('extracted frames are downscaled to the configured maximum width', async () => {
  await withCanvas({ width: 3840, height: 2160 }, async ({ video, canvas, stubs }) => {
    try {
      const [frame] = await extractFrames(video, [2], { maxWidth: FRAME_MAX_WIDTH })
      assert.equal(frame.width, FRAME_MAX_WIDTH)
      assert.equal(canvas.width, FRAME_MAX_WIDTH)
      assert.equal(canvas.height, Math.round((2160 / 3840) * FRAME_MAX_WIDTH))
    } finally {
      stubs.restore()
    }
  })
})

test('a small video is not upscaled', async () => {
  await withCanvas({ width: 320, height: 240 }, async ({ video, canvas, stubs }) => {
    try {
      const [frame] = await extractFrames(video, [1])
      assert.equal(frame.width, 320)
      assert.equal(canvas.width, 320)
    } finally {
      stubs.restore()
    }
  })
})

test('one undecodable frame degrades the result instead of failing it', async () => {
  await withCanvas({ failSeekAt: [4] }, async ({ video, stubs }) => {
    try {
      const frames = await extractFrames(video, [1, 4, 9])

      assert.equal(frames.length, 3, 'every requested frame is still reported')
      assert.equal(frames[0].error, null)
      assert.equal(frames[1].file, null, 'the failed frame has no file to upload')
      assert.ok(frames[1].error, 'the failure is recorded on that frame only')
      assert.equal(frames[2].error, null)
    } finally {
      stubs.restore()
    }
  })
})

test('progress is reported for every frame, successful or not', async () => {
  await withCanvas({ failSeekAt: [4] }, async ({ video, stubs }) => {
    try {
      const progress = []
      await extractFrames(video, [1, 4, 9], { onFrame: (event) => progress.push(event) })

      assert.equal(progress.length, 3)
      assert.deepEqual(
        progress.map((event) => event.completed),
        [1, 2, 3],
      )
      assert.equal(progress.at(-1).succeeded, 2)
      assert.equal(progress.every((event) => event.total === 3), true)
    } finally {
      stubs.restore()
    }
  })
})

test('a video where every frame fails is rejected as having no frames', async () => {
  await withCanvas({ failSeekAt: [1, 4] }, async ({ video, stubs }) => {
    try {
      await assert.rejects(
        extractFrames(video, [1, 4]),
        (error) => error instanceof VideoError && error.code === 'NO_FRAMES',
      )
    } finally {
      stubs.restore()
    }
  })
})

test('a frame that cannot be encoded is treated as a failed frame', async () => {
  await withCanvas({ encodeFails: true }, async ({ video, stubs }) => {
    try {
      await assert.rejects(
        extractFrames(video, [1]),
        (error) => error instanceof VideoError && error.code === 'NO_FRAMES',
      )
    } finally {
      stubs.restore()
    }
  })
})

test('no requested frames is rejected up front', async () => {
  await withCanvas({}, async ({ video, stubs }) => {
    try {
      await assert.rejects(
        extractFrames(video, []),
        (error) => error instanceof VideoError && error.code === 'NO_FRAMES',
      )
    } finally {
      stubs.restore()
    }
  })
})

test('a video with no picture data is rejected', async () => {
  await withCanvas({ width: 0, height: 0 }, async ({ video, stubs }) => {
    try {
      await assert.rejects(
        extractFrames(video, [1]),
        (error) => error instanceof VideoError && error.code === 'NO_FRAMES',
      )
    } finally {
      stubs.restore()
    }
  })
})

test('no synthetic colour patch is ever produced for the backend', () => {
  // The deterministic endpoint takes the aggregated RGB/LAB as JSON, so the app
  // must not fabricate a colour-patch image to upload. The helper is gone.
  assert.equal('createMeanColorImage' in videoFrames, false)
})
