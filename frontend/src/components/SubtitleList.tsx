import { useState, useMemo } from 'react'
import { SubtitleLine } from '../api/client'

interface SubtitleListProps {
  subtitles: SubtitleLine[]
  onLineClick: (line: SubtitleLine) => void
  loading?: boolean
  rangeStartMs?: number
  rangeEndMs?: number
  onExtendPrev?: () => void
  onExtendNext?: () => void
}

export default function SubtitleList({
  subtitles,
  onLineClick,
  loading,
  rangeStartMs,
  rangeEndMs,
  onExtendPrev,
  onExtendNext,
}: SubtitleListProps) {
  const [filter, setFilter] = useState('')

  const filteredSubtitles = useMemo(() => {
    if (!filter) return subtitles
    const lower = filter.toLowerCase()
    return subtitles.filter((line) => line.text.toLowerCase().includes(lower))
  }, [subtitles, filter])

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const isInRange = (line: SubtitleLine) => {
    if (rangeStartMs === undefined || rangeEndMs === undefined) return false
    return line.start_ms < rangeEndMs && line.end_ms > rangeStartMs
  }

  const firstInRangeIdx = filteredSubtitles.findIndex(isInRange)
  const lastInRangeIdx = filteredSubtitles.length - 1 - [...filteredSubtitles].reverse().findIndex(isInRange)
  const hasSelection = firstInRangeIdx !== -1
  const hasPrev = hasSelection && firstInRangeIdx > 0
  const hasNext = hasSelection && lastInRangeIdx < filteredSubtitles.length - 1

  return (
    <div>
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Find in subtitles..."
        className="w-full bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-3 py-2 mb-3 text-m3-on-surface placeholder-m3-outline focus:border-m3-primary focus:outline-none transition-colors"
      />
      {loading ? (
        <div className="flex items-center gap-2 text-m3-on-surface-variant text-base py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-m3-primary"></div>
          Loading subtitles...
        </div>
      ) : filteredSubtitles.length === 0 ? (
        <p className="text-m3-on-surface-variant text-base py-2">No subtitles found.</p>
      ) : (
        <table className="w-full text-base">
          <thead>
            <tr className="text-m3-on-surface-variant text-left border-b border-m3-outline-variant">
              <th className="w-20 py-2 font-medium">Time</th>
              <th className="py-2 font-medium">Text</th>
            </tr>
          </thead>
          <tbody>
            {filteredSubtitles.map((line, idx) => {
              const inRange = isInRange(line)
              const isFirstInRange = idx === firstInRangeIdx
              const isLastInRange = idx === lastInRangeIdx
              return (
                <>
                  {isFirstInRange && hasPrev && onExtendPrev && (
                    <tr key={`extend-prev-${line.index}`}>
                      <td colSpan={2} className="py-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); onExtendPrev() }}
                          className="w-full text-center text-xs text-m3-on-surface-variant hover:text-m3-primary hover:bg-m3-surface-container-high py-1 rounded-sm transition-colors"
                        >
                          ↑ Add previous subtitle
                        </button>
                      </td>
                    </tr>
                  )}
                  <tr
                    key={line.index}
                    onClick={() => onLineClick(line)}
                    className={`cursor-pointer hover:bg-m3-surface-container-high transition-colors ${
                      inRange ? 'bg-m3-primary/15' : ''
                    }`}
                  >
                    <td className={`py-1.5 pl-2 font-mono tabular-nums ${
                      inRange ? 'text-m3-primary' : 'text-m3-on-surface-variant'
                    }`}>
                      {formatTime(line.start_ms)}
                    </td>
                    <td className={inRange ? 'py-1.5 pr-2 text-m3-on-surface' : 'py-1.5 pr-2 text-m3-on-surface-variant'}>
                      {line.text}
                    </td>
                  </tr>
                  {isLastInRange && hasNext && onExtendNext && (
                    <tr key={`extend-next-${line.index}`}>
                      <td colSpan={2} className="py-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); onExtendNext() }}
                          className="w-full text-center text-xs text-m3-on-surface-variant hover:text-m3-primary hover:bg-m3-surface-container-high py-1 rounded-sm transition-colors"
                        >
                          ↓ Add next subtitle
                        </button>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
