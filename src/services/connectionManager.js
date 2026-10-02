const DEFAULT_LAMBDA_URL =
  'https://qctcqxc4aygxa7z5nnpqnpunh40amxth.lambda-url.ap-southeast-2.on.aws/'

const DEFAULT_POLL_INTERVAL = 5000

function getDefaultLambdaUrl() {
  try {
    return import.meta.env.VITE_LAMBDA_WAKE_URL ?? DEFAULT_LAMBDA_URL
  } catch {
    return DEFAULT_LAMBDA_URL
  }
}

const state = {
  apiUrl: null,
  connectionState: 'starting',
  listeners: new Set(),
  pollTimer: null,
  isConnecting: false,
  lambdaUrl: getDefaultLambdaUrl(),
  pollInterval: DEFAULT_POLL_INTERVAL,
  fetch: globalThis.fetch ? globalThis.fetch.bind(globalThis) : fetch,
}

let activeGeneration = 0

function setState(newState) {
  state.connectionState = newState
  state.listeners.forEach((fn) => fn(newState))
}

function subscribe(fn) {
  state.listeners.add(fn)
  return () => state.listeners.delete(fn)
}

function clearPollTimer() {
  if (state.pollTimer) {
    clearTimeout(state.pollTimer)
    state.pollTimer = null
  }
}

async function pollLambda(generation) {
  if (generation !== activeGeneration) return

  const response = await state.fetch(state.lambdaUrl)
  if (!response.ok) throw new Error(`Lambda returned ${response.status}`)
  const data = await response.json()

  if (data.state === 'running') {
    state.apiUrl = data.api_url
    setState('connecting')
    await pollHealth(generation)
  } else if (data.state === 'starting') {
    state.pollTimer = setTimeout(() => {
      if (generation === activeGeneration) {
        pollLambda(generation).catch(() => handleLambdaError(generation))
      }
    }, state.pollInterval)
  } else {
    throw new Error(`Unexpected Lambda state: ${data.state}`)
  }
}

function handleLambdaError(generation) {
  if (generation !== activeGeneration) return
  setState('unavailable')
  state.pollTimer = setTimeout(() => {
    if (generation === activeGeneration) {
      connect().catch(() => {})
    }
  }, state.pollInterval)
}

async function pollHealth(generation) {
  if (generation !== activeGeneration) return

  try {
    const response = await state.fetch(`${state.apiUrl}/health`)
    if (response.ok) {
      const body = await response.json()
      if (body.status === 'ok') {
        setState('ready')
        state.isConnecting = false
        return
      }
    }
  } catch {
  // Health check failed, will retry
  }

  state.pollTimer = setTimeout(() => {
    if (generation === activeGeneration) {
      pollHealth(generation).catch(() => handleLambdaError(generation))
    }
  }, state.pollInterval)
}

export async function connect() {
  if (state.isConnecting) return
  state.isConnecting = true
  const generation = ++activeGeneration
  setState('starting')

  try {
    await pollLambda(generation)
  } catch {
    handleLambdaError(generation)
  } finally {
    state.isConnecting = false
  }
}

export function disconnect() {
  activeGeneration++
  clearPollTimer()
  state.apiUrl = null
  state.isConnecting = false
  setState('starting')
}

export function getApiUrl() {
  return state.apiUrl
}

export function getConnectionState() {
  return state.connectionState
}

export function subscribeToState(fn) {
  return subscribe(fn)
}

export function configureConnectionManager(options) {
  if (options.lambdaUrl !== undefined) state.lambdaUrl = options.lambdaUrl
  if (options.pollInterval !== undefined) state.pollInterval = options.pollInterval
  if (options.fetch !== undefined) state.fetch = options.fetch
}

export function resetConnectionManager() {
  state.listeners.clear()
  disconnect()
  state.lambdaUrl = getDefaultLambdaUrl()
  state.pollInterval = DEFAULT_POLL_INTERVAL
  state.fetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : fetch
}
