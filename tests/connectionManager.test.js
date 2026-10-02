import assert from 'node:assert/strict'
import { test, beforeEach, afterEach } from 'node:test'

import {
  connect,
  disconnect,
  getApiUrl,
  getConnectionState,
  subscribeToState,
  configureConnectionManager,
  resetConnectionManager,
} from '../src/services/connectionManager.js'

function createResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function createMockFetch(handler) {
  return async (url, options) => handler(url, options)
}

function waitForState(targetState, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error(`Timed out waiting for state "${targetState}", current: "${getConnectionState()}"`))
    }, timeout)

    const unsubscribe = subscribeToState((state) => {
      if (state === targetState) {
        clearTimeout(timer)
        unsubscribe()
        resolve()
      }
    })

    if (getConnectionState() === targetState) {
      clearTimeout(timer)
      unsubscribe()
      resolve()
    }
  })
}

beforeEach(() => {
  resetConnectionManager()
  configureConnectionManager({
    pollInterval: 1,
  })
})

afterEach(() => {
  disconnect()
})

test('Lambda returns running → connection becomes ready', async () => {
  const calls = []
  configureConnectionManager({
    fetch: createMockFetch((url) => {
      calls.push(url)
      if (url.includes('lambda-url')) {
        return createResponse({
          instance_id: 'i-123',
          state: 'running',
          public_ip: '1.2.3.4',
          api_url: 'http://1.2.3.4',
        })
      }
      if (url.includes('/health')) {
        return createResponse({ status: 'ok', device: 'cpu' })
      }
      return createResponse({})
    }),
  })

  const readyPromise = waitForState('ready')
  connect()
  await readyPromise

  assert.equal(getConnectionState(), 'ready')
  assert.equal(getApiUrl(), 'http://1.2.3.4')
  assert.ok(calls.some((url) => url.includes('lambda-url')))
  assert.ok(calls.some((url) => url.includes('/health')))
})

test('Lambda returns starting → polling occurs → eventually running → ready', async () => {
  let lambdaCallCount = 0
  const calls = []
  configureConnectionManager({
    fetch: createMockFetch((url) => {
      calls.push(url)
      if (url.includes('lambda-url')) {
        lambdaCallCount++
        if (lambdaCallCount < 3) {
          return createResponse({
            instance_id: 'i-123',
            state: 'starting',
            public_ip: null,
            api_url: null,
          })
        }
        return createResponse({
          instance_id: 'i-123',
          state: 'running',
          public_ip: '1.2.3.4',
          api_url: 'http://1.2.3.4',
        })
      }
      if (url.includes('/health')) {
        return createResponse({ status: 'ok', device: 'cpu' })
      }
      return createResponse({})
    }),
  })

  const readyPromise = waitForState('ready')
  connect()
  await readyPromise

  assert.equal(getConnectionState(), 'ready')
  assert.equal(getApiUrl(), 'http://1.2.3.4')
  assert.ok(lambdaCallCount >= 3, `Expected at least 3 Lambda calls, got ${lambdaCallCount}`)
})

test('health check passes → ready', async () => {
  configureConnectionManager({
    fetch: createMockFetch((url) => {
      if (url.includes('lambda-url')) {
        return createResponse({
          instance_id: 'i-123',
          state: 'running',
          public_ip: '1.2.3.4',
          api_url: 'http://1.2.3.4',
        })
      }
      if (url.includes('/health')) {
        return createResponse({ status: 'ok', device: 'cpu' })
      }
      return createResponse({})
    }),
  })

  const readyPromise = waitForState('ready')
  connect()
  await readyPromise

  assert.equal(getConnectionState(), 'ready')
})

test('health check fails → retries until ready', async () => {
  let healthCallCount = 0
  configureConnectionManager({
    fetch: createMockFetch((url) => {
      if (url.includes('lambda-url')) {
        return createResponse({
          instance_id: 'i-123',
          state: 'running',
          public_ip: '1.2.3.4',
          api_url: 'http://1.2.3.4',
        })
      }
      if (url.includes('/health')) {
        healthCallCount++
        if (healthCallCount < 3) {
          return createResponse({ status: 'error' }, 500)
        }
        return createResponse({ status: 'ok', device: 'cpu' })
      }
      return createResponse({})
    }),
  })

  const readyPromise = waitForState('ready')
  connect()
  await readyPromise

  assert.equal(getConnectionState(), 'ready')
  assert.ok(healthCallCount >= 3, `Expected at least 3 health calls, got ${healthCallCount}`)
})

