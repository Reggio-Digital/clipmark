import { useRef, useState } from 'react'

interface TimeInputsProps {
  startMs: number
  durationMs: number
  maxDurationMs: number
  onStartChange: (ms: number) => void
  onDurationChange: (ms: number) => void
  hideDuration?: boolean
}

function formatTimestamp(ms: number): string {
  const totalSeconds = ms / 1000
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const millis = Math.round(ms % 1000)

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

function parseTimestamp(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Try parsing as just a number (seconds or milliseconds)
  const asNumber = parseFloat(trimmed)
  if (!isNaN(asNumber) && !trimmed.includes(':')) {
    // If it looks like milliseconds (large number), treat as ms
    // Otherwise treat as seconds
    return asNumber > 1000 ? asNumber : asNumber * 1000
  }

  // Parse HH:MM:SS.mmm, MM:SS.mmm, or SS.mmm formats
  const parts = trimmed.split(':')
  let hours = 0
  let minutes = 0
  let seconds = 0

  if (parts.length === 3) {
    hours = parseInt(parts[0]) || 0
    minutes = parseInt(parts[1]) || 0
    seconds = parseFloat(parts[2]) || 0
  } else if (parts.length === 2) {
    minutes = parseInt(parts[0]) || 0
    seconds = parseFloat(parts[1]) || 0
  } else if (parts.length === 1) {
    seconds = parseFloat(parts[0]) || 0
  } else {
    return null
  }

  const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000
  return Math.round(totalMs)
}

const START_NUDGES = [-1000, -500, -100, 100, 500, 1000]
const DURATION_NUDGES = [-1000, -500, -100, 100, 500, 1000]

export default function TimeInputs({
  startMs,
  durationMs,
  maxDurationMs,
  onStartChange,
  onDurationChange,
  hideDuration = false,
}: TimeInputsProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [hoverMs, setHoverMs] = useState<number | null>(null)
  const [startInput, setStartInput] = useState<string | null>(null)
  const [durationInput, setDurationInput] = useState<string | null>(null)
  const endMs = startMs + durationMs

  const handleStartNudge = (delta: number) => {
    const newStart = startMs + delta
    if (newStart >= 0 && newStart + durationMs <= maxDurationMs) {
      onStartChange(newStart)
    }
  }

  const handleDurationNudge = (delta: number) => {
    const newDuration = durationMs + delta
    if (newDuration > 0 && startMs + newDuration <= maxDurationMs) {
      onDurationChange(newDuration)
    }
  }

  const getTimeFromMouseEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return null
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, x / rect.width))
    return Math.round(percent * maxDurationMs)
  }

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const newStartMs = getTimeFromMouseEvent(e)
    if (newStartMs === null) return
    const clampedStart = Math.max(0, Math.min(newStartMs, maxDurationMs - durationMs))
    onStartChange(clampedStart)
  }

  const handleTimelineHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const ms = getTimeFromMouseEvent(e)
    setHoverMs(ms)
  }

  const handleTimelineLeave = () => {
    setHoverMs(null)
  }

  const handleStartInputChange = (value: string) => {
    setStartInput(value)
  }

  const handleStartInputBlur = () => {
    if (startInput !== null) {
      const parsed = parseTimestamp(startInput)
      if (parsed !== null) {
        const clamped = Math.max(0, Math.min(parsed, maxDurationMs - durationMs))
        onStartChange(clamped)
      }
      setStartInput(null)
    }
  }

  const handleStartInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleStartInputBlur()
    }
  }

  const handleDurationInputChange = (value: string) => {
    setDurationInput(value)
  }

  const handleDurationInputBlur = () => {
    if (durationInput !== null) {
      const parsed = parseFloat(durationInput)
      if (!isNaN(parsed) && parsed > 0) {
        const newDurationMs = parsed * 1000
        const clamped = Math.max(100, Math.min(newDurationMs, maxDurationMs - startMs, 30000))
        onDurationChange(clamped)
      }
      setDurationInput(null)
    }
  }

  const handleDurationInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleDurationInputBlur()
    }
  }

  const startPercent = (startMs / maxDurationMs) * 100
  const endPercent = (endMs / maxDurationMs) * 100

  return (
    <div>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-1">
          <p className="text-base text-m3-on-surface-variant">Click timeline to jump start</p>
          <p className="text-base text-m3-on-surface-variant font-mono">
            {formatTimestamp(startMs)} → {formatTimestamp(endMs)}
          </p>
        </div>
        <div
          ref={timelineRef}
          onClick={handleTimelineClick}
          onMouseMove={handleTimelineHover}
          onMouseLeave={handleTimelineLeave}
          className="relative h-10 bg-m3-surface-container-highest rounded-sm cursor-crosshair"
        >
          <div
            className="absolute top-0 bottom-0 bg-m3-primary/30 border-y-2 border-m3-primary/50"
            style={{
              left: `${startPercent}%`,
              width: `${Math.min(endPercent - startPercent, 100 - startPercent)}%`,
            }}
          />
          <div
            className="absolute top-0 bottom-0 w-1 bg-m3-primary"
            style={{ left: `${startPercent}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-m3-primary/70"
            style={{ left: `${endPercent}%` }}
          />
          {hoverMs !== null && (
            <>
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/50"
                style={{ left: `${(hoverMs / maxDurationMs) * 100}%` }}
              />
              <div
                className="absolute -top-6 transform -translate-x-1/2 bg-m3-surface-container-high text-m3-on-surface text-base px-2 py-1 rounded-xs whitespace-nowrap"
                style={{ left: `${(hoverMs / maxDurationMs) * 100}%` }}
              >
                {formatTimestamp(hoverMs)}
              </div>
            </>
          )}
        </div>
        <div className="flex justify-between text-base text-m3-outline mt-1">
          <span>0:00</span>
          <span>{formatTimestamp(maxDurationMs)}</span>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-base text-m3-on-surface-variant mb-1">Start time</label>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={startInput !== null ? startInput : formatTimestamp(startMs)}
            onChange={(e) => handleStartInputChange(e.target.value)}
            onBlur={handleStartInputBlur}
            onKeyDown={handleStartInputKeyDown}
            className="w-40 bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-3 py-2 font-mono text-m3-on-surface focus:border-m3-primary focus:outline-none transition-colors"
          />
          <div className="flex gap-1">
            {START_NUDGES.map((delta) => (
              <button
                key={delta}
                onClick={() => handleStartNudge(delta)}
                className="px-2 py-1 text-base border border-m3-outline-variant text-m3-on-surface-variant hover:bg-m3-surface-container-high rounded-full transition-colors"
              >
                {delta > 0 ? '+' : ''}{delta / 1000}s
              </button>
            ))}
          </div>
        </div>
      </div>

      {!hideDuration && (
        <>
          <div className="mb-4">
            <label className="block text-base text-m3-on-surface-variant mb-1">Duration (seconds)</label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={durationInput !== null ? durationInput : (durationMs / 1000).toFixed(1)}
                onChange={(e) => handleDurationInputChange(e.target.value)}
                onBlur={handleDurationInputBlur}
                onKeyDown={handleDurationInputKeyDown}
                className="w-24 bg-m3-surface-container-high border border-m3-outline-variant rounded-sm px-3 py-2 font-mono text-m3-on-surface focus:border-m3-primary focus:outline-none transition-colors"
              />
              <div className="flex gap-1">
                {DURATION_NUDGES.map((delta) => (
                  <button
                    key={delta}
                    onClick={() => handleDurationNudge(delta)}
                    className="px-2 py-1 text-base border border-m3-outline-variant text-m3-on-surface-variant hover:bg-m3-surface-container-high rounded-full transition-colors"
                  >
                    {delta > 0 ? '+' : ''}{delta / 1000}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="text-base text-m3-outline">
            End time: <span className="font-mono">{formatTimestamp(endMs)}</span>
          </div>
        </>
      )}
    </div>
  )
}
