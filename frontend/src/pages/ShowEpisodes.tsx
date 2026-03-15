import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getShow, getSeasons, getEpisodes, ShowDetail, Season, MediaItem } from '../api/client'
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

  useEffect(() => {
    if (!showId) return
    Promise.all([getShow(showId), getSeasons(showId)]).then(([showData, seasonsData]) => {
      setShow(showData)
      setSeasons(seasonsData)
      setLoading(false)
    })
  }, [showId])

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
          <h1 className="text-2xl font-medium text-m3-on-surface">{show.title}</h1>
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
