import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  getMedia,
  getSubtitles,
  createGif,
  getGif,
  createPreview,
  getGiphyStatus,
  uploadToGiphy,
  deleteGif,
  getFavoriteIds,
  addFavorite,
  removeFavorite,
  MediaDetail,
  SubtitleLine,
  Gif,
  FavoriteCreate,
} from '../api/client'
import SubtitleList from '../components/SubtitleList'
import FramePreview from '../components/FramePreview'
import { showToast } from '../components/Toast'

type TextMode = 'none' | 'subtitles' | 'custom'

export default function Create() {
  const { mediaId } = useParams<{ mediaId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = location.state as { startMs?: number; endMs?: number } | null
  const [media, setMedia] = useState<MediaDetail | null>(null)
  const [subtitles, setSubtitles] = useState<SubtitleLine[]>([])
  const [loadingSubtitles, setLoadingSubtitles] = useState(false)
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null)
  const [startMs, setStartMs] = useState(0)
  const [durationMs, setDurationMs] = useState(5000)
  const [textMode, setTextMode] = useState<TextMode>('none')
  const [customText, setCustomText] = useState('')
  const [textPosition, setTextPosition] = useState<string>('bottom')
  const [textSize, setTextSize] = useState<string>('medium')
  const [creatingGif, setCreatingGif] = useState(false)
  const [currentGif, setCurrentGif] = useState<Gif | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [giphyConfigured, setGiphyConfigured] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [giphyMenuOpen, setGiphyMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isFavorited, setIsFavorited] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mediaId) return
    getFavoriteIds().then((ids) => setIsFavorited(ids.includes(mediaId))).catch(() => {})
  }, [mediaId])

  useEffect(() => {
    if (!mediaId) return
    getMedia(mediaId).then((m) => {
      setMedia(m)
      if (locationState?.startMs != null && locationState?.endMs != null) {
        setStartMs(locationState.startMs)
        setDurationMs(locationState.endMs - locationState.startMs)
      } else {
        setDurationMs(Math.min(5000, m.duration_ms))
      }
      if (m.subtitle_tracks.length > 0) {
        setTextMode('subtitles')
      }
    })
    getGiphyStatus().then((s) => setGiphyConfigured(s.configured))
  }, [mediaId, locationState])

  useEffect(() => {
    if (!mediaId || selectedTrack === null) return
    setLoadingSubtitles(true)
    setSubtitles([])
    getSubtitles(mediaId, selectedTrack)
      .then(setSubtitles)
      .finally(() => setLoadingSubtitles(false))
  }, [mediaId, selectedTrack])

  useEffect(() => {
    if (!currentGif || currentGif.status === 'complete' || currentGif.status === 'failed') return
    const interval = setInterval(async () => {
      const gif = await getGif(currentGif.id)
      setCurrentGif(gif)
      if (gif.status === 'complete' || gif.status === 'failed') {
        clearInterval(interval)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [currentGif])

  useEffect(() => {
    if (!isDragging || !media) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current) return
      const rect = timelineRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percent = Math.max(0, Math.min(1, x / rect.width))
      const newStart = Math.round(percent * media.duration_ms)
      const clampedStart = Math.max(0, Math.min(newStart, media.duration_ms - durationMs))
      setStartMs(clampedStart)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, media, durationMs])

  const handleToggleFavorite = async () => {
    if (!media) return
    try {
      if (isFavorited) {
        await removeFavorite(media.id)
        setIsFavorited(false)
      } else {
        const data: FavoriteCreate = {
          media_id: media.id,
          media_type: media.type,
          media_title: media.title,
          thumb_url: media.thumb_url,
          year: media.year,
          show_title: media.show_title,
          season: media.season,
          episode: media.episode,
        }
        await addFavorite(data)
        setIsFavorited(true)
      }
    } catch {
      // Silently fail
    }
  }

  const handleSubtitleClick = useCallback((line: SubtitleLine) => {
    setStartMs(line.start_ms)
    const subtitleDuration = line.end_ms - line.start_ms
    const newDuration = Math.min(subtitleDuration + 500, 30000)
    if (media) {
      setDurationMs(Math.min(newDuration, media.duration_ms - line.start_ms))
    } else {
      setDurationMs(newDuration)
    }
  }, [media])

  const endMs = startMs + durationMs

  const extendToPrevSubtitle = useCallback(() => {
    const prevSubtitle = subtitles
      .filter(s => s.end_ms <= startMs)
      .sort((a, b) => b.start_ms - a.start_ms)[0]
    if (prevSubtitle) {
      const newStart = prevSubtitle.start_ms
      const newDuration = Math.min(endMs - newStart, 30000)
      setStartMs(newStart)
      setDurationMs(newDuration)
    }
  }, [subtitles, startMs, endMs])

  const extendToNextSubtitle = useCallback(() => {
    const nextSubtitle = subtitles
      .filter(s => s.start_ms >= endMs)
      .sort((a, b) => a.start_ms - b.start_ms)[0]
    if (nextSubtitle && media) {
      const newEnd = Math.min(nextSubtitle.end_ms, media.duration_ms)
      const newDuration = Math.min(newEnd - startMs, 30000)
      setDurationMs(newDuration)
    }
  }, [subtitles, startMs, endMs, media])

  const handlePreview = async () => {
    if (!mediaId) return
    setPreviewUrl(null)
    setPreviewLoading(true)
    try {
      const subtitleIdx = textMode === 'subtitles' ? selectedTrack ?? undefined : undefined
      const text = textMode === 'custom' && customText.trim() ? customText.trim() : undefined
      const pos = textMode !== 'none' ? textPosition : undefined
      const size = textMode !== 'none' ? textSize : undefined
      const result = await createPreview(mediaId, startMs, endMs, subtitleIdx, text, pos, size)
      setPreviewUrl(result.url)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to generate preview')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleCreateGif = async () => {
    if (!mediaId) return
    setCreatingGif(true)
    try {
      const gif = await createGif({
        media_id: mediaId,
        start_ms: startMs,
        end_ms: endMs,
        include_subtitles: textMode === 'subtitles' && selectedTrack !== null,
        subtitle_index: textMode === 'subtitles' ? selectedTrack ?? undefined : undefined,
        custom_text: textMode === 'custom' && customText.trim() ? customText.trim() : undefined,
        text_position: textMode !== 'none' ? textPosition : undefined,
        text_size: textMode !== 'none' ? textSize : undefined,
      })
      setCurrentGif(gif)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to create GIF')
      setCreatingGif(false)
    }
  }

  const handleUploadToGiphy = async () => {
    if (!currentGif) return
    setUploading(true)
    try {
      const result = await uploadToGiphy(currentGif.id)
      setCurrentGif({ ...currentGif, giphy_id: result.giphy_id, giphy_url: result.giphy_url })
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleCopyGiphyUrl = async () => {
    if (!currentGif?.giphy_id) return
    const directUrl = `https://media.giphy.com/media/${currentGif.giphy_id}/giphy.gif`
    await navigator.clipboard.writeText(directUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    setGiphyMenuOpen(false)
  }

  const handleDelete = async () => {
    if (!currentGif) return
    if (!confirm('Are you sure you want to delete this GIF?')) return
    await deleteGif(currentGif.id)
    setCurrentGif(null)
    setCreatingGif(false)
  }

  if (!media) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-m3-primary"></div>
      </div>
    )
  }

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const hasSubtitles = media.subtitle_tracks.length > 0

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex gap-4 mb-6">
        <img
          src={media.thumb_url}
          alt={media.title}
          className="w-24 h-36 object-cover rounded-md"
          loading="lazy"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-medium text-m3-on-surface">{media.title}</h1>
            <button
              onClick={handleToggleFavorite}
              className="p-1 rounded-full hover:bg-m3-surface-container-high transition-colors"
              title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              {isFavorited ? (
                <svg className="w-6 h-6 text-m3-tertiary fill-current" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              ) : (
                <svg className="w-6 h-6 text-m3-on-surface-variant hover:text-m3-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                </svg>
              )}
            </button>
          </div>
          {media.show_title && (
            <p className="text-m3-on-surface-variant">
              {media.show_title} - S{media.season}E{media.episode}
            </p>
          )}
          <p className="text-m3-on-surface-variant">{formatTime(media.duration_ms)}</p>
          <p className="text-base text-m3-on-surface-variant mt-2">Choose a start time and duration below, optionally add text, then hit Create GIF.</p>
        </div>
      </div>

      {currentGif ? (
        <div className="bg-m3-surface-container rounded-md overflow-hidden p-6 mb-6">
          {currentGif.status === 'complete' && currentGif.filename ? (
            <div>
              <p className="text-m3-success mb-4 text-center">GIF created successfully!</p>
              <img
                src={`/output/${currentGif.filename}`}
                alt="Generated GIF"
                className="max-w-full mx-auto rounded-md mb-4"
              />
              <div className={`grid items-stretch border-t border-m3-outline-variant -mx-6 -mb-6 ${giphyConfigured || currentGif.giphy_url ? 'grid-cols-5' : 'grid-cols-4'}`}>
                <a
                  href={`/output/${currentGif.filename}`}
                  download
                  className="flex flex-col items-center justify-center gap-1 py-3 hover:bg-m3-surface-container-high text-base text-m3-on-surface-variant transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </a>
                {giphyConfigured && !currentGif.giphy_url && (
                  <button
                    onClick={handleUploadToGiphy}
                    disabled={uploading}
                    className="flex flex-col items-center justify-center gap-1 py-3 hover:bg-m3-surface-container-high disabled:opacity-50 text-base text-m3-primary transition-colors"
                  >
                    {uploading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-m3-primary"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    )}
                    Giphy
                  </button>
                )}
                {currentGif.giphy_url && (
                  <div className="relative flex">
                    <button
                      onClick={() => setGiphyMenuOpen(!giphyMenuOpen)}
                      className="flex flex-col items-center justify-center gap-1 py-3 hover:bg-m3-surface-container-high text-base text-m3-success w-full transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {copied ? 'Copied!' : 'Giphy'}
                    </button>
                    {giphyMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setGiphyMenuOpen(false)} />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-m3-surface-container-high border border-m3-outline-variant rounded-md shadow-elevation-2 z-20 min-w-[140px]">
                          <button
                            onClick={handleCopyGiphyUrl}
                            className="w-full px-3 py-2 text-base text-left hover:bg-m3-surface-container-highest flex items-center gap-2 text-m3-on-surface transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy GIF URL
                          </button>
                          <a
                            href={currentGif.giphy_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setGiphyMenuOpen(false)}
                            className="w-full px-3 py-2 text-base text-left hover:bg-m3-surface-container-highest flex items-center gap-2 text-m3-on-surface transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            View on Giphy
                          </a>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <button
                  onClick={() => {
                    setStartMs(currentGif.start_ms)
                    setDurationMs(currentGif.end_ms - currentGif.start_ms)
                    setCurrentGif(null)
                    setCreatingGif(false)
                  }}
                  className="flex flex-col items-center justify-center gap-1 py-3 hover:bg-m3-surface-container-high text-base text-m3-on-surface-variant transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Recreate
                </button>
                <button
                  onClick={() => navigate('/gallery')}
                  className="flex flex-col items-center justify-center gap-1 py-3 hover:bg-m3-surface-container-high text-base text-m3-on-surface-variant transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  Gallery
                </button>
                <button
                  onClick={handleDelete}
                  className="flex flex-col items-center justify-center gap-1 py-3 hover:bg-m3-surface-container-high text-base text-m3-error transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              </div>
            </div>
          ) : currentGif.status === 'failed' ? (
            <div className="text-center">
              <p className="text-m3-error mb-4">Failed to create GIF: {currentGif.error}</p>
              <button
                onClick={() => {
                  setCurrentGif(null)
                  setCreatingGif(false)
                }}
                className="bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface px-4 py-2 rounded-full transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="text-center">
              <p className="mb-4 text-m3-on-surface">Creating GIF...</p>
              <div className="w-full bg-m3-surface-container-highest rounded-full h-4 mb-2">
                <div
                  className="bg-m3-primary h-4 rounded-full transition-all duration-300"
                  style={{ width: `${currentGif.progress}%` }}
                ></div>
              </div>
              <p className="text-m3-on-surface-variant">{currentGif.progress}%</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mb-6">
            <div className="rounded-md overflow-hidden">
              <FramePreview mediaId={mediaId!} timestampMs={startMs} />

              <div className="bg-m3-surface-container-lowest px-4 py-3">
              <div
                ref={timelineRef}
                className="relative h-2 bg-m3-surface-container-highest rounded-full cursor-pointer group"
                onMouseDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = e.clientX - rect.left
                  const percent = Math.max(0, Math.min(1, x / rect.width))
                  const newStart = Math.round(percent * media.duration_ms)
                  const clampedStart = Math.max(0, Math.min(newStart, media.duration_ms - durationMs))
                  setStartMs(clampedStart)
                  setIsDragging(true)
                }}
              >
                <div
                  className="absolute top-0 bottom-0 bg-m3-primary/30 rounded-full"
                  style={{
                    left: `${(startMs / media.duration_ms) * 100}%`,
                    width: `${Math.min((durationMs / media.duration_ms) * 100, 100 - (startMs / media.duration_ms) * 100)}%`,
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-m3-primary rounded-full shadow-lg group-hover:scale-125 transition-transform"
                  style={{ left: `calc(${(startMs / media.duration_ms) * 100}% - 6px)` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-m3-primary/70 rounded-full"
                  style={{ left: `calc(${((startMs + durationMs) / media.duration_ms) * 100}% - 3px)` }}
                />
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base text-m3-primary">
                    {formatTime(startMs)}
                  </span>
                  <span className="text-m3-outline text-base">→</span>
                  <span className="font-mono text-base text-m3-on-surface-variant">
                    {formatTime(startMs + durationMs)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {[-1000, -500, -100].map((delta) => (
                    <button
                      key={delta}
                      onClick={() => {
                        const newStart = startMs + delta
                        if (newStart >= 0 && newStart + durationMs <= media.duration_ms) {
                          setStartMs(newStart)
                        }
                      }}
                      className="px-2 py-1 text-base border border-m3-outline-variant hover:bg-m3-surface-container-high rounded-full font-mono text-m3-on-surface-variant transition-colors"
                    >
                      {delta / 1000}s
                    </button>
                  ))}
                  <span className="w-2" />
                  {[100, 500, 1000].map((delta) => (
                    <button
                      key={delta}
                      onClick={() => {
                        const newStart = startMs + delta
                        if (newStart >= 0 && newStart + durationMs <= media.duration_ms) {
                          setStartMs(newStart)
                        }
                      }}
                      className="px-2 py-1 text-base border border-m3-outline-variant hover:bg-m3-surface-container-high rounded-full font-mono text-m3-on-surface-variant transition-colors"
                    >
                      +{delta / 1000}s
                    </button>
                  ))}
                </div>
                <span className="font-mono text-base text-m3-outline">
                  {formatTime(media.duration_ms)}
                </span>
              </div>
              <p className="text-base text-m3-outline text-center mt-3">Drag the timeline or click a subtitle to select start time</p>
            </div>
            </div>
          </div>

          <div className="bg-m3-surface-container rounded-md p-6 mb-6">
            <h2 className="text-lg font-medium mb-1 text-m3-on-surface">Duration</h2>
            <p className="text-base text-m3-on-surface-variant mb-4">Most GIFs work best between 3–8 seconds</p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={(durationMs / 1000).toFixed(1)}
                onChange={(e) => {
                  const val = parseFloat(e.target.value)
                  if (!isNaN(val)) {
                    setDurationMs(val * 1000)
                  }
                }}
                onBlur={() => {
                  setDurationMs((v) => Math.max(100, Math.min(v, media.duration_ms - startMs, 30000)))
                }}
                step="0.1"
                min="0.1"
                max="30"
                className="w-24 bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-3 py-2 font-mono text-m3-on-surface focus:border-m3-primary focus:outline-none transition-colors"
              />
              <span className="text-m3-on-surface-variant">seconds</span>
              <div className="flex gap-1 ml-2">
                {[-1000, -500, 500, 1000].map((delta) => (
                  <button
                    key={delta}
                    onClick={() => {
                      const newDuration = durationMs + delta
                      if (newDuration > 0 && startMs + newDuration <= media.duration_ms) {
                        setDurationMs(Math.min(newDuration, 30000))
                      }
                    }}
                    className="px-2 py-1 text-base border border-m3-outline-variant hover:bg-m3-surface-container-high rounded-full text-m3-on-surface-variant transition-colors"
                  >
                    {delta > 0 ? '+' : ''}{delta / 1000}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          {hasSubtitles && (
            <div className="bg-m3-surface-container rounded-md p-6 mb-6">
              <h2 className="text-lg font-medium mb-4 text-m3-on-surface">Find Scene</h2>
              <p className="text-base text-m3-on-surface-variant mb-3">Search subtitles to jump to a scene</p>
              <div className="text-base text-m3-on-surface-variant mb-3 space-y-1">
                <p><strong className="text-m3-on-surface">SRT, ASS, VTT</strong> - Text-based, searchable</p>
                <p><strong className="text-m3-on-surface">PGS</strong> - Image-based (Blu-ray), cannot be searched</p>
                <p><strong className="text-m3-on-surface">Forced</strong> - Only foreign/sign language parts, usually sparse</p>
                <p className="italic">For best results, choose a full text-based track</p>
              </div>
              <div className="mb-3">
                <select
                  value={selectedTrack ?? ''}
                  onChange={(e) => setSelectedTrack(e.target.value ? Number(e.target.value) : null)}
                  className="bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-3 py-2 text-m3-on-surface focus:border-m3-primary focus:outline-none transition-colors"
                >
                  <option value="">Select a subtitle track...</option>
                  {media.subtitle_tracks.map((track) => (
                    <option key={track.index} value={track.index}>
                      {track.language} {track.title ? `(${track.title})` : ''} [{track.format}]
                    </option>
                  ))}
                </select>
                {selectedTrack !== null && media.subtitle_tracks.find(t => t.index === selectedTrack)?.format === 'pgs' && (
                  <p className="text-base text-m3-tertiary mt-1">PGS subtitles are image-based and cannot be searched</p>
                )}
              </div>
              {selectedTrack !== null ? (
                <SubtitleList
                  subtitles={subtitles}
                  onLineClick={handleSubtitleClick}
                  loading={loadingSubtitles}
                  rangeStartMs={startMs}
                  rangeEndMs={endMs}
                  onExtendPrev={extendToPrevSubtitle}
                  onExtendNext={extendToNextSubtitle}
                />
              ) : (
                <p className="text-m3-outline text-base">Select a subtitle track to browse scenes</p>
              )}
            </div>
          )}

          <div className="bg-m3-surface-container rounded-md p-6 mb-6">
            <h2 className="text-lg font-medium mb-4 text-m3-on-surface">Text Overlay</h2>
            <p className="text-base text-m3-on-surface-variant mb-3">Choose what text to burn into the GIF</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-m3-on-surface">
                <input
                  type="radio"
                  name="textMode"
                  checked={textMode === 'none'}
                  onChange={() => setTextMode('none')}
                  className="w-4 h-4"
                />
                No text
              </label>
              {hasSubtitles && (
                <label className="flex items-center gap-2 cursor-pointer text-m3-on-surface">
                  <input
                    type="radio"
                    name="textMode"
                    checked={textMode === 'subtitles'}
                    onChange={() => setTextMode('subtitles')}
                    className="w-4 h-4"
                  />
                  Burn subtitles
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer text-m3-on-surface">
                <input
                  type="radio"
                  name="textMode"
                  checked={textMode === 'custom'}
                  onChange={() => setTextMode('custom')}
                  className="w-4 h-4"
                />
                Custom text
              </label>
            </div>

            {textMode === 'custom' && (
              <div className="mt-4">
                <label className="block text-base text-m3-on-surface-variant mb-1">Custom Text</label>
                <input
                  type="text"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="Enter text to overlay on GIF..."
                  className="w-full bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-3 py-2 text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none transition-colors"
                />
              </div>
            )}

            {textMode !== 'none' && (
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-base text-m3-on-surface-variant mb-1">Position</label>
                  <div className="flex gap-2">
                    {(['top', 'center', 'bottom'] as const).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setTextPosition(pos)}
                        className={`px-3 py-1.5 text-base rounded-full capitalize transition-colors ${
                          textPosition === pos
                            ? 'bg-m3-primary-container text-m3-on-primary-container'
                            : 'border border-m3-outline-variant text-m3-on-surface-variant hover:bg-m3-surface-container-high'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-base text-m3-on-surface-variant mb-1">Size</label>
                  <div className="flex gap-2">
                    {(['small', 'medium', 'large'] as const).map((sz) => (
                      <button
                        key={sz}
                        onClick={() => setTextSize(sz)}
                        className={`px-3 py-1.5 text-base rounded-full capitalize transition-colors ${
                          textSize === sz
                            ? 'bg-m3-primary-container text-m3-on-primary-container'
                            : 'border border-m3-outline-variant text-m3-on-surface-variant hover:bg-m3-surface-container-high'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>


          <div className="mb-6">
            <h2 className="text-lg font-medium mb-1 text-center text-m3-on-surface">Preview</h2>
            <p className="text-base text-m3-on-surface-variant mb-3 text-center">
              Generate a video preview with your selected text overlay
            </p>
            {previewLoading && (
              <div className="mb-4 flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-m3-primary"></div>
              </div>
            )}
            {!previewLoading && previewUrl && (
              <div className="mb-4 flex justify-center">
                <video
                  src={previewUrl}
                  controls
                  autoPlay
                  loop
                  className="max-w-full rounded-md"
                />
              </div>
            )}
            <button
              onClick={handlePreview}
              disabled={previewLoading || durationMs > 30000 || durationMs <= 0}
              className="w-full bg-m3-secondary-container hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-m3-on-secondary-container font-medium py-2.5 rounded-full transition-all"
            >
              {previewLoading ? 'Generating Preview...' : previewUrl ? 'Regenerate Preview' : 'Generate Preview'}
            </button>
          </div>

          <button
            onClick={handleCreateGif}
            disabled={creatingGif || durationMs > 30000 || durationMs <= 0}
            className="btn-create-gif w-full disabled:opacity-50 disabled:cursor-not-allowed text-m3-on-primary-container font-semibold text-lg py-4 rounded-full"
          >
            {durationMs > 30000 ? 'Duration exceeds 30 seconds' : 'Create GIF'}
          </button>
        </>
      )}
    </div>
  )
}
