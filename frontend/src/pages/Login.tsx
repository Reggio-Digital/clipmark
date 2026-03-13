import { useState, useEffect } from 'react'
import {
  initiatePlexAuth,
  checkPlexAuth,
  plexLogin,
  setupSelectServer,
  Server,
  ServerConnection,
  UserInfo,
} from '../api/client'

interface LoginProps {
  needsSetup: boolean
  onSuccess: (user: UserInfo) => void
}

export default function Login({ needsSetup, onSuccess }: LoginProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [pinId, setPinId] = useState<string | null>(null)
  const [step, setStep] = useState<'idle' | 'waiting' | 'servers'>('idle')
  const [servers, setServers] = useState<Server[]>([])
  const [setupPinId, setSetupPinId] = useState<string | null>(null)

  useEffect(() => {
    if (!pinId || step !== 'waiting') return
    const interval = setInterval(async () => {
      try {
        const result = await checkPlexAuth(pinId)
        if (result.complete) {
          clearInterval(interval)
          setAuthUrl(null)
          try {
            const loginResult = await plexLogin(pinId)
            if (loginResult.needs_server_selection && loginResult.servers) {
              setServers(loginResult.servers)
              setSetupPinId(loginResult.pin_id || pinId)
              setStep('servers')
            } else if (loginResult.user) {
              onSuccess(loginResult.user)
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed')
            setStep('idle')
          }
          setPinId(null)
        }
      } catch {
        // Keep polling
      }
    }, 2000)
    const timeout = setTimeout(() => {
      clearInterval(interval)
      setError('Authentication timed out. Please try again.')
      setAuthUrl(null)
      setPinId(null)
      setStep('idle')
    }, 300000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [pinId, step])

  const handleSignIn = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await initiatePlexAuth()
      setAuthUrl(result.auth_url)
      setPinId(result.pin_id)
      setStep('waiting')
      window.open(result.auth_url, '_blank')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start Plex authentication')
    } finally {
      setLoading(false)
    }
  }

  const formatConnectionUri = (uri: string): string => {
    try {
      const url = new URL(uri)
      let host = url.hostname
      if (host.endsWith('.plex.direct')) {
        const ipPart = host.split('.')[0]
        host = ipPart.replace(/-/g, '.')
      }
      return url.port ? `${host}:${url.port}` : host
    } catch {
      return uri
    }
  }

  const sortConnections = (connections: ServerConnection[]) =>
    [...connections].sort((a, b) => (a.local === b.local ? 0 : a.local ? -1 : 1))

  const getRecommendedUri = (connections: ServerConnection[]): string | null => {
    const sorted = sortConnections(connections)
    return sorted.length > 0 ? sorted[0].uri : null
  }

  const handleSelectServer = async (serverId: string, connectionUri?: string) => {
    if (!setupPinId) return
    setLoading(true)
    setError(null)
    try {
      const result = await setupSelectServer(setupPinId, serverId, connectionUri)
      if (result.user) {
        onSuccess(result.user)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="bg-m3-surface-container rounded-xl p-8 shadow-elevation-2 w-full max-w-md">
        <h1 className="text-3xl font-medium text-center mb-2 text-m3-primary">Clipmark</h1>
        <p className="text-m3-on-surface-variant text-center mb-8">
          {needsSetup
            ? 'Connect your Plex account to get started'
            : 'Sign in with your Plex account'}
        </p>

        {error && (
          <div className="bg-m3-error-container/50 border border-m3-error text-m3-on-error-container px-4 py-3 rounded-md mb-4 text-base">
            {error}
          </div>
        )}

        {step === 'idle' && (
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full bg-m3-primary text-m3-on-primary hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed font-medium py-3 rounded-full flex items-center justify-center gap-2 transition-all"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-m3-on-primary"></div>
                Connecting...
              </>
            ) : needsSetup ? (
              'Startup Wizard'
            ) : (
              'Sign in with Plex'
            )}
          </button>
        )}

        {step === 'waiting' && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-m3-primary mx-auto mb-4"></div>
            <p className="mb-4 text-m3-on-surface">Waiting for Plex authentication...</p>
            <p className="text-base text-m3-on-surface-variant mb-4">
              A new window should have opened. If not,{' '}
              <a href={authUrl!} target="_blank" rel="noopener noreferrer" className="text-m3-primary underline">
                click here
              </a>.
            </p>
            <button
              onClick={() => {
                setStep('idle')
                setAuthUrl(null)
                setPinId(null)
              }}
              className="text-base text-m3-on-surface-variant hover:text-m3-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {step === 'servers' && (
          <div>
            {loading ? (
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-m3-primary mx-auto mb-4"></div>
                <p className="text-m3-on-surface">Connecting to server...</p>
              </div>
            ) : (
              <>
                <p className="mb-3 text-m3-on-surface">Select your Plex server:</p>
                <div className="space-y-3">
                  {servers.map((server) => {
                    const recommended = getRecommendedUri(server.connections)
                    return (
                      <div key={server.id} className="bg-m3-surface-container-high rounded-md overflow-hidden">
                        <div className="px-4 py-2.5 font-medium border-b border-m3-outline-variant text-m3-on-surface">
                          {server.name}
                        </div>
                        <div className="divide-y divide-m3-outline-variant">
                          {sortConnections(server.connections).map((conn, idx) => {
                            const isRecommended = conn.uri === recommended
                            return (
                              <button
                                key={idx}
                                onClick={() => handleSelectServer(server.id, conn.uri)}
                                className={`w-full text-left px-4 py-2 hover:bg-m3-surface-container-highest flex items-center justify-between gap-3 transition-colors ${isRecommended ? 'bg-m3-surface-container-highest/50' : ''}`}
                              >
                                <span className="text-base font-mono truncate text-m3-on-surface">{formatConnectionUri(conn.uri)}</span>
                                <div className="flex gap-1.5 shrink-0">
                                  {isRecommended && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-m3-primary-container text-m3-on-primary-container">Recommended</span>
                                  )}
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${conn.local ? 'bg-m3-success-container text-m3-success' : 'bg-m3-secondary-container text-m3-on-secondary-container'}`}>
                                    {conn.local ? 'Local' : 'Remote'}
                                  </span>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
