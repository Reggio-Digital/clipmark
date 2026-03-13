import { useState, useEffect } from 'react'
import { getFrameUrl } from '../api/client'

interface FramePreviewProps {
  mediaId: string
  timestampMs: number
}

export default function FramePreview({ mediaId, timestampMs }: FramePreviewProps) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setFrameUrl(getFrameUrl(mediaId, timestampMs))
    }, 300)
    return () => clearTimeout(timeout)
  }, [mediaId, timestampMs])

  return (
    <div className="aspect-video bg-m3-surface-container-lowest rounded-t-md overflow-hidden">
      {frameUrl ? (
        <img
          src={frameUrl}
          alt="Frame preview"
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-m3-on-surface-variant">
          Loading...
        </div>
      )}
    </div>
  )
}
