import { useEffect, useState } from 'react'
import {
  initiatePlexAuth,
  checkPlexAuth,
  adminListServers,
  adminChangeServer,
  Server,
  ServerConnection,
} from '../api/client'

interface ServerChangeModalProps {
  open: boolean
  onClose: () => void
  onSuccess: (serverName: string) => void
}

type Step = 'idle' | 'waiting' | 'servers' | 'connecting'

export default function ServerChangeModal({ open, onClose, onSuccess }: ServerChangeModalProps) {
  const [step, setStep] = useState<Step>('idle')
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [pinId, setPinId] = useState<string | null>(null)
  const [servers, setServers] = useState<Server[]>([])
  const [authWindow, setAuthWindow] = useState<Window | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const reset = () => {
    if (authWindow && !authWindow.closed) authWindow.close()
    setStep('idle')
    setAuthUrl(null)
    setPinId(null)
    setServers([])
    setAuthWindow(null)
    setError(null)
    setLoading(false)
  }

  useEffect(() => {
    if (!open) reset()
  }, [open])

  useEffect(() => {
    if (!pinId || step !== 'waiting') return
    const interval = setInterval(async () => {
      try {
        const result = await checkPlexAuth(pinId)
        if (!result.complete) return
        clearInterval(interval)
        if (authWindow && !authWindow.closed) authWindow.close()
        try {
          const list = await adminListServers(pinId)
          setServers(list)
          setStep('servers')
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to fetch Plex servers')
          setStep('idle')
          setPinId(null)
        }
      } catch {
        // keep polling
      }
    }, 2000)
    const timeout = setTimeout(() => {
      clearInterval(interval)
      if (authWindow && !authWindow.closed) authWindow.close()
      setError('Authentication timed out. Please try again.')
      setStep('idle')
      setPinId(null)
    }, 300000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [pinId, step, authWindow])

  const handleStart = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await initiatePlexAuth()
      setAuthUrl(result.auth_url)
      setPinId(result.pin_id)
      setStep('waiting')
      const popup = window.open(result.auth_url, '_blank')
      setAuthWindow(popup)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start Plex authentication')
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = async (serverId: string, connectionUri: string) => {
    if (!pinId) return
    setStep('connecting')
    setError(null)
    try {
      const result = await adminChangeServer(pinId, serverId, connectionUri)
      onSuccess(result.server_name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to server')
      setStep('servers')
    }
  }

  const formatConnectionUri = (uri: string): string => {
    try {
      const url = new URL(uri)
      let host = url.hostname
      if (host.endsWith('.plex.direct')) {
        host = host.split('.')[0].replace(/-/g, '.')
      }
      return url.port ? `${host}:${url.port}` : host
    } catch {
      return uri
    }
  }

  const sortConnections = (connections: ServerConnection[]) =>
    [...connections].sort((a, b) => (a.local === b.local ? 0 : a.local ? -1 : 1))

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-m3-surface-container rounded-xl p-6 shadow-elevation-3 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium text-m3-on-surface">Change Plex Server</h2>
          <button
            onClick={onClose}
            className="text-m3-on-surface-variant hover:text-m3-on-surface text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="bg-m3-error-container/50 border border-m3-error text-m3-on-error-container px-3 py-2 rounded-md mb-4 text-base">
            {error}
          </div>
        )}

        {step === 'idle' && (
          <>
            <p className="text-base text-m3-on-surface-variant mb-4">
              Sign in with Plex again to refresh the server token or switch servers. Your admin login stays active.
            </p>
            <button
              onClick={handleStart}
              disabled={loading}
              className="w-full bg-m3-primary text-m3-on-primary hover:brightness-110 disabled:opacity-50 font-medium py-2.5 rounded-full transition-all"
            >
              {loading ? 'Connecting...' : 'Sign in with Plex'}
            </button>
          </>
        )}

        {step === 'waiting' && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-m3-primary mx-auto mb-3"></div>
            <p className="mb-3 text-m3-on-surface">Waiting for Plex authentication...</p>
            <p className="text-base text-m3-on-surface-variant mb-4">
              A new window should have opened. If not,{' '}
              <a href={authUrl!} target="_blank" rel="noopener noreferrer" className="text-m3-primary underline">
                click here
              </a>.
            </p>
            <button
              onClick={reset}
              className="text-base text-m3-on-surface-variant hover:text-m3-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {step === 'servers' && (
          <>
            <p className="mb-3 text-m3-on-surface">Select a Plex server:</p>
            <div className="space-y-3">
              {servers.length === 0 && (
                <p className="text-base text-m3-on-surface-variant">No servers available on this account.</p>
              )}
              {servers.map((server) => {
                const sorted = sortConnections(server.connections)
                const recommended = sorted[0]?.uri
                return (
                  <div key={server.id} className="bg-m3-surface-container-high rounded-md overflow-hidden">
                    <div className="px-4 py-2.5 font-medium border-b border-m3-outline-variant text-m3-on-surface">
                      {server.name}
                    </div>
                    <div className="divide-y divide-m3-outline-variant">
                      {sorted.map((conn, idx) => {
                        const isRecommended = conn.uri === recommended
                        return (
                          <button
                            key={idx}
                            onClick={() => handleSelect(server.id, conn.uri)}
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

        {step === 'connecting' && (
          <div className="text-center py-6">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-m3-primary mx-auto mb-3"></div>
            <p className="text-m3-on-surface">Connecting to server...</p>
          </div>
        )}
      </div>
    </div>
  )
}
