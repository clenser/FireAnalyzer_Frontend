import { useEffect, useRef, useState } from 'react'
import { checkHealth } from '../services/api.js'
import { connect, disconnect, subscribeToState } from '../services/connectionManager.js'
import { describeConnectionState } from '../utils/errors.js'

/**
 * Owns the Lambda wake -> dynamic API URL -> health poll -> heartbeat lifecycle.
 *
 * The app never talks to a fixed host: the URL is whatever the connection
 * manager discovers, and every request reads it at call time.
 */
export default function useBackendConnection() {
  const [connectionState, setConnectionState] = useState('starting')
  const [health, setHealth] = useState({ state: 'checking' })
  const previousState = useRef('starting')

  useEffect(() => {
    const unsubscribe = subscribeToState((nextState) => {
      const previous = previousState.current
      previousState.current = nextState
      setConnectionState(nextState)

      if (nextState === 'ready' && previous !== 'ready') {
        checkHealth()
          .then((result) => {
            setHealth({
              state: result.status === 'ok' ? 'online' : 'offline',
              device: result.device,
            })
          })
          .catch(() => setHealth({ state: 'offline' }))
      } else if (nextState === 'unavailable') {
        setHealth({ state: 'offline' })
      }
    })

    connect()

    const handleBeforeUnload = () => disconnect()
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      unsubscribe()
      window.removeEventListener('beforeunload', handleBeforeUnload)
      disconnect()
    }
  }, [])

  const connectionReady = connectionState === 'ready'

  return {
    connectionState,
    connectionReady,
    // A sentence the user can act on, rather than a bare state name.
    connectionMessage: describeConnectionState(connectionState),
    health,
  }
}