test('disconnect tears down the connection', async () => {
  configureConnectionManager({
    fetch: createMockFetch((url) => {
      if (url.includes('lambda-url')) {
        return createResponse({
          instance_id: 'i-123',
          state: 'running',
          public_ip: '1.2.3.4',
          api_url: 'http://1.2.3.4',
        })
      }
      if (url.includes('/health')) {
        return createResponse({ status: 'ok', device: 'cpu' })
      }
      return createResponse({})
    }),
  })

  const readyPromise = waitForState('ready')
  connect()
  await readyPromise

  disconnect()

  assert.equal(getConnectionState(), 'starting')
  assert.equal(getApiUrl(), null)
})

test('dynamic api_url usage', async () => {
  configureConnectionManager({
    fetch: createMockFetch((url) => {
      if (url.includes('lambda-url')) {
        return createResponse({
          instance_id: 'i-123',
          state: 'running',
          public_ip: '5.6.7.8',
          api_url: 'http://5.6.7.8',
        })
      }
      if (url.includes('/health')) {
        return createResponse({ status: 'ok', device: 'cpu' })
      }
      return createResponse({})
    }),
  })

  const readyPromise = waitForState('ready')
  connect()
  await readyPromise

  assert.equal(getApiUrl(), 'http://5.6.7.8')
  assert.equal(getConnectionState(), 'ready')
})

test('Lambda error → unavailable → retry', async () => {
  let lambdaCallCount = 0
  configureConnectionManager({
    fetch: createMockFetch((url) => {
      if (url.includes('lambda-url')) {
        lambdaCallCount++
        if (lambdaCallCount === 1) {
          throw new Error('Network error')
        }
        return createResponse({
          instance_id: 'i-123',
          state: 'running',
          public_ip: '1.2.3.4',
          api_url: 'http://1.2.3.4',
        })
      }
      if (url.includes('/health')) {
        return createResponse({ status: 'ok', device: 'cpu' })
      }
      return createResponse({})
    }),
  })

  const readyPromise = waitForState('ready')
  connect()
  await readyPromise

  assert.ok(lambdaCallCount >= 2, `Expected at least 2 Lambda calls, got ${lambdaCallCount}`)
  assert.equal(getConnectionState(), 'ready')
})

test('multiple connect calls are idempotent', async () => {
  let lambdaCallCount = 0
  configureConnectionManager({
    fetch: createMockFetch((url) => {
      if (url.includes('lambda-url')) {
        lambdaCallCount++
        return createResponse({
          instance_id: 'i-123',
          state: 'running',
          public_ip: '1.2.3.4',
          api_url: 'http://1.2.3.4',
        })
      }
      if (url.includes('/health')) {
        return createResponse({ status: 'ok', device: 'cpu' })
      }
      return createResponse({})
    }),
  })

  const readyPromise = waitForState('ready')
  connect()
  connect()
  connect()
  await readyPromise

  assert.equal(lambdaCallCount, 1)
  assert.equal(getConnectionState(), 'ready')
})

test('state transitions are emitted to subscribers', async () => {
  const states = []
  const unsubscribe = subscribeToState((state) => states.push(state))

  configureConnectionManager({
    fetch: createMockFetch((url) => {
      if (url.includes('lambda-url')) {
        return createResponse({
          instance_id: 'i-123',
          state: 'running',
          public_ip: '1.2.3.4',
          api_url: 'http://1.2.3.4',
        })
      }
      if (url.includes('/health')) {
        return createResponse({ status: 'ok', device: 'cpu' })
      }
      return createResponse({})
    }),
  })

  const readyPromise = waitForState('ready')
  connect()
  await readyPromise
  unsubscribe()

  assert.ok(states.includes('starting'))
  assert.ok(states.includes('connecting'))
  assert.ok(states.includes('ready'))
})
