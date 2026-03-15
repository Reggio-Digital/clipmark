const BASE_URL = ''

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json()
}

// Types
export interface UserInfo {
  id: string
  username: string
  email?: string
  thumb?: string
  role: string // "admin" | "user"
  giphy_configured: boolean
}

export interface AuthStatus {
  authenticated: boolean
  needs_setup: boolean
  user?: UserInfo
}

export interface SetupStatus {
  needs_setup: boolean
  configured: boolean
  server_name?: string
}

export interface AuthInitResponse {
  auth_url: string
  pin_id: string
}

export interface AuthCheckResponse {
  complete: boolean
  token?: string
}

export interface ServerConnection {
  uri: string
  local: boolean
}

export interface Server {
  id: string
  name: string
  connections: ServerConnection[]
}

export interface PlexLoginResponse {
  success: boolean
  needs_server_selection: boolean
  servers?: Server[]
  pin_id?: string
  user?: UserInfo
}

export interface Library {
  id: string
  title: string
  type: string
}

export interface MediaItem {
  id: string
  title: string
  type: string
  thumb_url: string
  duration_ms?: number
  show_title?: string
  season?: number
  episode?: number
  year?: number
  added_at?: string
}

export interface ShowDetail {
  id: string
  title: string
  thumb_url: string
  year?: number
  season_count: number
}

export interface Season {
  index: number
  title: string
  episode_count: number
  thumb_url?: string
}

export interface SearchResult {
  id: string
  title: string
  type: string
  year?: number
  thumb_url: string
}

export interface SubtitleTrack {
  index: number
  language: string
  title?: string
  format: string
}

export interface SubtitleLine {
  index: number
  start_ms: number
  end_ms: number
  text: string
}

export interface MediaDetail {
  id: string
  title: string
  type: string
  thumb_url: string
  duration_ms: number
  show_title?: string
  season?: number
  episode?: number
  year?: number
  imdb_id?: string
  tvdb_id?: string
  tmdb_id?: string
  subtitle_tracks: SubtitleTrack[]
}

export interface GifCreate {
  media_id: string
  start_ms: number
  end_ms: number
  include_subtitles?: boolean
  subtitle_index?: number
  custom_text?: string
  text_position?: string
  text_size?: string
}

export interface Gif {
  id: string
  user_id?: string
  media_id: string
  media_title: string
  media_type?: string
  show_title?: string
  season?: number
  episode?: number
  year?: number
  imdb_id?: string
  tvdb_id?: string
  tmdb_id?: string
  start_ms: number
  end_ms: number
  width: number
  fps: number
  include_subtitles: boolean
  subtitle_index?: number
  custom_text?: string
  text_position?: string
  text_size?: string
  status: string
  progress: number
  filename?: string
  size_bytes?: number
  error?: string
  created_at: string
  completed_at?: string
  giphy_id?: string
  giphy_url?: string
  uploaded_at?: string
  public_token?: string
}

export interface ShareResponse {
  public_token: string
  public_url: string
}

export interface FeatureFlags {
  public_sharing_enabled: boolean
  giphy_global_enabled: boolean
  browse_page_size: number
}

export interface AdminSettings {
  public_sharing_enabled: boolean
  giphy_global_enabled: boolean
  gifsicle_enabled: boolean
  gifsicle_lossy: number
  max_gif_duration_seconds: number
  max_width: number
  max_fps: number
  browse_page_size: number
}

export interface PublicGif {
  media_title: string
  show_title?: string
  season?: number
  episode?: number
  year?: number
  imdb_id?: string
  tvdb_id?: string
  tmdb_id?: string
  filename: string
  size_bytes?: number
  start_ms: number
  end_ms: number
  created_at: string
}

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  page_size: number
  total_items: number
}

export interface GiphyConfigStatus {
  configured: boolean
}

export interface GiphyUploadResponse {
  giphy_id: string
  giphy_url: string
}

export interface AdminUserInfo {
  id: string
  username: string
  email?: string
  thumb?: string
  role: string
  enabled: boolean
  created_at: string
  last_login?: string
  gif_count: number
}

export interface ScheduledTaskInfo {
  id: string
  name: string
  description?: string
  interval_minutes: number
  enabled: boolean
  status: string // "idle" | "running"
  last_run_at?: string
  next_run_at?: string
  last_error?: string
}

export interface ScheduledTaskUpdate {
  interval_minutes?: number
  enabled?: boolean
}

export interface CachedLibraryInfo {
  id: string
  title: string
  type: string
  item_count: number
}

