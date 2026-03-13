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
      if (seasonsData.length > 0) {
        const maxSeason = Math.max(...seasonsData.map((s) => s.index))
        setSelectedSeason(maxSeason)
      }
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
          <p className="text-base text-m3-on-surface-variant mt-2">Pick an episode to start creating a GIF from it.</p>
        </div>
      </div>

      <div className="mb-4">
        <select
          value={selectedSeason ?? ''}
          onChange={(e) => {
            setSelectedSeason(Number(e.target.value))
            setPage(1)
          }}
          className="bg-m3-surface-container-high border border-m3-outline-variant rounded-full px-4 py-2 text-m3-on-surface focus:outline-none focus:border-m3-primary cursor-pointer transition-colors"
        >
          {seasons.map((season) => (
            <option key={season.index} value={season.index}>
              {season.title} ({season.episode_count} episodes)
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-m3-primary"></div>
        </div>
      ) : (
        <>
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
