import { useState, useEffect, useCallback } from 'react'

interface ToastMessage {
  id: number
  text: string
  type: 'error' | 'success'
}

let toastId = 0
let addToastFn: ((text: string, type: 'error' | 'success') => void) | null = null

export function showToast(text: string, type: 'error' | 'success' = 'error') {
  addToastFn?.(text, type)
}

export default function Toast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((text: string, type: 'error' | 'success') => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, text, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  useEffect(() => {
    addToastFn = addToast
    return () => { addToastFn = null }
  }, [addToast])

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-3 items-center">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-4 px-6 py-4 rounded-xl shadow-elevation-3 min-w-[340px] max-w-[520px] animate-slide-up ${
            toast.type === 'error'
              ? 'bg-m3-error text-m3-on-error'
              : 'bg-m3-primary text-m3-on-primary'
          }`}
        >
          <span className="flex-1 text-base font-medium">{toast.text}</span>
          <button
            onClick={() => dismiss(toast.id)}
            className="opacity-70 hover:opacity-100 transition-opacity flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