export interface LibraryCacheStats {
  populated: boolean
  library_count: number
  total_items: number
  last_refreshed?: string
  refresh_status?: string
  disk_usage_bytes: number
  libraries: CachedLibraryInfo[]
}

export interface FavoriteCreate {
  media_id: string
  media_type: string
  media_title: string
  thumb_url: string
  year?: number
  show_title?: string
  season?: number
  episode?: number
}

export interface FavoriteResponse {
  id: string
  user_id: string
  media_id: string
  media_type: string
  media_title: string
  thumb_url: string
  year?: number
  show_title?: string
  season?: number
  episode?: number
  created_at: string
}

// Auth
export const getAuthStatus = () => fetchJson<AuthStatus>('/api/auth/status')
export const initiatePlexAuth = () => fetchJson<AuthInitResponse>('/api/auth/plex/initiate', { method: 'POST' })
export const checkPlexAuth = (pinId: string) => fetchJson<AuthCheckResponse>(`/api/auth/plex/check?pin_id=${pinId}`)
export const plexLogin = (pinId: string) =>
  fetchJson<PlexLoginResponse>('/api/auth/plex/login', {
    method: 'POST',
    body: JSON.stringify({ pin_id: pinId }),
  })
export const setupSelectServer = (pinId: string, serverId: string, connectionUri?: string) =>
  fetchJson<{ success: boolean; user: UserInfo; server_name: string }>(
    `/api/auth/setup/select-server?pin_id=${pinId}`,
    {
      method: 'POST',
      body: JSON.stringify({ server_id: serverId, connection_uri: connectionUri }),
    }
  )
export const logout = () => fetchJson<{ success: boolean }>('/api/auth/logout', { method: 'POST' })

// Setup
export const getSetupStatus = () => fetchJson<SetupStatus>('/api/setup/status')

// Search
export const search = (query: string, libraryId?: string, type?: string, limit = 25) => {
  const params = new URLSearchParams({ query, limit: String(limit) })
  if (libraryId) params.set('library_id', libraryId)
  if (type) params.set('type', type)
  return fetchJson<SearchResult[]>(`/api/search?${params}`)
}

// Media
export const getLibraries = () => fetchJson<Library[]>('/api/libraries')
export const getLibraryItems = (libraryId: string, page = 1, pageSize = 50, sort = 'added') =>
  fetchJson<PaginatedResponse<MediaItem>>(`/api/libraries/${libraryId}/items?page=${page}&page_size=${pageSize}&sort=${sort}`)
export const getShow = (showId: string) => fetchJson<ShowDetail>(`/api/shows/${showId}`)
export const getSeasons = (showId: string) => fetchJson<Season[]>(`/api/shows/${showId}/seasons`)
export const getEpisodes = (showId: string, season: number, page = 1, pageSize = 50) =>
  fetchJson<PaginatedResponse<MediaItem>>(`/api/shows/${showId}/episodes?season=${season}&page=${page}&page_size=${pageSize}`)
export const getMedia = (mediaId: string) => fetchJson<MediaDetail>(`/api/media/${mediaId}`)
export const getSubtitles = (mediaId: string, index: number) => fetchJson<SubtitleLine[]>(`/api/media/${mediaId}/subtitles/${index}`)
export const getFrameUrl = (mediaId: string, ts: number, width = 480) => `/api/media/${mediaId}/frame?ts=${ts}&width=${width}`
export const createPreview = (
  mediaId: string,
  startMs: number,
  endMs: number,
  subtitleIndex?: number,
  customText?: string,
  textPosition?: string,
  textSize?: string,
) =>
  fetchJson<{ url: string }>(`/api/media/${mediaId}/preview`, {
    method: 'POST',
    body: JSON.stringify({
      start_ms: startMs,
      end_ms: endMs,
      subtitle_index: subtitleIndex,
      custom_text: customText,
      text_position: textPosition,
      text_size: textSize,
    }),
  })

// GIFs
export const createGif = (data: GifCreate) => fetchJson<Gif>('/api/gifs', { method: 'POST', body: JSON.stringify(data) })
export const getGif = (gifId: string) => fetchJson<Gif>(`/api/gifs/${gifId}`)
export const listGifs = (status = 'complete', page = 1, pageSize = 50, search = '', sort = 'newest') => {
  const params = new URLSearchParams({ status, page: String(page), page_size: String(pageSize), sort })
  if (search) params.set('search', search)
  return fetchJson<PaginatedResponse<Gif>>(`/api/gifs?${params}`)
}
export const deleteGif = (gifId: string) => fetchJson<void>(`/api/gifs/${gifId}`, { method: 'DELETE' })

export interface GifProgressEvent {
  status: string
  progress: number
  error?: string
  filename?: string
  size_bytes?: number
}

