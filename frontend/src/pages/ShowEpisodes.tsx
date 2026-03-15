import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getShow, getSeasons, getEpisodes, getFavoriteIds, addFavorite, removeFavorite, ShowDetail, Season, MediaItem, FavoriteCreate } from '../api/client'
import MediaGrid from '../components/MediaGrid'

export default function ShowEpisodes() {
  const { showId } = useParams<{ showId: string }>()
  const navigate = useNavigate()
  const [show, setShow] = useState<ShowDetail | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [episodes, setEpisodes] = useState<MediaItem[]>([])
  const [totalEpisodes, setTotalEpisodes] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [isFavorited, setIsFavorited] = useState(false)

  useEffect(() => {
    if (!showId) return
    Promise.all([getShow(showId), getSeasons(showId), getFavoriteIds()]).then(([showData, seasonsData, favIds]) => {
      setShow(showData)
      setSeasons(seasonsData)
      setIsFavorited(favIds.includes(showId))
      setLoading(false)
    })
  }, [showId])

  const handleToggleFavorite = async () => {
    if (!show || !showId) return
    try {
      if (isFavorited) {
        await removeFavorite(showId)
        setIsFavorited(false)
      } else {
        const data: FavoriteCreate = {
          media_id: showId,
          media_type: 'show',
          media_title: show.title,
          thumb_url: show.thumb_url,
          year: show.year,
        }
        await addFavorite(data)
        setIsFavorited(true)
      }
    } catch {
      // Next page load will correct the state
    }
  }

  useEffect(() => {
    if (!showId || selectedSeason === null) return
    setLoading(true)
    getEpisodes(showId, selectedSeason, page, 50).then((response) => {
      setEpisodes(response.items)
      setTotalEpisodes(response.total_items)
      setLoading(false)
    })
  }, [showId, selectedSeason, page])

  if (!show) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-m3-primary"></div>
      </div>
    )
  }

  const totalPages = Math.ceil(totalEpisodes / 50)

  const selectedSeasonData = seasons.find((s) => s.index === selectedSeason)

  return (
    <div>
      <div className="flex gap-6 mb-6">
        <img
          src={show.thumb_url}
          alt={show.title}
          className="w-32 h-48 object-cover rounded-md"
          loading="lazy"
        />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-medium text-m3-on-surface">{show.title}</h1>
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
                <svg className="w-6 h-6 text-m3-on-surface-variant" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                </svg>
              )}
            </button>
          </div>
          {show.year && <p className="text-m3-on-surface-variant">{show.year}</p>}
          <p className="text-m3-on-surface-variant">{show.season_count} Seasons</p>
          <p className="text-base text-m3-on-surface-variant mt-2">
            {selectedSeason === null
              ? 'Select a season to browse episodes.'
              : 'Pick an episode to start creating a GIF from it.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-m3-primary"></div>
        </div>
      ) : selectedSeason === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {seasons.map((season) => (
            <button
              key={season.index}
              onClick={() => {
                setSelectedSeason(season.index)
                setPage(1)
              }}
              className="group text-left rounded-lg overflow-hidden bg-m3-surface-container hover:bg-m3-surface-container-high transition-colors focus:outline-none focus:ring-2 focus:ring-m3-primary"
            >
              {season.thumb_url ? (
                <img
                  src={season.thumb_url}
                  alt={season.title}
                  className="w-full aspect-[2/3] object-cover group-hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-m3-surface-container-highest flex items-center justify-center">
                  <span className="text-4xl font-bold text-m3-on-surface-variant opacity-40">
                    {season.index === 0 ? 'S' : season.index}
                  </span>
                </div>
              )}
              <div className="p-3">
                <p className="text-sm font-medium text-m3-on-surface truncate">{season.title}</p>
                <p className="text-xs text-m3-on-surface-variant">{season.episode_count} episodes</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4">
            <button
              onClick={() => {
                setSelectedSeason(null)
                setEpisodes([])
                setTotalEpisodes(0)
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-m3-on-surface hover:bg-m3-surface-container-high rounded-full transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              {selectedSeasonData?.title ?? `Season ${selectedSeason}`}
            </button>
          </div>

          <MediaGrid
            items={episodes}
            onItemClick={(ep) => navigate(`/create/${ep.id}`)}
            showEpisodeInfo
          />
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
