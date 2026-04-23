import React, { useEffect, useRef, useState, useMemo } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import CreateCollectionModal from './CreateCollectionModal'

export default function CollectionPicker({
  mode = 'single',
  memberOf,
  selectedIds,
  onToggle,
  onCreate,
  onCollectionsChanged,
  onSelect,
  renderTrigger,
  menuClassName = '',
  zIndex = 9999
}) {
  const [collections, setCollections] = useState([])
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  async function loadCollections() {
    const r = await window.api.collections.list()
    if (r.ok) setCollections(r.data)
  }

  useEffect(() => {
    loadCollections()
  }, [])

  useEffect(() => {
    if (!showMenu) return
    function handleOutside(e) {
      const inMenu = menuRef.current?.contains(e.target)
      const inBtn = triggerRef.current?.contains(e.target)
      if (!inMenu && !inBtn) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showMenu])

  const batchState = useMemo(() => {
    if (mode !== 'batch' || !selectedIds?.size) return new Map()
    const ids = [...selectedIds]
    return new Map(
      collections.map(col => {
        const clipIds = new Set(col.clipIds || [])
        const matched = ids.filter(id => clipIds.has(id)).length
        if (matched === 0) return [col.id, 'none']
        if (matched === ids.length) return [col.id, 'all']
        return [col.id, 'some']
      })
    )
  }, [mode, selectedIds, collections])

  function openMenu(e) {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    if (!triggerRef.current) return
    loadCollections()
    const rect = triggerRef.current.getBoundingClientRect()
    const estimated = Math.min((collections?.length ?? 0) * 38 + 48, 280)
    const spaceBelow = window.innerHeight - rect.top
    setMenuPos({
      right: window.innerWidth - rect.left + 4,
      top: spaceBelow < estimated + 20 ? Math.max(rect.bottom - estimated, 8) : rect.top
    })
    setShowMenu(v => !v)
  }

  async function handleToggle(colId) {
    await onToggle?.(colId)
    onCollectionsChanged?.()
  }

  async function handleSelect(colId) {
    if (mode === 'batch') {
      const state = batchState.get(colId)
      const shouldAdd = state !== 'all'
      await onSelect?.(colId, shouldAdd)
      loadCollections()
      return
    }
    await onSelect?.(colId)
    setShowMenu(false)
  }

  async function handleCreated(newCol) {
    setCollections(prev => [...prev, newCol])
    await onCreate?.(newCol)
    setShowCreate(false)
    onCollectionsChanged?.()
  }

  return (
    <>
      {renderTrigger?.(triggerRef, openMenu)}

      {/* Fixed-position collections dropdown */}
      {showMenu && menuPos && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', right: menuPos.right, top: menuPos.top, zIndex }}
          className={`w-48 bg-twitch-mid border border-twitch-border rounded-lg shadow-xl py-1 ${menuClassName}`}
        >
          <p className={`px-3 py-1.5 text-[10px] text-twitch-muted font-semibold uppercase tracking-wide border-b border-twitch-border ${collections.length > 0 ? 'mb-0' : ''}`}>
            {mode === 'batch' ? 'Add to Collection' : 'Collections'}
          </p>
          {collections.map(col => (
            <button
              key={col.id}
              onClick={() => mode === 'batch' ? handleSelect(col.id) : handleToggle(col.id)}
              className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-twitch-surface transition-colors"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.color }} />
              <span className="flex-1 truncate text-twitch-text">{col.name}</span>
              {mode === 'single' && memberOf?.has?.(col.id) && <Check size={11} className="text-twitch-purple shrink-0" />}
              {mode === 'batch' && batchState.get(col.id) === 'all' && <Check size={11} className="text-twitch-purple shrink-0" />}
              {mode === 'batch' && batchState.get(col.id) === 'some' && <Minus size={11} className="text-twitch-purple shrink-0" />}
            </button>
          ))}
          <button
            onClick={() => setShowCreate(true)}
            className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-twitch-surface transition-colors ${collections.length > 0 ? 'border-t border-twitch-border' : ''} text-twitch-muted hover:text-twitch-text`}
          >
            <Plus size={13} />
            <span className="flex-1">New Collection</span>
          </button>
        </div>
      )}

      <CreateCollectionModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreated}
      />
    </>
  )
}

