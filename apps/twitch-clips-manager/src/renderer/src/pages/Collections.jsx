import React, { useEffect, useState, useMemo, useRef } from 'react'
import { Plus, Trash2, Check, X, Layers, ChevronDown } from 'lucide-react'

const PRESET_COLORS = ['#9146ff', '#0984e3', '#00b894', '#e17055', '#fd79a8', '#fdcb6e']

function duration(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function ClipCard({ clip, canRemove, onRemove, onDragStart }) {
  const [expanded, setExpanded] = useState(false)
  const [videoUrl, setVideoUrl] = useState(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [urlError, setUrlError] = useState(null)
  const videoRef = useRef(null)

  async function handleExpand() {
    const open = !expanded
    setExpanded(open)
    if (open && !videoUrl) {
      setLoadingUrl(true)
      setUrlError(null)
      const r = await window.api.clips.getVideoUrl(clip.id)
      if (r.ok) setVideoUrl(r.data); else setUrlError(r.error)
      setLoadingUrl(false)
    }
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`rounded-lg border transition-colors overflow-hidden bg-twitch-surface ${expanded ? 'border-twitch-purple' : 'border-twitch-border'}`}
    >
      <div className="flex items-center gap-3 p-3">
        <div className="relative shrink-0 w-24 h-[54px] rounded overflow-hidden bg-black cursor-grab active:cursor-grabbing">
          {clip.thumbnail_url
            ? <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-twitch-mid" />}
          {clip.duration != null && (
            <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[9px] px-0.5 rounded">
              {duration(clip.duration)}
            </span>
          )}
        </div>
        <button className="flex-1 min-w-0 text-left" onClick={handleExpand}>
          <p className="text-sm font-medium text-twitch-text truncate">{clip.title}</p>
          <p className="text-xs text-twitch-muted">{clip.broadcaster_name}</p>
        </button>
        {canRemove && (
          <button
            onClick={e => { e.stopPropagation(); onRemove() }}
            title="Remove from collection"
            className="shrink-0 w-7 h-7 rounded flex items-center justify-center text-twitch-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <X size={13} />
          </button>
        )}
        <button onClick={handleExpand} className="shrink-0 text-twitch-muted hover:text-twitch-text transition-colors">
          <ChevronDown size={15} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-twitch-border">
          <div className="bg-black" style={{ aspectRatio: '16/9' }}>
            {loadingUrl && <div className="w-full h-full flex items-center justify-center text-twitch-muted text-sm">Loading video...</div>}
            {urlError && <div className="w-full h-full flex items-center justify-center text-red-400 text-sm px-4 text-center">{urlError}</div>}
            {videoUrl && <video ref={videoRef} key={videoUrl} className="w-full h-full" controls autoPlay src={videoUrl} />}
          </div>
        </div>
      )}
    </div>
  )
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex gap-1.5">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-5 h-5 rounded-full border-2 transition-all"
          style={{ background: c, borderColor: value === c ? '#fff' : 'transparent' }}
        />
      ))}
    </div>
  )
}

