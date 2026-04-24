import { useState, useEffect } from 'react'
import {
  getAdminUsers,
  updateAdminUser,
  getAdminServerInfo,
  adminDisconnectServer,
  getAdminSettings,
  updateAdminSettings,
  getAdminTasks,
  updateAdminTask,
  runAdminTask,
  getLibraryCacheStats,
  clearDiskCache,
  getGifStats,
  deleteAllGifs,
  getHealth,
  AdminUserInfo,
  AdminSettings,
  ScheduledTaskInfo,
  LibraryCacheStats,
  GifStats,
  HealthStatus,
  UserInfo,
} from '../api/client'
import { showToast } from '../components/Toast'
import ServerChangeModal from '../components/ServerChangeModal'

export default function Admin({ currentUser }: { currentUser: UserInfo }) {
  const [users, setUsers] = useState<AdminUserInfo[]>([])
  const [serverInfo, setServerInfo] = useState<{ configured: boolean; server_name?: string; server_url?: string } | null>(null)
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [tasks, setTasks] = useState<ScheduledTaskInfo[]>([])
  const [cacheStats, setCacheStats] = useState<LibraryCacheStats | null>(null)
  const [runningTask, setRunningTask] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<string | null>(null)
  const [editInterval, setEditInterval] = useState<number>(0)
  const [gifStats, setGifStats] = useState<GifStats | null>(null)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [changeServerOpen, setChangeServerOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersData, serverData, settingsData, tasksData, cacheData, gifData, healthData] = await Promise.all([
        getAdminUsers(),
        getAdminServerInfo(),
        getAdminSettings(),
        getAdminTasks(),
        getLibraryCacheStats(),
        getGifStats(),
        getHealth(),
      ])
      setUsers(usersData)
      setServerInfo(serverData)
      setSettings(settingsData)
      setTasks(tasksData)
      setCacheStats(cacheData)
      setGifStats(gifData)
      setHealth(healthData)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleToggleEnabled = async (userId: string, currentEnabled: boolean) => {
    setUpdating(userId)

    try {
      await updateAdminUser(userId, { enabled: !currentEnabled })
      await loadData()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update user')
    } finally {
      setUpdating(null)
    }
  }

  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    setUpdating(userId)

    try {
      await updateAdminUser(userId, { role: newRole })
      await loadData()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update user')
    } finally {
      setUpdating(null)
    }
  }

  const handleToggleSetting = async (key: keyof AdminSettings) => {
    if (!settings) return
    setSavingSettings(true)

    try {
      const updated = await updateAdminSettings({ [key]: !settings[key] })
      setSettings(updated)
      showToast('Setting saved', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update setting')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleUpdateSetting = async (key: keyof AdminSettings, value: number) => {
    if (!settings) return
    setSavingSettings(true)

    try {
      const updated = await updateAdminSettings({ [key]: value } as Partial<AdminSettings>)
      setSettings(updated)
      showToast('Setting saved', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update setting')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleToggleTask = async (taskId: string, currentEnabled: boolean) => {

    try {
      await updateAdminTask(taskId, { enabled: !currentEnabled })
      await loadData()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update task')
    }
  }

  const handleSaveInterval = async (taskId: string) => {

    try {
      await updateAdminTask(taskId, { interval_minutes: editInterval })
      setEditingTask(null)
      await loadData()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update interval')
    }
  }

  const handleRunNow = async (taskId: string) => {
    setRunningTask(taskId)

    try {
      const runPromise = runAdminTask(taskId)

      if (taskId === 'library_cache_refresh') {
        const pollInterval = setInterval(async () => {
          try {
            const stats = await getLibraryCacheStats()
            setCacheStats(stats)
            if (!stats.refresh_status) {
              clearInterval(pollInterval)
            }
          } catch {
            clearInterval(pollInterval)
          }
        }, 1000)

        await runPromise
        clearInterval(pollInterval)
      } else {
        await runPromise
      }

      await loadData()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to run task')
    } finally {
      setRunningTask(null)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatInterval = (minutes: number) => {
    if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d`
    if (minutes >= 60) return `${Math.floor(minutes / 60)}h`
    return `${minutes}m`
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
  }

  const [clearingCache, setClearingCache] = useState(false)

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect from the Plex server? All users will lose access until you reconnect.')) {
      return
    }
    setDisconnecting(true)
    try {
      await adminDisconnectServer()
      showToast('Server disconnected', 'success')
      await loadData()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  const handleClearDiskCache = async () => {
    setClearingCache(true)

    try {
      await clearDiskCache()
      const stats = await getLibraryCacheStats()
      setCacheStats(stats)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to clear cache')
    } finally {
      setClearingCache(false)
    }
  }

  const handleDeleteAllGifs = async () => {
    setDeletingAll(true)
    try {
      const result = await deleteAllGifs()
      showToast(`Deleted ${result.deleted_records} GIF${result.deleted_records === 1 ? '' : 's'}`, 'success')
      setConfirmDeleteAllOpen(false)
      await loadData()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to delete GIFs')
    } finally {
      setDeletingAll(false)
    }
  }

  const cacheTask = tasks.find(t => t.id === 'library_cache_refresh')
  const maintenanceTasks = tasks.filter(t => t.id !== 'library_cache_refresh')

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-m3-primary"></div>
      </div>
    )
  }

  const healthDotColor = (value: string) => {
    if (value === 'ok' || value === 'connected') return 'bg-m3-success'
    if (value === 'disconnected') return 'bg-m3-outline'
    return 'bg-m3-error'
  }

  const formatRelativeDate = (iso: string): string => {
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return ''
    const diffMs = Date.now() - then
    const days = Math.floor(diffMs / 86_400_000)
    if (days < 1) return 'today'
    if (days === 1) return 'yesterday'
    if (days < 30) return `${days} days ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
    const years = Math.floor(days / 365)
    return `${years} year${years === 1 ? '' : 's'} ago`
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-medium mb-6 text-m3-on-surface">Admin</h1>

      {/* System */}
      <h2 className="text-xl font-medium mb-4 text-m3-on-surface">System</h2>
      <div className="bg-m3-surface-container rounded-md p-6 mb-8 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-m3-on-surface-variant">Version</p>
            <div className="flex items-center gap-2 flex-wrap">
              <p
                className="text-m3-on-surface font-medium"
                title={
                  health?.version_published_at
                    ? `Released ${new Date(health.version_published_at).toLocaleDateString()}`
                    : undefined
                }
              >
                {health ? `v${health.version}` : '—'}
                {health?.version_published_at && (
                  <span className="ml-1 text-xs font-normal text-m3-on-surface-variant">
                    · released {formatRelativeDate(health.version_published_at)}
                  </span>
                )}
              </p>
              {health?.update_available && health.latest_version && (
                <a
                  href="https://github.com/Reggio-Digital/clipmark/releases/latest"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-m3-primary-container text-m3-on-primary-container px-2 py-0.5 text-xs font-medium hover:brightness-110 transition-all"
                  title={
                    health.latest_version_published_at
                      ? `Released ${new Date(health.latest_version_published_at).toLocaleDateString()}`
                      : `Update to v${health.latest_version}`
                  }
                >
                  v{health.latest_version} available
                  {health.latest_version_published_at && (
                    <span className="ml-1 opacity-80">· {formatRelativeDate(health.latest_version_published_at)}</span>
                  )}
                </a>
              )}
            </div>
          </div>
          <div>
            <p className="text-sm text-m3-on-surface-variant">Database</p>
            <div className="flex items-center gap-2">
              {health && <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${healthDotColor(health.database)}`}></div>}
              <p className="text-m3-on-surface font-medium capitalize">{health ? health.database : '—'}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-m3-outline-variant pt-4 flex items-center justify-between gap-3">
          {serverInfo?.configured ? (
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-3 h-3 rounded-full shrink-0 ${health ? healthDotColor(health.plex) : 'bg-m3-success'}`}></div>
              <span className="text-m3-on-surface truncate">Connected to <strong>{serverInfo.server_name}</strong></span>
            </div>
          ) : (
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-3 h-3 bg-m3-outline rounded-full shrink-0"></div>
              <span className="text-m3-on-surface-variant">No server connected</span>
            </div>
          )}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setChangeServerOpen(true)}
              className="text-base px-3 py-1.5 bg-m3-primary-container hover:brightness-110 text-m3-on-primary-container rounded-full transition-all"
            >
              {serverInfo?.configured ? 'Change Server' : 'Connect Server'}
            </button>
            {serverInfo?.configured && (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-base px-3 py-1.5 bg-m3-error-container hover:brightness-110 text-m3-on-error-container rounded-full disabled:opacity-50 transition-all"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            )}
          </div>
        </div>
      </div>
      <ServerChangeModal
        open={changeServerOpen}
        onClose={() => setChangeServerOpen(false)}
        onSuccess={(name) => {
          setChangeServerOpen(false)
          showToast(`Connected to ${name}`, 'success')
          loadData()
        }}
      />

      {/* Settings */}
      <h2 className="text-xl font-medium mb-4 text-m3-on-surface">Settings</h2>
      <div className="bg-m3-surface-container rounded-md p-6 mb-8 space-y-4">
        {settings && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-m3-on-surface">GIPHY Integration</p>
                <p className="text-base text-m3-on-surface-variant">Allow users to configure GIPHY API keys and upload GIFs</p>
              </div>
              <button
                onClick={() => handleToggleSetting('giphy_global_enabled')}
                disabled={savingSettings}
                className={`relative inline-flex h-8 w-[52px] items-center rounded-full transition-colors disabled:opacity-50 ${
                  settings.giphy_global_enabled ? 'bg-m3-primary' : 'bg-m3-surface-container-highest'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full transition-transform ${
                    settings.giphy_global_enabled ? 'translate-x-[26px] bg-m3-on-primary' : 'translate-x-[2px] bg-m3-outline'
                  }`}
                />
              </button>
            </div>
            <div className="border-t border-m3-outline-variant pt-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-m3-on-surface">Public Sharing</p>
                <p className="text-base text-m3-on-surface-variant">Allow users to create shareable links for their GIFs</p>
              </div>
              <button
                onClick={() => handleToggleSetting('public_sharing_enabled')}
                disabled={savingSettings}
                className={`relative inline-flex h-8 w-[52px] items-center rounded-full transition-colors disabled:opacity-50 ${
                  settings.public_sharing_enabled ? 'bg-m3-primary' : 'bg-m3-surface-container-highest'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full transition-transform ${
                    settings.public_sharing_enabled ? 'translate-x-[26px] bg-m3-on-primary' : 'translate-x-[2px] bg-m3-outline'
                  }`}
                />
              </button>
            </div>
          </>
        )}
      </div>

      {/* GIF Settings */}
      <h2 className="text-xl font-medium mb-4 text-m3-on-surface">GIF Settings</h2>
      <div className="bg-m3-surface-container rounded-md p-6 mb-8 space-y-4">
        <div className="bg-m3-surface-container-high/50 rounded-sm px-4 py-3 text-base text-m3-on-surface-variant">
          <p className="font-medium text-m3-on-surface mb-1">Recommended defaults for sharing</p>
          <p>480px width, 10 fps, 15s duration, lossy 100 keeps most GIFs under 5-8 MB — ideal for Discord, GIPHY, and messaging apps. Higher values produce larger files that may not embed or upload reliably.</p>
        </div>
        {settings && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-m3-on-surface">Max Duration</p>
                <p className="text-base text-m3-on-surface-variant">Maximum GIF length in seconds (1-60)</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={settings.max_gif_duration_seconds}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 1
                    setSettings({ ...settings, max_gif_duration_seconds: v })
                  }}
                  onBlur={(e) => handleUpdateSetting('max_gif_duration_seconds', parseInt(e.target.value) || 1)}
                  disabled={savingSettings}
                  className="w-20 bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-3 py-1.5 text-base text-right text-m3-on-surface disabled:opacity-50 focus:border-m3-primary focus:outline-none transition-colors"
                />
                <span className="text-base text-m3-on-surface-variant">sec</span>
              </div>
            </div>
            <div className="border-t border-m3-outline-variant pt-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-m3-on-surface">GIF Width</p>
                <p className="text-base text-m3-on-surface-variant">Output width in pixels for all generated GIFs (100-640)</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="100"
                  max="640"
                  step="10"
                  value={settings.max_width}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 100
                    setSettings({ ...settings, max_width: v })
                  }}
                  onBlur={(e) => handleUpdateSetting('max_width', parseInt(e.target.value) || 100)}
                  disabled={savingSettings}
                  className="w-20 bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-3 py-1.5 text-base text-right text-m3-on-surface disabled:opacity-50 focus:border-m3-primary focus:outline-none transition-colors"
                />
                <span className="text-base text-m3-on-surface-variant">px</span>
              </div>
            </div>
            <div className="border-t border-m3-outline-variant pt-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-m3-on-surface">GIF Frame Rate</p>
                <p className="text-base text-m3-on-surface-variant">Frames per second for all generated GIFs (5-15)</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="15"
                  value={settings.max_fps}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 5
                    setSettings({ ...settings, max_fps: v })
                  }}
                  onBlur={(e) => handleUpdateSetting('max_fps', parseInt(e.target.value) || 5)}
                  disabled={savingSettings}
                  className="w-20 bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-3 py-1.5 text-base text-right text-m3-on-surface disabled:opacity-50 focus:border-m3-primary focus:outline-none transition-colors"
                />
                <span className="text-base text-m3-on-surface-variant">fps</span>
              </div>
            </div>
            <div className="border-t border-m3-outline-variant pt-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-m3-on-surface">Gifsicle Optimization</p>
                <p className="text-base text-m3-on-surface-variant">Reduces GIF file sizes by 20-40% for faster loading</p>
              </div>
              <button
                onClick={() => handleToggleSetting('gifsicle_enabled')}
                disabled={savingSettings}
                className={`relative inline-flex h-8 w-[52px] items-center rounded-full transition-colors disabled:opacity-50 ${
                  settings.gifsicle_enabled ? 'bg-m3-primary' : 'bg-m3-surface-container-highest'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full transition-transform ${
                    settings.gifsicle_enabled ? 'translate-x-[26px] bg-m3-on-primary' : 'translate-x-[2px] bg-m3-outline'
                  }`}
                />
              </button>
            </div>
            {settings.gifsicle_enabled && (
              <div className="border-t border-m3-outline-variant pt-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-m3-on-surface">Lossy Compression</p>
                  <p className="text-base text-m3-on-surface-variant">Compression level (0-200). Recommended: 80-120</p>
                </div>
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={settings.gifsicle_lossy}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(200, Number(e.target.value) || 0))
                    setSettings({ ...settings, gifsicle_lossy: v })
                  }}
                  onBlur={(e) => handleUpdateSetting('gifsicle_lossy', Math.max(0, Math.min(200, Number(e.target.value) || 0)))}
                  disabled={savingSettings}
                  className="w-20 bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-3 py-1.5 text-base text-right text-m3-on-surface disabled:opacity-50 focus:border-m3-primary focus:outline-none transition-colors"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Library Cache */}
      <h2 className="text-xl font-medium mb-4 text-m3-on-surface">Library Cache</h2>
      <div className="bg-m3-surface-container rounded-md p-6 mb-8">
        {cacheStats && cacheTask && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {cacheStats.refresh_status ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-m3-primary"></div>
                ) : (
                  <div className={`w-3 h-3 rounded-full ${cacheStats.populated ? 'bg-m3-success' : 'bg-m3-outline'}`}></div>
                )}
                <span className="font-medium text-m3-on-surface">
                  {cacheStats.refresh_status
                    ? cacheStats.refresh_status
                    : cacheStats.populated
                      ? `${cacheStats.library_count} ${cacheStats.library_count === 1 ? 'library' : 'libraries'}, ${cacheStats.total_items.toLocaleString()} items cached`
                      : 'Not populated'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleRunNow('library_cache_refresh')}
                  disabled={runningTask === 'library_cache_refresh' || cacheTask.status === 'running'}
                  className="text-base px-3 py-1.5 bg-m3-primary-container hover:brightness-110 text-m3-on-primary-container rounded-full disabled:opacity-50 transition-all"
                >
                  {runningTask === 'library_cache_refresh' ? 'Refreshing...' : 'Refresh Now'}
                </button>
                <button
                  onClick={() => handleToggleTask('library_cache_refresh', cacheTask.enabled)}
                  className={`relative inline-flex h-8 w-[52px] items-center rounded-full transition-colors ${
                    cacheTask.enabled ? 'bg-m3-primary' : 'bg-m3-surface-container-highest'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full transition-transform ${
                      cacheTask.enabled ? 'translate-x-[26px] bg-m3-on-primary' : 'translate-x-[2px] bg-m3-outline'
                    }`}
                  />
                </button>
              </div>
            </div>

            {cacheStats.libraries.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {cacheStats.libraries.map((lib) => (
                  <div key={lib.id} className="bg-m3-surface-container-high/50 rounded-sm px-3 py-2">
                    <p className="text-base font-medium truncate text-m3-on-surface">{lib.title}</p>
                    <p className="text-base text-m3-on-surface-variant">{lib.item_count.toLocaleString()} {lib.type === 'movie' ? 'movies' : 'shows'}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-base text-m3-on-surface-variant border-t border-m3-outline-variant pt-3">
              <span>
                Refreshes{' '}
                {editingTask === 'library_cache_refresh' ? (
                  <span className="inline-flex items-center gap-1.5">
                    every{' '}
                    <input
                      type="number"
                      min="1"
                      value={editInterval}
                      onChange={(e) => setEditInterval(parseInt(e.target.value) || 1)}
                      className="w-20 bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-2 py-0.5 text-base text-m3-on-surface focus:border-m3-primary focus:outline-none transition-colors"
                    />
                    min
                    <button
                      onClick={() => handleSaveInterval('library_cache_refresh')}
                      className="text-base px-2 py-0.5 bg-m3-primary-container text-m3-on-primary-container rounded-full ml-1 hover:brightness-110 transition-all"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingTask(null)}
                      className="text-base px-2 py-0.5 bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface rounded-full transition-colors"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => { setEditingTask('library_cache_refresh'); setEditInterval(cacheTask.interval_minutes) }}
                    className="text-m3-on-surface hover:text-m3-primary transition-colors"
                  >
                    every {formatInterval(cacheTask.interval_minutes)}
                  </button>
                )}
              </span>
              <span>Last: {formatDate(cacheTask.last_run_at)}</span>
              <span>Next: {formatDate(cacheTask.next_run_at)}</span>
            </div>

            {cacheTask.last_error && (
              <p className="text-base text-m3-error">Error: {cacheTask.last_error}</p>
            )}
          </div>
        )}
      </div>

      {/* Maintenance Tasks */}
      <h2 className="text-xl font-medium mb-4 text-m3-on-surface">Maintenance Tasks</h2>
      <div className="bg-m3-surface-container rounded-md p-6 mb-8 space-y-4">
        {maintenanceTasks.map((task, i) => (
          <div key={task.id} className={`${i > 0 ? 'border-t border-m3-outline-variant pt-4' : ''} ${!task.enabled ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-m3-on-surface">{task.name}</p>
                {task.description && <p className="text-base text-m3-outline mt-0.5">{task.description}</p>}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleRunNow(task.id)}
                  disabled={runningTask === task.id || task.status === 'running'}
                  className="text-base px-3 py-1.5 bg-m3-primary-container hover:brightness-110 text-m3-on-primary-container rounded-full disabled:opacity-50 transition-all"
                >
                  {runningTask === task.id ? 'Running...' : 'Run Now'}
                </button>
                <button
                  onClick={() => handleToggleTask(task.id, task.enabled)}
                  className={`relative inline-flex h-8 w-[52px] items-center rounded-full transition-colors ${
                    task.enabled ? 'bg-m3-primary' : 'bg-m3-surface-container-highest'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full transition-transform ${
                      task.enabled ? 'translate-x-[26px] bg-m3-on-primary' : 'translate-x-[2px] bg-m3-outline'
                    }`}
                  />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-base text-m3-on-surface-variant mt-1">
              <span>
                Runs{' '}
                {editingTask === task.id ? (
                  <span className="inline-flex items-center gap-1.5">
                    every{' '}
                    <input
                      type="number"
                      min="1"
                      value={editInterval}
                      onChange={(e) => setEditInterval(parseInt(e.target.value) || 1)}
                      className="w-20 bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-2 py-0.5 text-base text-m3-on-surface focus:border-m3-primary focus:outline-none transition-colors"
                    />
                    min
                    <button
                      onClick={() => handleSaveInterval(task.id)}
                      className="text-base px-2 py-0.5 bg-m3-primary-container text-m3-on-primary-container rounded-full ml-1 hover:brightness-110 transition-all"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingTask(null)}
                      className="text-base px-2 py-0.5 bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface rounded-full transition-colors"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => { setEditingTask(task.id); setEditInterval(task.interval_minutes) }}
                    className="text-m3-on-surface hover:text-m3-primary transition-colors"
                  >
                    every {formatInterval(task.interval_minutes)}
                  </button>
                )}
              </span>
              <span>Last: {formatDate(task.last_run_at)}</span>
              <span>Next: {formatDate(task.next_run_at)}</span>
            </div>
            {task.last_error && (
              <p className="text-base text-m3-error mt-1">Error: {task.last_error}</p>
            )}
          </div>
        ))}

        {cacheStats && (
          <div className="border-t border-m3-outline-variant pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-m3-on-surface">Disk Cache</p>
                <p className="text-base text-m3-outline mt-0.5">Thumbnails, frames, previews, and subtitles cached on disk</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleClearDiskCache}
                  disabled={clearingCache || cacheStats.disk_usage_bytes === 0}
                  className="text-base px-3 py-1.5 bg-m3-primary-container hover:brightness-110 text-m3-on-primary-container rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {clearingCache ? 'Clearing...' : 'Clear Now'}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-base text-m3-on-surface-variant mt-1">
              <span>Disk usage: <span className="text-m3-on-surface">{formatBytes(cacheStats.disk_usage_bytes)}</span></span>
            </div>
          </div>
        )}

        {gifStats && (
          <div className="border-t border-m3-outline-variant pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-m3-on-surface">GIF Storage</p>
                <p className="text-base text-m3-outline mt-0.5">Permanently delete every user's generated GIFs and output files</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setConfirmDeleteAllOpen(true)}
                  disabled={gifStats.total_gifs === 0 && gifStats.failed_gifs === 0}
                  className="text-base px-3 py-1.5 bg-m3-error hover:brightness-110 text-m3-on-error rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Delete All
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-base text-m3-on-surface-variant mt-1">
              <span>GIFs created: <span className="text-m3-on-surface">{gifStats.total_gifs.toLocaleString()}</span></span>
              <span>Total size: <span className="text-m3-on-surface">{formatBytes(gifStats.total_size_bytes)}</span></span>
              <span>Failed: <span className={gifStats.failed_gifs > 0 ? 'text-m3-error' : 'text-m3-on-surface'}>{gifStats.failed_gifs.toLocaleString()}</span></span>
            </div>
          </div>
        )}
      </div>

      {/* Users */}
      <h2 className="text-xl font-medium mb-4 text-m3-on-surface">Users ({users.length})</h2>
      <div className="bg-m3-surface-container rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-m3-outline-variant">
                <th className="text-left px-4 py-3 text-base text-m3-on-surface-variant font-medium">User</th>
                <th className="text-left px-4 py-3 text-base text-m3-on-surface-variant font-medium">GIFs</th>
                <th className="text-left px-4 py-3 text-base text-m3-on-surface-variant font-medium">Last Login</th>
                <th className="text-left px-4 py-3 text-base text-m3-on-surface-variant font-medium">Status</th>
                <th className="text-right px-4 py-3 text-base text-m3-on-surface-variant font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={`border-b border-m3-outline-variant last:border-0 ${!user.enabled ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.thumb ? (
                        <img src={user.thumb} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-m3-surface-container-highest flex items-center justify-center text-base text-m3-on-surface">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-base text-m3-on-surface">{user.username}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          user.role === 'admin' ? 'bg-m3-primary-container text-m3-on-primary-container' : 'bg-m3-surface-container-high text-m3-on-surface'
                        }`}>
                          {user.role}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-base text-m3-on-surface">{user.gif_count}</td>
                  <td className="px-4 py-3 text-base text-m3-on-surface-variant">{formatDate(user.last_login)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-base ${user.enabled ? 'text-m3-success' : 'text-m3-error'}`}>
                      {user.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      {user.id === currentUser.id ? (
                        <span className="text-xs text-m3-on-surface-variant italic">You</span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleToggleRole(user.id, user.role)}
                            disabled={updating === user.id}
                            className="text-xs px-2.5 py-1 bg-m3-surface-container-high hover:bg-m3-surface-container-highest disabled:opacity-50 rounded-full text-m3-on-surface transition-colors"
                          >
                            {user.role === 'admin' ? 'Make User' : 'Make Admin'}
                          </button>
                          <button
                            onClick={() => handleToggleEnabled(user.id, user.enabled)}
                            disabled={updating === user.id}
                            className={`text-xs px-2.5 py-1 rounded-full disabled:opacity-50 transition-all ${
                              user.enabled
                                ? 'bg-m3-error-container hover:brightness-110 text-m3-on-error-container'
                                : 'bg-m3-success-container hover:brightness-110 text-m3-success'
                            }`}
                          >
                            {user.enabled ? 'Disable' : 'Enable'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirmDeleteAllOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !deletingAll && setConfirmDeleteAllOpen(false)}
        >
          <div
            className="bg-m3-surface-container rounded-xl p-6 shadow-elevation-3 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-medium text-m3-error">Delete all GIFs?</h2>
              <button
                onClick={() => setConfirmDeleteAllOpen(false)}
                disabled={deletingAll}
                className="text-m3-on-surface-variant hover:text-m3-on-surface text-2xl leading-none disabled:opacity-50"
              >
                ×
              </button>
            </div>
            <p className="text-base text-m3-on-surface mb-2">
              This will permanently delete{' '}
              <span className="font-medium">
                {gifStats?.total_gifs.toLocaleString() ?? 0} GIF
                {gifStats?.total_gifs === 1 ? '' : 's'}
              </span>
              {gifStats && gifStats.failed_gifs > 0 && (
                <> and {gifStats.failed_gifs.toLocaleString()} failed record{gifStats.failed_gifs === 1 ? '' : 's'}</>
              )}{' '}
              from every user, along with their output files.
            </p>
            <p className="text-base text-m3-error mb-5 font-medium">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteAllOpen(false)}
                disabled={deletingAll}
                className="text-base px-4 py-2 bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface rounded-full disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAllGifs}
                disabled={deletingAll}
                className="text-base px-4 py-2 bg-m3-error hover:brightness-110 text-m3-on-error rounded-full disabled:opacity-50 transition-all font-medium"
              >
                {deletingAll ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
