import React, { useEffect, useRef, useState } from 'react'
import { Tag, Check } from 'lucide-react'
import { subscribe } from '../lib/undoToast'

export default function UndoToast() {
  const [toast, setToast] = useState(null)
  const [visible, setVisible] = useState(false)
  const [showColMenu, setShowColMenu] = useState(false)
  const [colMenuPos, setColMenuPos] = useState(null)
  const [collections, setCollections] = useState([])
  const timerRef = useRef(null)
  const tagBtnRef = useRef(null)
  const colMenuRef = useRef(null)
  const visTimerRef = useRef(null)

  const [memberOf, setMemberOf] = useState(new Set())

  useEffect(() => {
    return subscribe(({ message, undoFn, id, duration, clipIds }) => {
      clearTimeout(timerRef.current)
      clearTimeout(visTimerRef.current)
      setVisible(false)
      setShowColMenu(false)
      setMemberOf(new Set())
      visTimerRef.current = setTimeout(() => {
        setToast({ message, undoFn, id, duration: duration ?? 10000, clipIds: clipIds ?? null })
        setVisible(true)
        timerRef.current = setTimeout(() => dismiss(), duration ?? 10000)
      }, 50)
    })
  }, [])

  useEffect(() => {
    async function loadCollections() {
      const r = await window.api.collections.list()
      if (r.ok) setCollections(r.data)
    }
    loadCollections()
  }, [])

  useEffect(() => {
    if (!showColMenu) return
    function handleOutside(e) {
      const inMenu = colMenuRef.current?.contains(e.target)
      const inBtn = tagBtnRef.current?.contains(e.target)
      if (!inMenu && !inBtn) setShowColMenu(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showColMenu])

  function openColMenu(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!tagBtnRef.current) return
    const rect = tagBtnRef.current.getBoundingClientRect()
    const estimated = Math.min((collections?.length ?? 0) * 38 + 48, 280)
    const spaceBelow = window.innerHeight - rect.top
    setColMenuPos({
      right: window.innerWidth - rect.left + 4,
      top: spaceBelow < estimated + 20 ? Math.max(rect.bottom - estimated, 8) : rect.top
    })
    setShowColMenu(true)
  }

  async function toggleCollection(colId) {
    const clipIds = toast?.clipIds ?? []
    if (memberOf.has(colId)) {
      for (const id of clipIds) await window.api.collections.removeClip(colId, id)
      setMemberOf(prev => { const next = new Set(prev); next.delete(colId); return next })
    } else {
      for (const id of clipIds) await window.api.collections.addClip(colId, id)
      setMemberOf(prev => new Set([...prev, colId]))
    }
  }

  function dismiss() {
    clearTimeout(timerRef.current)
    setShowColMenu(false)
    setVisible(false)
    setTimeout(() => setToast(null), 300)
  }

  function handleUndo() {
    toast?.undoFn?.()
    dismiss()
  }

  if (!toast) return null

  const isNotice = !toast.undoFn

  return (
    <>
      <div
        className="fixed bottom-8 left-1/2 z-[51] pointer-events-none"
        style={{ transform: 'translateX(-50%)' }}
      >
        <div
          className={`transition-all duration-300 ease-out ${
            visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'
          }`}
        >
          <div
            className="flex items-center bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl px-8 py-3 pointer-events-auto"
            style={{ width: '520px' }}
          >
            <span className="flex-1 text-sm font-medium text-white pointer-events-none">{toast.message}</span>

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
                  {toast.clipIds?.length > 0 && collections.length > 0 && (
                    <button
                      ref={tagBtnRef}
                      onClick={openColMenu}
                      title="Add to collection"
                      className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
                        memberOf.size > 0 ? 'text-twitch-purple' : 'text-twitch-muted hover:bg-twitch-surface hover:text-twitch-text'
                      }`}
                    >
                      <Tag size={13} />
                    </button>
                  )}
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
        </div>
      </div>

      {showColMenu && colMenuPos && collections && collections.length > 0 && (
        <div
          ref={colMenuRef}
          style={{ position: 'fixed', right: colMenuPos.right, top: colMenuPos.top, zIndex: 1000 }}
          className="w-48 bg-twitch-mid border border-twitch-border rounded-lg shadow-xl py-1 pointer-events-auto"
        >
          <p className="px-3 py-1.5 text-[10px] text-twitch-muted font-semibold uppercase tracking-wide border-b border-twitch-border mb-1">
            Collections
          </p>
          {collections.map(col => (
            <button
              key={col.id}
              onClick={() => toggleCollection(col.id)}
              className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-twitch-surface transition-colors"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.color }} />
              <span className="flex-1 truncate text-twitch-text">{col.name}</span>
              {memberOf.has(col.id) && <Check size={11} className="text-twitch-purple shrink-0" />}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes toast-progress {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
    </>
  )
}