export default function Collections() {
  const [collections, setCollections] = useState([])
  const [selectedId, setSelectedId] = useState('main')
  const [clips, setClips] = useState([])
  const [clipsLoading, setClipsLoading] = useState(false)
  const [approvedCount, setApprovedCount] = useState(0)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [creating, setCreating] = useState(false)

  // Rename
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [dragOverColId, setDragOverColId] = useState(null)

  const allCollections = useMemo(() => [
    { id: 'main', name: 'Main Queue', color: '#9146ff', clipCount: approvedCount },
    ...collections
  ], [collections, approvedCount])

  async function loadCollections() {
    const r = await window.api.collections.list()
    if (r.ok) setCollections(r.data)
    const q = await window.api.clips.getQueue()
    if (q.ok) setApprovedCount(q.data.length)
  }

  useEffect(() => { loadCollections() }, [])

  useEffect(() => { loadSelectedClips() }, [selectedId])

  async function loadSelectedClips() {
    setClipsLoading(true)
    if (selectedId === 'main') {
      const r = await window.api.clips.getQueue()
      if (r.ok) setClips(r.data)
    } else {
      const r = await window.api.collections.getClips(selectedId)
      if (r.ok) setClips(r.data)
    }
    setClipsLoading(false)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    const r = await window.api.collections.create(newName.trim(), newColor)
    if (r.ok) {
      await loadCollections()
      setSelectedId(r.data.id)
      setShowCreate(false)
      setNewName('')
      setNewColor(PRESET_COLORS[0])
    }
    setCreating(false)
  }

  async function handleDelete(id) {
    await window.api.collections.delete(id)
    if (selectedId === id) setSelectedId('main')
    loadCollections()
  }

  async function startRename(col) {
    setEditingId(col.id)
    setEditName(col.name)
  }

  async function commitRename(id) {
    if (editName.trim()) await window.api.collections.update(id, editName.trim(), undefined)
    setEditingId(null)
    loadCollections()
  }

  async function handleRemoveClip(clipId) {
    if (selectedId === 'main') return
    await window.api.collections.removeClip(selectedId, clipId)
    setClips(prev => prev.filter(c => c.id !== clipId))
    loadCollections()
  }

  function onDragStart(e, clipId) {
    e.dataTransfer.setData('application/json', JSON.stringify({ clipId, sourceColId: selectedId }))
    e.dataTransfer.effectAllowed = 'move'
  }

  async function onDrop(e, targetColId) {
    e.preventDefault()
    setDragOverColId(null)
    if (targetColId === 'main') return
    try {
      const { clipId, sourceColId } = JSON.parse(e.dataTransfer.getData('application/json'))
      if (targetColId === sourceColId) return
      await window.api.collections.addClip(targetColId, clipId)
      if (sourceColId !== 'main') {
        await window.api.collections.removeClip(sourceColId, clipId)
        setClips(prev => prev.filter(c => c.id !== clipId))
      }
      loadCollections()
    } catch {}
  }

  const selected = allCollections.find(c => c.id === selectedId)

  return (
    <div className="flex h-full">
      {/* Left: collection list */}
      <aside className="w-56 border-r border-twitch-border bg-twitch-mid flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-twitch-border flex items-center justify-between">
          <h2 className="font-semibold text-sm text-twitch-text">Collections</h2>
          <button
            onClick={() => setShowCreate(v => !v)}
            title="New collection"
            className="w-6 h-6 rounded flex items-center justify-center text-twitch-muted hover:text-twitch-text hover:bg-twitch-surface transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>

        {showCreate && (
          <div className="px-3 py-3 border-b border-twitch-border space-y-2 bg-twitch-surface">
            <input
              className="input text-sm w-full"
              placeholder="Collection name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <div className="flex gap-1.5">
              <button className="btn-purple text-xs flex-1 py-1" onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? '...' : 'Create'}
              </button>
              <button className="btn-ghost text-xs px-2 py-1" onClick={() => setShowCreate(false)}>
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
          {allCollections.map(col => (
            <div key={col.id} className="group relative">
              {editingId === col.id ? (
                <input
                  className="input text-sm w-full px-2 py-5"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={() => commitRename(col.id)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(col.id); if (e.key === 'Escape') setEditingId(null) }}
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => setSelectedId(col.id)}
                  onDoubleClick={() => col.id !== 'main' && startRename(col)}
                  onDragOver={col.id !== 'main' ? e => { e.preventDefault(); setDragOverColId(col.id) } : undefined}
                  onDragLeave={col.id !== 'main' ? () => setDragOverColId(null) : undefined}
                  onDrop={col.id !== 'main' ? e => onDrop(e, col.id) : undefined}
                  className={`w-full text-left px-3 py-3 rounded-md transition-colors flex items-center gap-2 ${
                    dragOverColId === col.id
                      ? 'bg-twitch-purple/20 border border-twitch-purple/50 text-twitch-text'
                      : selectedId === col.id
                        ? 'bg-twitch-surface text-twitch-text'
                        : 'text-twitch-muted hover:bg-twitch-surface/60 hover:text-twitch-text'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.color }} />
                  <span className="flex-1 text-sm truncate">{col.name}</span>
                  <span className="text-[10px] text-twitch-border shrink-0">{col.clipCount ?? 0}</span>
                </button>
              )}
              {col.id !== 'main' && editingId !== col.id && (
                <button
                  onClick={() => handleDelete(col.id)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-twitch-muted hover:text-red-400 transition-all"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Center: clips in selected collection */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-twitch-border flex items-center gap-2 shrink-0">
          {selected && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: selected.color }} />}
          <h1 className="font-bold text-lg text-twitch-text">{selected?.name ?? 'Collection'}</h1>
          <span className="text-xs text-twitch-muted ml-1">{clips.length} clip{clips.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {clipsLoading && <p className="text-twitch-muted text-sm text-center mt-8">Loading...</p>}

          {!clipsLoading && clips.length === 0 && (
            <div className="text-center mt-16 space-y-2">
              <Layers size={32} className="mx-auto text-twitch-border" />
              <p className="text-twitch-muted text-sm">
                {selectedId === 'main' ? 'No approved clips yet.' : 'No clips in this collection yet.'}
              </p>
              {selectedId !== 'main' && (
                <p className="text-twitch-border text-xs">Go to Review and use the tag button on approved clips to add them here.</p>
              )}
            </div>
          )}

          {!clipsLoading && clips.map(clip => (
            <ClipCard
              key={clip.id}
              clip={clip}
              canRemove={selectedId !== 'main'}
              onRemove={() => handleRemoveClip(clip.id)}
              onDragStart={e => onDragStart(e, clip.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
