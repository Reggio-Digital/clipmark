import { MediaItem } from '../api/client'

interface MediaGridProps {
  items: MediaItem[]
  onItemClick: (item: MediaItem) => void
  showEpisodeInfo?: boolean
  favoriteIds?: Set<string>
  onToggleFavorite?: (item: MediaItem) => void
}

export default function MediaGrid({ items, onItemClick, showEpisodeInfo, favoriteIds, onToggleFavorite }: MediaGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onItemClick(item)}
          className="bg-m3-surface-container rounded-md overflow-hidden hover:ring-2 hover:ring-m3-primary transition-all text-left group"
        >
          <div className="aspect-[2/3] bg-m3-surface-container-high relative">
            <img
              src={item.thumb_url}
              alt={item.title}
              loading="lazy"
              className="w-full h-full object-cover"
            />
            {onToggleFavorite && (item.type === 'movie' || item.type === 'show') && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFavorite(item)
                }}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-m3-scrim/50 hover:bg-m3-scrim/70 transition-colors"
              >
                {favoriteIds?.has(item.id) ? (
                  <svg className="w-5 h-5 text-m3-tertiary fill-current" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                  </svg>
                )}
              </button>
            )}
          </div>
          <div className="p-2.5">
            <p className="font-medium text-base truncate text-m3-on-surface">{item.title}</p>
            {showEpisodeInfo && item.type === 'episode' && (
              <p className="text-base text-m3-on-surface-variant">
                S{item.season}E{item.episode}
              </p>
            )}
            {item.year && !showEpisodeInfo && (
              <p className="text-base text-m3-on-surface-variant">{item.year}</p>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
