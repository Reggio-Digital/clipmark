import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { listFavorites, removeFavorite, FavoriteResponse } from '../api/client'
import { showToast } from '../components/Toast'

export default function Favorites() {
  const navigate = useNavigate()
  const [favorites, setFavorites] = useState<FavoriteResponse[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const loadFavorites = useCallback(async () => {
    try {
      setLoading(true)
      const mediaType = filter === 'all' ? undefined : filter
      const response = await listFavorites(page, 50, mediaType)
      setFavorites(response.items)
      setTotalItems(response.total_items)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load favorites')
    } finally {
      setLoading(false)
    }
  }, [page, filter])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  const handleRemove = async (mediaId: string) => {
    try {
      await removeFavorite(mediaId)
      loadFavorites()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to remove favorite')
    }
  }

  const handleClick = (fav: FavoriteResponse) => {
    if (fav.media_type === 'show') {
      navigate(`/shows/${fav.media_id}`)
    } else {
      // Both movies and episodes go to the create page
      navigate(`/create/${fav.media_id}`)
    }
  }

  const totalPages = Math.ceil(totalItems / 50)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-medium text-m3-on-surface">Favorites</h1>
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(1) }}
          className="bg-m3-surface-container-high border border-m3-outline-variant rounded-full px-3 py-2 text-base text-m3-on-surface focus:border-m3-primary focus:outline-none transition-colors"
        >
          <option value="all">All</option>
          <option value="movie">Movies</option>
          <option value="show">Shows</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-m3-primary"></div>
        </div>
      ) : favorites.length === 0 ? (
        <p className="text-m3-on-surface-variant text-center py-12">
          {filter !== 'all' ? 'No favorites match this filter.' : 'No favorites yet. Browse your library and tap the heart icon to add favorites.'}
        </p>
      ) : (
        <>
          {totalItems > 0 && (
            <p className="text-base text-m3-outline mb-3">
              {totalItems} favorite{totalItems !== 1 ? 's' : ''}
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {favorites.map((fav) => (
              <div key={fav.id} className="bg-m3-surface-container rounded-md overflow-hidden hover:ring-2 hover:ring-m3-primary transition-all">
                <button
                  onClick={() => handleClick(fav)}
                  className="w-full text-left"
                >
                  <div className="aspect-[2/3] bg-m3-surface-container-high relative">
                    <img
                      src={fav.thumb_url}
                      alt={fav.media_title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemove(fav.media_id)
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-m3-scrim/50 hover:bg-m3-scrim/70 transition-colors"
                    >
                      <svg className="w-5 h-5 text-m3-tertiary fill-current" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                      </svg>
                    </button>
                    <span className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-m3-scrim/60 rounded-xs text-xs text-m3-on-surface-variant">
                      {fav.media_type === 'movie' ? 'Movie' : fav.media_type === 'episode' ? 'Episode' : 'Show'}
                    </span>
                  </div>
                  <div className="p-2">
                    {fav.media_type === 'episode' ? (
                      <>
                        <p className="font-medium text-base text-m3-on-surface truncate" title={fav.media_title}>{fav.media_title}</p>
                        <p className="text-base text-m3-on-surface-variant truncate">
                          {fav.show_title}{fav.season != null && fav.episode != null && ` \u00B7 S${fav.season}E${fav.episode}`}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-base text-m3-on-surface truncate">{fav.media_title}</p>
                        {fav.year && <p className="text-base text-m3-on-surface-variant">{fav.year}</p>}
                      </>
                    )}
                  </div>
                </button>
              </div>
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
