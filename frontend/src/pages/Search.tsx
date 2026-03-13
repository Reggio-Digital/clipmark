import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { search, getFavoriteIds, addFavorite, removeFavorite, SearchResult, MediaItem, FavoriteCreate } from '../api/client'
import MediaGrid from '../components/MediaGrid'

export default function Search() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const query = searchParams.get('q') || ''
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    getFavoriteIds().then((ids) => setFavoriteIds(new Set(ids))).catch(() => {})
  }, [])

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    search(query).then((r) => {
      setResults(r)
      setLoading(false)
    })
  }, [query])

  const handleItemClick = (item: SearchResult) => {
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
        }
        await addFavorite(data)
        setFavoriteIds((prev) => new Set(prev).add(item.id))
      }
    } catch {
      // Next page load will correct the state
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-medium mb-6 text-m3-on-surface">Search Results for "{query}"</h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-m3-primary"></div>
        </div>
      ) : results.length === 0 ? (
        <p className="text-m3-on-surface-variant">No results found.</p>
      ) : (
        <MediaGrid
          items={results.map((r) => ({
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
  )
}
