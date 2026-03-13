import { useState, useEffect } from 'react'
import {
  getGiphyStatus,
  configureGiphy,
  removeGiphyConfig,
  getFeatureFlags,
  FeatureFlags,
  UserInfo,
} from '../api/client'
import { showToast } from '../components/Toast'

interface SetupProps {
  user: UserInfo
  onUserUpdate: (user: UserInfo) => void
}

export default function Setup({ user, onUserUpdate }: SetupProps) {
  const [giphyConfigured, setGiphyConfigured] = useState<boolean | null>(null)
  const [giphyApiKey, setGiphyApiKey] = useState('')
  const [giphySaving, setGiphySaving] = useState(false)
  const [features, setFeatures] = useState<FeatureFlags | null>(null)

  useEffect(() => {
    getGiphyStatus().then((s) => setGiphyConfigured(s.configured))
    getFeatureFlags().then(setFeatures).catch(() => {})
  }, [])

  const handleSaveGiphyKey = async () => {
    if (!giphyApiKey.trim()) return
    setGiphySaving(true)

    try {
      await configureGiphy(giphyApiKey.trim())
      setGiphyConfigured(true)
      setGiphyApiKey('')
      onUserUpdate({ ...user, giphy_configured: true })
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save API key')
    } finally {
      setGiphySaving(false)
    }
  }

  const handleRemoveGiphyKey = async () => {
    setGiphySaving(true)

    try {
      await removeGiphyConfig()
      setGiphyConfigured(false)
      onUserUpdate({ ...user, giphy_configured: false })
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to remove API key')
    } finally {
      setGiphySaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-medium mb-2 text-m3-on-surface">Settings</h1>
      <p className="text-base text-m3-on-surface-variant mb-6">Manage your account and optional integrations like GIPHY.</p>

      <div className="bg-m3-surface-container rounded-md p-6 mb-6">
        <div className="flex items-center gap-4">
          {user.thumb && (
            <img
              src={user.thumb}
              alt={user.username}
              className="w-12 h-12 rounded-full"
            />
          )}
          <div>
            <p className="font-medium text-lg text-m3-on-surface">{user.username}</p>
            {user.email && <p className="text-base text-m3-on-surface-variant">{user.email}</p>}
            <p className="text-xs text-m3-outline mt-1">
              Role: <span className={user.role === 'admin' ? 'text-m3-primary' : 'text-m3-on-surface'}>{user.role}</span>
            </p>
          </div>
        </div>
      </div>

      {features?.giphy_global_enabled !== false && (
      <>
      <h2 className="text-xl font-medium mb-4 text-m3-on-surface">Giphy Integration</h2>
      <div className="bg-m3-surface-container rounded-md p-6 mb-6">
        {giphyConfigured === null ? (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-m3-primary"></div>
          </div>
        ) : giphyConfigured ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-m3-success rounded-full"></div>
              <span className="text-m3-on-surface">Giphy API key configured</span>
            </div>
            <button
              onClick={handleRemoveGiphyKey}
              disabled={giphySaving}
              className="bg-m3-error-container hover:brightness-110 text-m3-on-error-container disabled:opacity-50 px-4 py-2 rounded-full text-base font-medium transition-all"
            >
              {giphySaving ? 'Removing...' : 'Remove'}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-m3-on-surface-variant mb-4">
              Add your Giphy API key to enable uploading GIFs directly to Giphy.
              Each user manages their own API key.{' '}
              <a
                href="https://developers.giphy.com/dashboard/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-m3-primary underline"
              >
                Get an API key
              </a>
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={giphyApiKey}
                onChange={(e) => setGiphyApiKey(e.target.value)}
                placeholder="Enter Giphy API key"
                className="flex-1 bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-4 py-2 text-m3-on-surface placeholder-m3-outline focus:outline-none focus:border-m3-primary transition-colors"
              />
              <button
                onClick={handleSaveGiphyKey}
                disabled={giphySaving || !giphyApiKey.trim()}
                className="bg-m3-primary-container hover:brightness-110 text-m3-on-primary-container disabled:opacity-50 px-4 py-2 rounded-full text-base font-medium transition-all"
              >
                {giphySaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  )
}
