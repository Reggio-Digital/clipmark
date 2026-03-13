import { useState } from 'react'
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

  const getActionCount = () => {
    let count = 3
    if (giphyConfigured && !gif.giphy_url) count++
    if (gif.giphy_url) count++
    if (sharingEnabled) count++
    return count
  }

  return (
    <div className={`bg-m3-surface-container rounded-md overflow-hidden relative flex flex-col ${selected ? 'ring-2 ring-m3-primary' : ''}`}>
      {bulkMode && (
        <div className="absolute top-2 left-2 z-10">
          <input
            type="checkbox"
            checked={selected || false}
            onChange={(e) => onSelect?.(e.target.checked)}
            className="w-5 h-5 rounded bg-m3-surface-container-high border-m3-outline-variant cursor-pointer"
          />
        </div>
      )}
      <div className="aspect-video bg-m3-surface-container-high flex items-center justify-center">
        {gif.status === 'complete' && gif.filename ? (
          <img
            src={`/output/${gif.filename}`}
            alt={gif.media_title}
            loading="lazy"
            className="w-full h-full object-contain"
          />
        ) : gif.status === 'failed' ? (
          <div className="text-m3-error text-base p-4 text-center">
            Failed: {gif.error}
          </div>
        ) : (
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-m3-primary mx-auto mb-2"></div>
            <p className="text-base text-m3-on-surface-variant">{gif.progress}%</p>
          </div>
        )}
      </div>
      <div className="p-3 flex-1">
        {sourceLabel && (
          <p className="text-base text-m3-outline truncate">{sourceLabel}</p>
        )}
        <p className="font-medium text-base truncate text-m3-on-surface">{gif.media_title}</p>
        <p className="text-base text-m3-on-surface-variant">
          {formatTime(gif.start_ms)} - {formatTime(gif.end_ms)}
          {gif.size_bytes && ` (${formatSize(gif.size_bytes)})`}
        </p>
        {uploadError && (
          <p className="text-m3-error text-base mt-1 text-center">{uploadError}</p>
        )}
      </div>
      {gif.status === 'complete' && gif.filename && !bulkMode && (
        <div className={`grid border-t border-m3-outline-variant`} style={{ gridTemplateColumns: `repeat(${getActionCount()}, minmax(0, 1fr))` }}>
          <a
            href={`/output/${gif.filename}`}
            download
            className="flex flex-col items-center justify-center gap-1 py-2 hover:bg-m3-surface-container-high text-base text-m3-on-surface-variant transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </a>
          {sharingEnabled && !localPublicToken && (
            <button
              onClick={handleShare}
              disabled={sharing}
              className="flex flex-col items-center justify-center gap-1 py-2 hover:bg-m3-surface-container-high disabled:opacity-50 text-base text-m3-secondary transition-colors"
            >
              {sharing ? (
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-m3-secondary"></div>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              )}
              Share
            </button>
          )}
          {sharingEnabled && localPublicToken && (
            <div className="relative">
              <button
                onClick={() => setShareMenuOpen(!shareMenuOpen)}
                className="flex flex-col items-center justify-center gap-1 py-2 hover:bg-m3-surface-container-high text-base text-m3-secondary w-full transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {copied ? 'Copied!' : 'Shared'}
              </button>
              {shareMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShareMenuOpen(false)} />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-m3-surface-container-high border border-m3-outline-variant rounded-md shadow-elevation-2 z-20 min-w-[140px]">
                    <button
                      onClick={handleCopyShareLink}
                      className="w-full px-3 py-2 text-base text-left hover:bg-m3-surface-container-highest flex items-center gap-2 text-m3-on-surface transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy Link
                    </button>
                    <button
                      onClick={handleUnshare}
                      className="w-full px-3 py-2 text-base text-left hover:bg-m3-surface-container-highest flex items-center gap-2 text-m3-error transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      Remove Link
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {giphyConfigured && !gif.giphy_url && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="flex flex-col items-center justify-center gap-1 py-2 hover:bg-m3-surface-container-high disabled:opacity-50 text-base text-m3-primary transition-colors"
            >
              {uploading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-m3-primary"></div>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              )}
              Giphy
            </button>
          )}
          {gif.giphy_url && (
            <div className="relative">
              <button
                onClick={() => setGiphyMenuOpen(!giphyMenuOpen)}
                className="flex flex-col items-center justify-center gap-1 py-2 hover:bg-m3-surface-container-high text-base text-m3-success w-full transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      href={gif.giphy_url}
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
          <Link
            to={`/create/${gif.media_id}`}
            state={{ startMs: gif.start_ms, endMs: gif.end_ms }}
            className="flex flex-col items-center justify-center gap-1 py-2 hover:bg-m3-surface-container-high text-base text-m3-on-surface-variant transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Recreate
          </Link>
          <button
            onClick={onDelete}
            className="flex flex-col items-center justify-center gap-1 py-2 hover:bg-m3-surface-container-high text-base text-m3-error transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}
      {gif.status === 'failed' && !bulkMode && (
        <div className="grid grid-cols-2 border-t border-m3-outline-variant">
          <Link
            to={`/create/${gif.media_id}`}
            state={{ startMs: gif.start_ms, endMs: gif.end_ms }}
            className="flex flex-col items-center justify-center gap-1 py-2 hover:bg-m3-surface-container-high text-base text-m3-on-surface-variant transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Recreate
          </Link>
          <button
            onClick={onDelete}
            className="flex flex-col items-center justify-center gap-1 py-2 hover:bg-m3-surface-container-high text-base text-m3-error transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Remove
          </button>
        </div>
      )}
    </div>
  )
}