export function watchGifProgress(gifId: string, onUpdate: (event: GifProgressEvent) => void): () => void {
  const eventSource = new EventSource(`/api/gifs/${gifId}/progress`)
  eventSource.onmessage = (e) => {
    const raw = JSON.parse(e.data)
    const event: GifProgressEvent = {
      status: raw.status,
      progress: raw.progress,
      ...(raw.error != null && { error: raw.error }),
      ...(raw.filename != null && { filename: raw.filename }),
      ...(raw.size_bytes != null && { size_bytes: raw.size_bytes }),
    }
    onUpdate(event)
  }
  eventSource.onerror = () => {
    eventSource.close()
  }
  return () => eventSource.close()
}
export const uploadToGiphy = (gifId: string) => fetchJson<GiphyUploadResponse>(`/api/gifs/${gifId}/upload`, { method: 'POST' })

// Sharing
export const shareGif = (gifId: string) => fetchJson<ShareResponse>(`/api/gifs/${gifId}/share`, { method: 'POST' })
export const unshareGif = (gifId: string) => fetchJson<void>(`/api/gifs/${gifId}/share`, { method: 'DELETE' })
export const getSharedGif = (token: string) => fetchJson<PublicGif>(`/api/shared/${token}`)
export const getSharedGifFileUrl = (token: string) => `/api/shared/${token}/file`

// Feature flags
export const getFeatureFlags = () => fetchJson<FeatureFlags>('/api/setup/features')

// Giphy Setup (per-user)
export const getGiphyStatus = () => fetchJson<GiphyConfigStatus>('/api/setup/giphy/status')
export const configureGiphy = (apiKey: string) =>
  fetchJson<{ success: boolean }>('/api/setup/giphy', {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey }),
  })
export const removeGiphyConfig = () => fetchJson<{ success: boolean }>('/api/setup/giphy', { method: 'DELETE' })

// Gifsicle Settings
export interface GifsicleSettings {
  enabled: boolean
  lossy: number
}
export const getGifsicleSettings = () => fetchJson<GifsicleSettings>('/api/setup/gifsicle')
export const updateGifsicleSettings = (settings: Partial<GifsicleSettings>) =>
  fetchJson<GifsicleSettings>('/api/setup/gifsicle', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })

// Admin
export const getAdminUsers = () => fetchJson<AdminUserInfo[]>('/api/admin/users')
export const updateAdminUser = (userId: string, update: { enabled?: boolean; role?: string }) =>
  fetchJson<{ success: boolean }>(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
export const getAdminServerInfo = () => fetchJson<{ configured: boolean; server_name?: string; server_url?: string }>('/api/admin/server')
export const adminDisconnectServer = () => fetchJson<{ success: boolean }>('/api/admin/server/disconnect', { method: 'POST' })
export const getAdminSettings = () => fetchJson<AdminSettings>('/api/admin/settings')
export const updateAdminSettings = (settings: Partial<AdminSettings>) =>
  fetchJson<AdminSettings>('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })

// Admin Cache, Stats & Tasks
export const getLibraryCacheStats = () => fetchJson<LibraryCacheStats>('/api/admin/cache/stats')
export const clearDiskCache = () => fetchJson<{ success: boolean }>('/api/admin/cache/disk', { method: 'DELETE' })
export interface GifStats {
  total_gifs: number
  total_size_bytes: number
  failed_gifs: number
}
export const getGifStats = () => fetchJson<GifStats>('/api/admin/stats')
export const getAdminTasks = () => fetchJson<ScheduledTaskInfo[]>('/api/admin/tasks')
export const updateAdminTask = (taskId: string, update: ScheduledTaskUpdate) =>
  fetchJson<ScheduledTaskInfo>(`/api/admin/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
export const runAdminTask = (taskId: string) =>
  fetchJson<{ success: boolean }>(`/api/admin/tasks/${taskId}/run`, { method: 'POST' })

// Favorites
export const getFavoriteIds = () => fetchJson<string[]>('/api/favorites/ids')
export const addFavorite = (data: FavoriteCreate) =>
  fetchJson<FavoriteResponse>('/api/favorites', { method: 'POST', body: JSON.stringify(data) })
export const removeFavorite = (mediaId: string) =>
  fetchJson<void>(`/api/favorites/${mediaId}`, { method: 'DELETE' })
export const listFavorites = (page = 1, pageSize = 50, mediaType?: string) => {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (mediaType) params.set('media_type', mediaType)
  return fetchJson<PaginatedResponse<FavoriteResponse>>(`/api/favorites?${params}`)
}
