import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { getLibraries, getLibraryItems, getSetupStatus, search, getFavoriteIds, addFavorite, removeFavorite, Library, MediaItem, SearchResult, FavoriteCreate } from '../api/client'
import MediaGrid from '../components/MediaGrid'

export default function Browse() {
  const { libraryId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [libraries, setLibraries] = useState<Library[]>([])
  const [items, setItems] = useState<MediaItem[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [sort, setSort] = useState<'added' | 'alpha' | 'year'>('added')
  const pageSize = 48
  const [serverName, setServerName] = useState<string | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    getLibraries().then(setLibraries)
    getSetupStatus().then((s) => setServerName(s.server_name || null)).catch(() => {})
    getFavoriteIds().then((ids) => setFavoriteIds(new Set(ids))).catch(() => {})
  }, [])

  useEffect(() => {
    if (!libraryId) {
      setLoading(false)
      return
    }
    setLoading(true)
    getLibraryItems(libraryId, page, pageSize, sort).then((response) => {
      setItems(response.items)
      setTotalItems(response.total_items)
      setLoading(false)
    })
  }, [libraryId, page, pageSize, sort])

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults(null)
      return
    }
    const timeout = setTimeout(() => {
      search(searchQuery).then(setSearchResults)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchQuery])

  const handleItemClick = (item: MediaItem | SearchResult) => {
    if (item.type === 'show') {
      navigate(`/shows/${item.id}`)
    } else {
      navigate(`/create/${item.id}`)
    }
  }

  const handleToggleFavorite = async (item: MediaItem) => {
    const isFavorited = favoriteIds.has(item.id)
    try {
      if (isFavorited) {
        await removeFavorite(item.id)
        setFavoriteIds((prev) => {
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
      } else {
        const data: FavoriteCreate = {
          media_id: item.id,
          media_type: item.type,
          media_title: item.title,
          thumb_url: item.thumb_url,
          year: item.year,
          show_title: item.show_title,
        }
        await addFavorite(data)
        setFavoriteIds((prev) => new Set(prev).add(item.id))
      }
    } catch {
      // Next page load will correct the state
    }
  }

  const totalPages = Math.ceil(totalItems / pageSize)

  return (
    <div>
      {!libraryId && (
        <div className="mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search movies and shows..."
            className="w-full bg-m3-surface-container-high border border-m3-outline-variant rounded-full px-5 py-3 text-lg text-m3-on-surface placeholder-m3-outline focus:outline-none focus:border-m3-primary transition-colors"
          />
        </div>
      )}

      {searchResults !== null ? (
        <div>
          <h2 className="text-xl font-medium mb-4 text-m3-on-surface">Search Results</h2>
          {searchResults.length === 0 ? (
            <p className="text-m3-on-surface-variant">No results found.</p>
          ) : (
            <MediaGrid
              items={searchResults.map((r) => ({
                id: r.id,
                title: r.title,
                type: r.type,
                thumb_url: r.thumb_url,
                year: r.year,
              }))}
              onItemClick={handleItemClick}
              favoriteIds={favoriteIds}
              onToggleFavorite={handleToggleFavorite}
            />
          )}
        </div>
      ) : !libraryId ? (
        <div>
          <h2 className="text-xl font-medium mb-2 text-m3-on-surface">{serverName ? `${serverName} Libraries` : 'Libraries'}</h2>
          <p className="text-base text-m3-on-surface-variant mb-4">Choose a library to browse, then select a movie or episode to create a GIF.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {libraries.map((lib) => (
              <button
                key={lib.id}
                onClick={() => navigate(`/browse/${lib.id}`)}
                className="bg-m3-surface-container hover:bg-m3-surface-container-high rounded-md p-8 text-center transition-colors"
              >
                <div className="text-6xl mb-3">{lib.type === 'movie' ? '🎬' : '📺'}</div>
                <div className="font-medium text-xl text-m3-on-surface">{lib.title}</div>
              </button>
            ))}
          </div>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-m3-primary"></div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-medium text-m3-on-surface">
              {libraries.find((l) => l.id === libraryId)?.title || 'Library'}
            </h1>
            <button onClick={() => navigate('/browse')} className="text-m3-primary hover:underline text-base">
              Back to Libraries
            </button>
          </div>
          <p className="text-base text-m3-on-surface-variant mb-4">Click a movie to start creating a GIF, or select a show to browse its episodes.</p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-m3-surface-container-high border border-m3-outline-variant rounded-full px-5 py-3 text-lg text-m3-on-surface placeholder-m3-outline focus:outline-none focus:border-m3-primary transition-colors"
            />
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value as 'added' | 'alpha' | 'year'); setPage(1) }}
                className="w-full appearance-none bg-m3-surface-container-high border border-m3-outline-variant rounded-full pl-4 pr-10 py-3 text-m3-on-surface focus:outline-none focus:border-m3-primary cursor-pointer transition-colors"
              >
                <option value="added">Recently Added</option>
                <option value="alpha">A-Z</option>
                <option value="year">Year</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-m3-on-surface-variant">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
          <MediaGrid items={items} onItemClick={handleItemClick} favoriteIds={favoriteIds} onToggleFavorite={handleToggleFavorite} />
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
        </div>
      )}
    </div>
  )
}
