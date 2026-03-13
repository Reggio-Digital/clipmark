import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getSharedGif, getSharedGifFileUrl, PublicGif } from '../api/client'

export default function SharedGif() {
  const { token } = useParams<{ token: string }>()
  const [gif, setGif] = useState<PublicGif | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    getSharedGif(token)
      .then(setGif)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [token])

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

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // M3 subtitle: show/episode info separate from main title
  const getSubtitle = () => {
    if (!gif) return null
    if (gif.show_title) {
      const ep = gif.season != null && gif.episode != null
        ? ` S${String(gif.season).padStart(2, '0')}E${String(gif.episode).padStart(2, '0')}`
        : ''
      return `${gif.show_title}${ep}`
    }
    if (gif.year) return `${gif.year}`
    return null
  }

  const getMainTitle = () => {
    if (!gif) return ''
    return gif.media_title
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-m3-background flex items-center justify-center">
        <svg className="animate-spin h-6 w-6 text-m3-primary" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (error || !gif || !token) {
    return (
      <div className="min-h-screen bg-m3-background text-m3-on-surface">
        <header className="max-w-2xl mx-auto px-6 h-16 flex items-center">
          <a href="https://github.com/Reggio-Digital/clipmark" target="_blank" rel="noopener noreferrer" className="text-m3-primary text-base font-medium hover:underline">Clipmark</a>
        </header>
        <div className="max-w-2xl mx-auto px-6 pt-12">
          <div className="bg-m3-surface-container rounded-xl p-8">
            <svg className="w-12 h-12 text-m3-on-surface-variant mb-4" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 105.636 5.636a9 9 0 0012.728 12.728zM15 9l-6 6m0-6l6 6" />
            </svg>
            <h1 className="text-[22px] font-normal text-m3-on-surface mb-2">This GIF isn't available</h1>
            <p className="text-base text-m3-on-surface-variant">It may have been removed or the link is no longer valid.</p>
          </div>
        </div>
      </div>
    )
  }

  const subtitle = getSubtitle()

  return (
    <div className="min-h-screen bg-m3-background text-m3-on-surface">
      {/* M3 Small Top App Bar */}
      <header className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="https://github.com/Reggio-Digital/clipmark" target="_blank" rel="noopener noreferrer" className="text-m3-primary text-base font-medium hover:underline">Clipmark</a>
      </header>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 pb-12">
        {/* M3 Filled Card — Extra Large shape (28px) */}
        <div className="bg-m3-surface-container rounded-xl overflow-hidden">
          {/* Media */}
          <img
            src={getSharedGifFileUrl(token)}
            alt={gif.media_title}
            className="w-full block"
          />

          {/* Card content */}
          <div className="px-6 pt-5 pb-6">
            {/* Title area */}
            {subtitle && (
              <p className="text-base font-medium text-m3-on-surface-variant mb-1">{subtitle}</p>
            )}
            <h1 className="text-[22px] font-normal leading-7">{getMainTitle()}</h1>

            {/* M3 Assist Chips for metadata */}
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="inline-flex items-center h-8 px-4 rounded-sm border border-m3-outline-variant text-base font-medium text-m3-on-surface-variant">
                {formatTime(gif.start_ms)}&ndash;{formatTime(gif.end_ms)}
              </span>
              {gif.size_bytes && (
                <span className="inline-flex items-center h-8 px-4 rounded-sm border border-m3-outline-variant text-base font-medium text-m3-on-surface-variant">
                  {formatSize(gif.size_bytes)}
                </span>
              )}
              <span className="inline-flex items-center h-8 px-4 rounded-sm border border-m3-outline-variant text-base font-medium text-m3-on-surface-variant">
                {formatDate(gif.created_at)}
              </span>
            </div>

            {/* M3 Filled Tonal Button */}
            <div className="mt-6">
              <a
                href={getSharedGifFileUrl(token)}
                download
                className="inline-flex items-center gap-2 h-10 px-6 rounded-full bg-m3-primary-container hover:brightness-110 active:brightness-90 text-m3-on-primary-container text-base font-medium transition-all"
              >
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-4-4m4 4l4-4M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
                </svg>
                Download
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
