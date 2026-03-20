import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Gif, uploadToGiphy, shareGif, unshareGif } from '../api/client'

interface GifCardProps {
  gif: Gif
  onDelete: () => void
  onUpdate?: () => void
  giphyConfigured?: boolean
  sharingEnabled?: boolean
  bulkMode?: boolean
  selected?: boolean
  onSelect?: (selected: boolean) => void
}

export default function GifCard({ gif, onDelete, onUpdate, giphyConfigured, sharingEnabled, bulkMode, selected, onSelect }: GifCardProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [giphyMenuOpen, setGiphyMenuOpen] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [localPublicToken, setLocalPublicToken] = useState<string | null>(gif.public_token || null)
  const [tapped, setTapped] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tapped) return
    const handleOutside = (e: Event) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setTapped(false)
      }
    }
    document.addEventListener('touchstart', handleOutside)
    return () => document.removeEventListener('touchstart', handleOutside)
  }, [tapped])

  const handleCopyGiphyUrl = async () => {
    if (!gif.giphy_id) return
    const directUrl = `https://media.giphy.com/media/${gif.giphy_id}/giphy.gif`
    await navigator.clipboard.writeText(directUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    setGiphyMenuOpen(false)
  }

  const handleUpload = async () => {
    setUploading(true)
    setUploadError(null)
    try {
      await uploadToGiphy(gif.id)
      onUpdate?.()
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleShare = async () => {
    setSharing(true)
    try {
      const result = await shareGif(gif.id)
      setLocalPublicToken(result.public_token)
      await navigator.clipboard.writeText(result.public_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Failed to share')
    } finally {
      setSharing(false)
    }
  }

  const handleCopyShareLink = async () => {
    if (!localPublicToken) return
    const url = `${window.location.origin}/s/${localPublicToken}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    setShareMenuOpen(false)
  }

  const handleUnshare = async () => {
    try {
      await unshareGif(gif.id)
      setLocalPublicToken(null)
      setShareMenuOpen(false)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Failed to unshare')
    }
  }

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getSourceLabel = () => {
    if (gif.media_type === 'episode' && gif.show_title) {
      const ep = gif.season != null && gif.episode != null
        ? `S${String(gif.season).padStart(2, '0')}E${String(gif.episode).padStart(2, '0')}`
        : ''
      return `${gif.show_title}${ep ? ` ${ep}` : ''}`
    }
    if (gif.media_type === 'movie' && gif.year) {
      return `${gif.media_title} (${gif.year})`
    }
    return null
  }

  const sourceLabel = getSourceLabel()

  return (
    <div
      ref={cardRef}
      className={`mb-2 break-inside-avoid rounded-md overflow-hidden relative group ${selected ? 'ring-2 ring-m3-primary' : ''} ${bulkMode ? 'cursor-pointer' : ''}`}
      onClick={bulkMode ? () => onSelect?.(!selected) : undefined}
      onTouchEnd={!bulkMode && gif.status === 'complete' ? (e) => {
        if ((e.target as HTMLElement).closest('a, button')) return
        setTapped((prev) => !prev)
      } : undefined}
    >
      {bulkMode && (
        <div className="absolute top-2 left-2 z-10">
          <input
            type="checkbox"
            checked={selected || false}
            onChange={(e) => onSelect?.(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="w-5 h-5 rounded bg-m3-surface-container-high border-m3-outline-variant cursor-pointer"
          />
        </div>
      )}
      {gif.status === 'complete' && gif.filename ? (
        <img
          src={`/output/${gif.filename}`}
          alt={gif.media_title}
          loading="lazy"
          className="w-full h-auto block"
        />
      ) : gif.status === 'failed' ? (
        <div className="aspect-video bg-m3-surface-container-high flex items-center justify-center text-m3-error text-base p-4 text-center">
          Failed: {gif.error}
        </div>
      ) : (
        <div className="aspect-video bg-m3-surface-container-high flex items-center justify-center text-center">
          <div>
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-m3-primary mx-auto mb-2"></div>
            <p className="text-base text-m3-on-surface-variant">{gif.progress}%</p>
          </div>
        </div>
      )}
      {/* Hover overlay with metadata */}
      {gif.status === 'complete' && gif.filename && !bulkMode && (
        <div className={`absolute inset-0 bg-black/70 transition-opacity flex flex-col justify-end ${tapped ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <div className="p-2">
            {sourceLabel ? (
              <p className="font-medium text-sm truncate text-white">{sourceLabel}</p>
            ) : (
              <p className="font-medium text-sm truncate text-white">{gif.media_title}</p>
            )}
            {gif.media_type === 'episode' && (
              <p className="text-xs text-gray-300 truncate">{gif.media_title}</p>
            )}
            <p className="text-xs text-gray-400">
              {formatTime(gif.start_ms)} - {formatTime(gif.end_ms)}
              {gif.size_bytes && ` · ${formatSize(gif.size_bytes)}`}
            </p>
          </div>
        </div>
      )}
      {uploadError && (
        <div className="p-2 bg-m3-surface-container">
          <p className="text-m3-error text-base text-center">{uploadError}</p>
        </div>
      )}
      {gif.status === 'complete' && gif.filename && !bulkMode && (
        <div className={`absolute top-2 right-2 transition-opacity flex gap-1.5 z-10 ${tapped ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <div className="relative group/tip">
            <a
              href={`/output/${gif.filename}`}
              download
              className="p-2.5 rounded-full bg-black/60 hover:bg-white/30 text-white transition-colors block"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity">Download</span>
          </div>
          {sharingEnabled && !localPublicToken && (
            <div className="relative group/tip">
              <button
                onClick={handleShare}
                disabled={sharing}
                className="p-2.5 rounded-full bg-black/60 hover:bg-white/30 text-white disabled:opacity-50 transition-colors"
              >
                {sharing ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                )}
              </button>
              <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity">Share</span>
            </div>
          )}
          {sharingEnabled && localPublicToken && (
            <div className="relative group/tip">
              <button
                onClick={() => setShareMenuOpen(!shareMenuOpen)}
                className="p-2.5 rounded-full bg-black/60 hover:bg-white/30 text-green-400 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
              <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity">{copied ? 'Copied!' : 'Shared'}</span>
              {shareMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShareMenuOpen(false)} />
                  <div className="absolute top-full right-0 mt-1 bg-m3-surface-container-high border border-m3-outline-variant rounded-md shadow-elevation-2 z-20 min-w-[140px]">
                    <button
                      onClick={handleCopyShareLink}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-m3-surface-container-highest flex items-center gap-2 text-m3-on-surface transition-colors"
                    >
                      Copy Link
                    </button>
                    <a
                      href={`/s/${localPublicToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShareMenuOpen(false)}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-m3-surface-container-highest flex items-center gap-2 text-m3-on-surface transition-colors block"
                    >
                      Visit Link
                    </a>
                    <button
                      onClick={handleUnshare}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-m3-surface-container-highest flex items-center gap-2 text-m3-error transition-colors"
                    >
                      Remove Link
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {giphyConfigured && !gif.giphy_url && (
            <div className="relative group/tip">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="p-2.5 rounded-full bg-black/60 hover:bg-white/30 text-white disabled:opacity-50 transition-colors"
              >
                {uploading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                )}
              </button>
              <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity">Giphy</span>
            </div>
          )}
          {gif.giphy_url && (
            <div className="relative group/tip">
              <button
                onClick={() => setGiphyMenuOpen(!giphyMenuOpen)}
                className="p-2.5 rounded-full bg-black/60 hover:bg-white/30 text-green-400 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity">{copied ? 'Copied!' : 'On Giphy'}</span>
              {giphyMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setGiphyMenuOpen(false)} />
                  <div className="absolute top-full right-0 mt-1 bg-m3-surface-container-high border border-m3-outline-variant rounded-md shadow-elevation-2 z-20 min-w-[140px]">
                    <button
                      onClick={handleCopyGiphyUrl}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-m3-surface-container-highest flex items-center gap-2 text-m3-on-surface transition-colors"
                    >
                      Copy GIF URL
                    </button>
                    <a
                      href={gif.giphy_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setGiphyMenuOpen(false)}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-m3-surface-container-highest flex items-center gap-2 text-m3-on-surface transition-colors"
                    >
                      View on Giphy
                    </a>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="relative group/tip">
            <Link
              to={`/create/${gif.media_id}`}
              state={{ startMs: gif.start_ms, endMs: gif.end_ms }}
              className="p-2.5 rounded-full bg-black/60 hover:bg-white/30 text-white transition-colors block"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </Link>
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity">Recreate</span>
          </div>
          <div className="relative group/tip">
            <button
              onClick={onDelete}
              className="p-2.5 rounded-full bg-black/60 hover:bg-red-600/80 text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity">Delete</span>
          </div>
        </div>
      )}
      {gif.status === 'failed' && !bulkMode && (
        <div className="absolute top-2 right-2 flex gap-1.5">
          <div className="relative group/tip">
            <Link
              to={`/create/${gif.media_id}`}
              state={{ startMs: gif.start_ms, endMs: gif.end_ms }}
              className="p-2.5 rounded-full bg-black/60 hover:bg-white/30 text-white transition-colors block"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </Link>
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity">Recreate</span>
          </div>
          <div className="relative group/tip">
            <button
              onClick={onDelete}
              className="p-2.5 rounded-full bg-black/60 hover:bg-red-600/80 text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity">Remove</span>
          </div>
        </div>
      )}
    </div>
  )
}
