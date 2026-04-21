import React, { useEffect, useRef, useState } from 'react'
import { subscribe } from '../lib/undoToast'

export default function UndoToast() {
  const [toast, setToast] = useState(null)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)
  const visTimerRef = useRef(null)

  useEffect(() => {
    return subscribe(({ message, undoFn, id, duration }) => {
      clearTimeout(timerRef.current)
      clearTimeout(visTimerRef.current)
      setVisible(false)
      visTimerRef.current = setTimeout(() => {
        setToast({ message, undoFn, id, duration: duration ?? 10000 })
        setVisible(true)
        timerRef.current = setTimeout(() => dismiss(), duration ?? 10000)
      }, 50)
    })
  }, [])

  function dismiss() {
    clearTimeout(timerRef.current)
    setVisible(false)
    setTimeout(() => setToast(null), 300)
  }

  function handleUndo() {
    toast.undoFn?.()
    dismiss()
  }

  if (!toast) return null

  const isNotice = !toast.undoFn

  return (
    <div
      className="fixed bottom-8 left-1/2 z-50 pointer-events-auto"
      style={{ transform: 'translateX(-50%)' }}
    >
      <div
        className={`transition-all duration-300 ease-out ${
          visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'
        }`}
      >
        <div
          className="flex items-center bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl px-8 py-3"
          style={{ width: '520px' }}
        >
          <span className="flex-1 text-sm font-medium text-white">{toast.message}</span>
          <div className="flex items-center gap-2 shrink-0">
            {isNotice ? (
              <button
                onClick={dismiss}
                className="text-sm text-white/40 hover:text-white/70 transition-colors px-3 py-1.5"
              >
                OK
              </button>
            ) : (
              <>
                <button
                  onClick={dismiss}
                  className="text-sm text-white/40 hover:text-white/70 transition-colors px-3 py-1.5"
                >
                  Dismiss
                </button>
                <button
                  onClick={handleUndo}
                  className="text-sm font-semibold bg-twitch-purple hover:bg-twitch-purple/80 text-white px-6 py-2 rounded-xl transition-colors"
                >
                  Undo
                </button>
              </>
            )}
          </div>
        </div>
        <div className="mx-3 h-0.5 bg-white/5 rounded-full overflow-hidden mt-1">
          {visible && (
            <div
              className="h-full bg-twitch-purple/60 rounded-full origin-left"
              style={{ animation: `toast-progress ${toast.duration}ms linear forwards` }}
            />
          )}
        </div>
      </div>
      <style>{`
        @keyframes toast-progress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  )
}
