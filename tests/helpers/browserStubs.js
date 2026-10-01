/**
 * Minimal browser stubs for the frame-extraction tests.
 *
 * The video pipeline touches `document`, `URL.createObjectURL` and a canvas 2D
 * context. These stubs provide just enough of each to exercise the real code
 * paths (metadata read, seek, draw, encode) in node, without pulling in a
 * headless browser.
 */

class FakeEventTarget {
  constructor() {
    this.listeners = new Map()
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(handler)
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler)
  }

  emit(type, event = {}) {
    for (const handler of this.listeners.get(type) ?? []) handler(event)
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0
  }
}

/**
 * A <video> stand-in. `metadata` drives the loadedmetadata event; `failSeekAt`
 * makes a specific timestamp fail so partial-failure handling can be tested.
 */
export function createFakeVideo({ duration = 12, width = 640, height = 360, failSeekAt = [] } = {}) {
  const video = new FakeEventTarget()

  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.crossOrigin = ''
  video.videoWidth = width
  video.videoHeight = height
  video.duration = duration
  video.currentTime = 0
  video.src = ''
  video.seeks = []
  video.loadCount = 0
  video.load = () => {
    video.loadCount += 1
  }
  video.removeAttribute = () => {}
  video.setAttribute = () => {}

  Object.defineProperty(video, 'duration', {
    get: () => video._duration,
    set: (value) => {
      video._duration = value
    },
  })
  video._duration = duration

  Object.defineProperty(video, 'currentTime', {
    get: () => video._currentTime,
    set: (value) => {
      video._currentTime = value
      video.seeks.push(value)
      queueMicrotask(() => {
        if (failSeekAt.includes(value)) video.emit('error', { code: 4 })
        else video.emit('seeked')
      })
    },
  })
  video._currentTime = 0

  return video
}

export function createFakeCanvas({ encodeFails = false } = {}) {
  const calls = { clearRect: 0, drawImage: 0, fillRect: 0 }
  // One persistent context, so properties set on it are observable afterwards.
  const context = {
    fillStyle: '',
    clearRect: () => {
      calls.clearRect += 1
    },
    drawImage: () => {
      calls.drawImage += 1
    },
    fillRect: () => {
      calls.fillRect += 1
    },
  }

  const canvas = {
    width: 0,
    height: 0,
    context,
    getContext: () => context,
    toBlob: (callback, type) => {
      if (encodeFails) {
        callback(null)
        return
      }
      // A real Blob keeps `new File([blob], ...)` on the same code path as a browser.
      callback(new Blob([`frame:${calls.drawImage}`], { type }))
    },
  }

  canvas.calls = calls
  return canvas
}

/** Installs the stubs on globalThis and returns a restore function. */
export function installBrowserStubs({
  canvas = createFakeCanvas(),
  videoFactory = () => createFakeVideo(),
} = {}) {
  const createdVideos = []
  const createdCanvases = []
  let objectUrlCount = 0

  const previous = {
    document: globalThis.document,
    URL: globalThis.URL?.createObjectURL,
    revokeObjectURL: globalThis.URL?.revokeObjectURL,
  }

  globalThis.document = {
    createElement(tag) {
      if (tag === 'video') {
        const video = videoFactory()
        createdVideos.push(video)
        return video
      }
      if (tag === 'canvas') {
        createdCanvases.push(canvas)
        return canvas
      }
      throw new Error(`unexpected element: ${tag}`)
    },
  }

  if (!globalThis.URL) {
    globalThis.URL = {}
  }
  globalThis.URL.createObjectURL = () => {
    objectUrlCount += 1
    return `blob:fake/${objectUrlCount}`
  }
  globalThis.URL.revokeObjectURL = () => {}

  return {
    canvas,
    createdVideos,
    createdCanvases,
    restore() {
      globalThis.document = previous.document
      if (previous.URL) globalThis.URL.createObjectURL = previous.URL
      if (previous.revokeObjectURL) globalThis.URL.revokeObjectURL = previous.revokeObjectURL
    },
  }
}
