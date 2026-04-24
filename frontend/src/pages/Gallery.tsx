import { useState, useEffect, useCallback, useRef } from 'react'
import { listGifs, deleteGif, getGiphyStatus, getFeatureFlags, Gif, FeatureFlags } from '../api/client'
import GifCard from '../components/GifCard'
import { showToast } from '../components/Toast'

export default function Gallery() {
  const [gifs, setGifs] = useState<Gif[]>([])
  const [totalGifs, setTotalGifs] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [giphyConfigured, setGiphyConfigured] = useState(false)
  const [features, setFeatures] = useState<FeatureFlags>({ public_sharing_enabled: false, giphy_global_enabled: true })
  const [bulkMode, setBulkMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('newest')
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const pageRef = useRef(page)
  pageRef.current = page

  useEffect(() => {
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(searchTimeout.current)
  }, [search])

  const loadGifs = useCallback(async () => {
    try {
      const response = await listGifs(status, pageRef.current, 50, debouncedSearch, sort)
      setGifs(response.items)
      setTotalGifs(response.total_items)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load GIFs')
    } finally {
      setLoading(false)
    }
  }, [status, debouncedSearch, sort])

  useEffect(() => {
    setLoading(true)
    loadGifs()
    getGiphyStatus().then((s) => setGiphyConfigured(s.configured)).catch(() => {})
    getFeatureFlags().then(setFeatures).catch(() => {})
  }, [page, loadGifs])

  useEffect(() => {
    if (gifs.some((g) => g.status === 'queued' || g.status === 'processing')) {
      const interval = setInterval(loadGifs, 2000)
      return () => clearInterval(interval)
    }
  }, [gifs, loadGifs])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this GIF?')) return
    try {
      await deleteGif(id)
      loadGifs()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to delete GIF')
    }
  }

  const handleSelect = (id: string, isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (isSelected) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (selected.size === gifs.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(gifs.map((g) => g.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`Are you sure you want to delete ${selected.size} GIF${selected.size > 1 ? 's' : ''}?`)) return
    setDeleting(true)
    try {
      await Promise.all([...selected].map((id) => deleteGif(id)))
      setSelected(new Set())
      setBulkMode(false)
      loadGifs()
    } finally {
      setDeleting(false)
    }
  }

  const exitBulkMode = () => {
    setBulkMode(false)
    setSelected(new Set())
  }

  const totalPages = Math.ceil(totalGifs / 50)

  const showGiphy = giphyConfigured && features.giphy_global_enabled

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h1 className="text-2xl font-medium text-m3-on-surface">Gallery</h1>
        {!loading && gifs.length > 0 && (
          <div className="flex items-center gap-2">
            {bulkMode ? (
              <>
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-1.5 bg-m3-surface-container-high hover:bg-m3-surface-container-highest rounded-full text-base text-m3-on-surface transition-colors"
                >
                  {selected.size === gifs.length ? 'Deselect All' : 'Select All'}
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={selected.size === 0 || deleting}
                  className="px-3 py-1.5 bg-m3-error-container hover:brightness-110 text-m3-on-error-container disabled:opacity-50 rounded-full text-base transition-all"
                >
                  {deleting ? 'Deleting...' : `Delete (${selected.size})`}
                </button>
                <button
                  onClick={exitBulkMode}
                  className="px-3 py-1.5 bg-m3-surface-container-high hover:bg-m3-surface-container-highest rounded-full text-base text-m3-on-surface transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setBulkMode(true)}
                className="px-3 py-1.5 bg-m3-surface-container-high hover:bg-m3-surface-container-highest rounded-full text-base text-m3-on-surface transition-colors"
              >
                Select
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-m3-on-surface-variant" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, show, or text..."
            className="w-full bg-m3-surface-container-high border border-m3-outline-variant rounded-full pl-10 pr-3 py-2.5 text-base text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-m3-on-surface-variant hover:text-m3-on-surface transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="bg-m3-surface-container-high border border-m3-outline-variant rounded-full px-3 py-2 text-base text-m3-on-surface focus:border-m3-primary focus:outline-none transition-colors"
          >
            <option value="all">All</option>
            <option value="complete">Complete</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1) }}
            className="bg-m3-surface-container-high border border-m3-outline-variant rounded-full px-3 py-2 text-base text-m3-on-surface focus:border-m3-primary focus:outline-none transition-colors"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title</option>
            <option value="size">Size</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-m3-primary"></div>
        </div>
      ) : gifs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-m3-on-surface-variant">
            {debouncedSearch || status !== 'all' ? 'No GIFs match your filters.' : 'No GIFs yet.'}
          </p>
          {!debouncedSearch && status === 'all' && (
            <p className="text-base text-m3-on-surface-variant mt-2">
              Head to <a href="/browse" className="text-m3-primary hover:underline">Browse</a> to pick a movie or episode and create your first GIF.
            </p>
          )}
        </div>
      ) : (
        <>
          {totalGifs > 0 && (
            <p className="text-base text-m3-outline mb-3">{totalGifs} GIF{totalGifs !== 1 ? 's' : ''}</p>
          )}
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-2 space-y-0">
            {gifs.map((gif) => (
              <GifCard
                key={gif.id}
                gif={gif}
                onDelete={() => handleDelete(gif.id)}
                onUpdate={loadGifs}
                giphyConfigured={showGiphy}
                sharingEnabled={features.public_sharing_enabled}
                bulkMode={bulkMode}
                selected={selected.has(gif.id)}
                onSelect={(isSelected) => handleSelect(gif.id, isSelected)}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-m3-surface-container-high hover:bg-m3-surface-container-highest rounded-full disabled:opacity-50 text-m3-on-surface transition-colors"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-m3-on-surface-variant">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-m3-surface-container-high hover:bg-m3-surface-container-highest rounded-full disabled:opacity-50 text-m3-on-surface transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
