import { useState, useEffect } from 'react'
import {
  getAdminUsers,
  updateAdminUser,
  getAdminServerInfo,
  getAdminSettings,
  updateAdminSettings,
  getAdminTasks,
  updateAdminTask,
  runAdminTask,
  getLibraryCacheStats,
  clearDiskCache,
  getGifStats,
  AdminUserInfo,
  AdminSettings,
  ScheduledTaskInfo,
  LibraryCacheStats,
  GifStats,
} from '../api/client'
import { showToast } from '../components/Toast'

export default function Admin() {
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

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersData, serverData, settingsData, tasksData, cacheData, gifData] = await Promise.all([
        getAdminUsers(),
        getAdminServerInfo(),
        getAdminSettings(),
        getAdminTasks(),
        getLibraryCacheStats(),
        getGifStats(),
      ])
      setUsers(usersData)
      setServerInfo(serverData)
      setSettings(settingsData)
      setTasks(tasksData)
      setCacheStats(cacheData)
      setGifStats(gifData)
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

  const cacheTask = tasks.find(t => t.id === 'library_cache_refresh')
  const maintenanceTasks = tasks.filter(t => t.id !== 'library_cache_refresh')

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-m3-primary"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-medium mb-6 text-m3-on-surface">Admin</h1>

      {/* Server Info */}
      <h2 className="text-xl font-medium mb-4 text-m3-on-surface">Server</h2>
      <div className="bg-m3-surface-container rounded-md p-6 mb-8">
        {serverInfo?.configured ? (
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-m3-success rounded-full"></div>
            <span className="text-m3-on-surface">Connected to <strong>{serverInfo.server_name}</strong></span>
          </div>
        ) : (
          <p className="text-m3-on-surface-variant">No server connected</p>
        )}
      </div>

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

      {/* Browse Settings */}
      <h2 className="text-xl font-medium mb-4 text-m3-on-surface">Browse Settings</h2>
      <div className="bg-m3-surface-container rounded-md p-6 mb-8 space-y-4">
        {settings && (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-m3-on-surface">Items Per Page</p>
              <p className="text-base text-m3-on-surface-variant">Number of items shown per page when browsing libraries (12-100)</p>
            </div>
            <input
              type="number"
              min="12"
              max="100"
              value={settings.browse_page_size}
              onChange={(e) => {
                const v = parseInt(e.target.value) || 48
                setSettings({ ...settings, browse_page_size: v })
              }}
              onBlur={(e) => handleUpdateSetting('browse_page_size', parseInt(e.target.value) || 48)}
              disabled={savingSettings}
              className="w-20 bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-3 py-1.5 text-base text-right text-m3-on-surface disabled:opacity-50 focus:border-m3-primary focus:outline-none transition-colors"
            />
          </div>
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

            <div className="flex items-center justify-between text-base text-m3-on-surface-variant border-t border-m3-outline-variant pt-3">
              <span>Disk usage: {formatBytes(cacheStats.disk_usage_bytes)} (thumbnails, frames, previews)</span>
              {cacheStats.disk_usage_bytes > 0 && (
                <button
                  onClick={handleClearDiskCache}
                  disabled={clearingCache}
                  className="text-base px-3 py-1 bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface rounded-full disabled:opacity-50 transition-colors"
                >
                  {clearingCache ? 'Clearing...' : 'Clear'}
                </button>
              )}
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
      </div>

      {/* Stats */}
      <h2 className="text-xl font-medium mb-4 text-m3-on-surface">Stats</h2>
      <div className="bg-m3-surface-container rounded-md p-6 mb-8">
        {gifStats && (
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-2xl font-medium text-m3-primary">{gifStats.total_gifs.toLocaleString()}</p>
              <p className="text-base text-m3-on-surface-variant">GIFs created</p>
            </div>
            <div>
              <p className="text-2xl font-medium text-m3-primary">{formatBytes(gifStats.total_size_bytes)}</p>
              <p className="text-base text-m3-on-surface-variant">Total size</p>
            </div>
            <div>
              <p className="text-2xl font-medium text-m3-error">{gifStats.failed_gifs.toLocaleString()}</p>
              <p className="text-base text-m3-on-surface-variant">Failed</p>
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
                <th className="text-left px-4 py-3 text-base text-m3-on-surface-variant font-medium">Role</th>
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
                      <div>
                        <p className="font-medium text-base text-m3-on-surface">{user.username}</p>
                        {user.email && <p className="text-xs text-m3-outline">{user.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-base px-2.5 py-0.5 rounded-full ${
                      user.role === 'admin' ? 'bg-m3-primary-container text-m3-on-primary-container' : 'bg-m3-surface-container-high text-m3-on-surface'
                    }`}>
                      {user.role}
                    </span>
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
