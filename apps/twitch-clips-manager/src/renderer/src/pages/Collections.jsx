import React, { useEffect, useState, useMemo, useRef } from 'react'
import { Plus, Trash2, Check, X, Layers, Shuffle, Sliders } from 'lucide-react'

const PRESET_COLORS = ['#9146ff', '#0984e3', '#00b894', '#e17055', '#fd79a8', '#fdcb6e']

function duration(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
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

  // Playback config
  const [playMode, setPlayMode] = useState('single')
  const [activeSingleId, setActiveSingleId] = useState('main')
  const [weightedSets, setWeightedSets] = useState([])
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

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

  async function loadPlaybackConfig() {
    const r = await window.api.playback.getConfig()
    if (!r.ok) return
    setPlayMode(r.data.mode)
    setActiveSingleId(r.data.activeCollectionId || 'main')
    setWeightedSets(r.data.weightedSets || [])
  }

  useEffect(() => {
    loadCollections()
    loadPlaybackConfig()
  }, [])

  useEffect(() => {
    loadSelectedClips()
  }, [selectedId])

  async function loadSelectedClips() {
    if (selectedId === 'main') {
      setClipsLoading(true)
      const r = await window.api.clips.getQueue()
      if (r.ok) setClips(r.data)
      setClipsLoading(false)
      return
    }
    setClipsLoading(true)
    const r = await window.api.collections.getClips(selectedId)
    if (r.ok) setClips(r.data)
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

  // Weighted sets helpers
  function isInWeightedSet(colId) {
    return weightedSets.some(s => s.collectionId === colId)
  }

  function toggleWeightedSet(colId) {
    if (isInWeightedSet(colId)) {
      setWeightedSets(prev => prev.filter(s => s.collectionId !== colId))
    } else {
      setWeightedSets(prev => [...prev, { collectionId: colId, weight: 50 }])
    }
  }

  function setWeight(colId, weight) {
    setWeightedSets(prev => prev.map(s => s.collectionId === colId ? { ...s, weight: Math.max(1, Math.min(100, Number(weight) || 1)) } : s))
  }

  const totalWeight = weightedSets.reduce((s, w) => s + w.weight, 0)

  async function saveConfig() {
    setSavingConfig(true)
    await window.api.playback.setConfig({
      mode: playMode,
      activeCollectionId: playMode === 'single' ? activeSingleId : 'main',
      weightedSets: playMode === 'weighted' ? weightedSets : []
    })
    setSavingConfig(false)
    setConfigSaved(true)
    setTimeout(() => setConfigSaved(false), 2000)
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

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {allCollections.map(col => (
            <div key={col.id} className="group relative">
              {editingId === col.id ? (
                <input
                  className="input text-sm w-full px-3 py-2"
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
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-center gap-2 ${
                    selectedId === col.id
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
            <div key={clip.id} className="flex items-center gap-3 p-3 rounded-lg border border-twitch-border bg-twitch-surface">
              <div className="relative shrink-0 w-24 h-[54px] rounded overflow-hidden bg-black">
                {clip.thumbnail_url
                  ? <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-twitch-mid" />}
                {clip.duration != null && (
                  <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[9px] px-0.5 rounded">
                    {duration(clip.duration)}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-twitch-text truncate">{clip.title}</p>
                <p className="text-xs text-twitch-muted">{clip.broadcaster_name}</p>
              </div>
              {selectedId !== 'main' && (
                <button
                  onClick={() => handleRemoveClip(clip.id)}
                  title="Remove from collection"
                  className="shrink-0 w-7 h-7 rounded flex items-center justify-center text-twitch-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right: playback config */}
      <aside className="w-64 border-l border-twitch-border bg-twitch-mid flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-twitch-border flex items-center gap-2">
          <Sliders size={15} className="text-twitch-purple" />
          <h2 className="font-semibold text-sm text-twitch-text">Playback Config</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Mode toggle */}
          <div>
            <p className="label mb-2">Mode</p>
            <div className="flex rounded-lg overflow-hidden border border-twitch-border">
              <button
                onClick={() => setPlayMode('single')}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${playMode === 'single' ? 'bg-twitch-purple text-white' : 'text-twitch-muted hover:text-twitch-text'}`}
              >
                Single
              </button>
              <button
                onClick={() => setPlayMode('weighted')}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${playMode === 'weighted' ? 'bg-twitch-purple text-white' : 'text-twitch-muted hover:text-twitch-text'}`}
              >
                <span className="flex items-center justify-center gap-1"><Shuffle size={11} /> Weighted</span>
              </button>
            </div>
          </div>

          {/* Single mode */}
          {playMode === 'single' && (
            <div>
              <p className="label mb-2">Play from</p>
              <div className="space-y-1">
                {allCollections.map(col => (
                  <button
                    key={col.id}
                    onClick={() => setActiveSingleId(col.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                      activeSingleId === col.id
                        ? 'bg-twitch-surface border border-twitch-purple/50 text-twitch-text'
                        : 'text-twitch-muted hover:bg-twitch-surface/60 hover:text-twitch-text border border-transparent'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.color }} />
                    <span className="flex-1 truncate">{col.name}</span>
                    {activeSingleId === col.id && <Check size={12} className="text-twitch-purple shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Weighted mode */}
          {playMode === 'weighted' && (
            <div className="space-y-3">
              <p className="label">Collection weights</p>
              <p className="text-[11px] text-twitch-muted leading-relaxed">
                Toggle collections into the mix and set their relative weight. Higher weight = plays more often.
              </p>
              {allCollections.map(col => {
                const inSet = isInWeightedSet(col.id)
                const set = weightedSets.find(s => s.collectionId === col.id)
                const pct = totalWeight > 0 && inSet ? Math.round((set.weight / totalWeight) * 100) : 0
                return (
                  <div key={col.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleWeightedSet(col.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          inSet ? 'bg-twitch-purple border-twitch-purple' : 'border-twitch-border hover:border-twitch-purple/50'
                        }`}
                      >
                        {inSet && <Check size={10} className="text-white" />}
                      </button>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.color }} />
                      <span className="flex-1 text-xs text-twitch-text truncate">{col.name}</span>
                      {inSet && <span className="text-[10px] text-twitch-purple font-medium shrink-0">{pct}%</span>}
                    </div>
                    {inSet && (
                      <input
                        type="range" min="1" max="100"
                        value={set.weight}
                        onChange={e => setWeight(col.id, e.target.value)}
                        className="w-full accent-twitch-purple ml-6"
                      />
                    )}
                  </div>
                )
              })}
              {weightedSets.length === 0 && (
                <p className="text-[11px] text-twitch-border">Check at least one collection above.</p>
              )}
            </div>
          )}

          <button
            onClick={saveConfig}
            disabled={savingConfig || (playMode === 'weighted' && weightedSets.length === 0)}
            className="btn-purple w-full text-sm flex items-center justify-center gap-1.5"
          >
            {configSaved ? <><Check size={13} /> Saved</> : savingConfig ? 'Saving...' : 'Apply Playback Config'}
          </button>

          <p className="text-[11px] text-twitch-muted leading-relaxed">
            Changes take effect on the next clip in OBS.
          </p>
        </div>
      </aside>
    </div>
  )
}
