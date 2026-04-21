import React, { useEffect, useState, useMemo, useRef } from 'react'
import { Check, X, ChevronDown, Search, Volume2, Scissors, Activity, Tag } from 'lucide-react'
import { Link } from 'react-router-dom'
import WaveformEditor, { getEnvelopeVol } from '../components/WaveformEditor'
import TrimBar from '../components/TrimBar'
import { showUndo } from '../lib/undoToast'

function duration(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function ClipRow({ clip, onStatusChange, collections, onCollectionsChanged, selected, onToggleSelect, clipIndex, selectionActive }) {
  const [expanded, setExpanded] = useState(false)
  const [videoUrl, setVideoUrl] = useState(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [urlError, setUrlError] = useState(null)
  const [volume, setVolume] = useState(clip.volume ?? 1.0)
  const [showVolume, setShowVolume] = useState(false)
  const [showTrim, setShowTrim] = useState(false)
  const [showWaveform, setShowWaveform] = useState(false)
  const [clipEnvelope, setClipEnvelope] = useState(clip.envelope ?? [])
  const [trimStart, setTrimStart] = useState(clip.trim_start ?? 0)
  const [trimEnd, setTrimEnd] = useState(clip.trim_end ?? clip.duration ?? 0)
  const videoRef = useRef(null)

  // Collections dropdown — fixed position to escape overflow:hidden
  const [showColMenu, setShowColMenu] = useState(false)
  const [colMenuPos, setColMenuPos] = useState(null)
  const tagBtnRef = useRef(null)
  const colMenuRef = useRef(null)

  const memberOf = useMemo(
    () => new Set((collections || []).filter(c => c.clipIds?.includes(clip.id)).map(c => c.id)),
    [collections, clip.id]
  )

  useEffect(() => {
    if (!showColMenu) return
    function handleOutside(e) {
      const inMenu = colMenuRef.current?.contains(e.target)
      const inBtn  = tagBtnRef.current?.contains(e.target)
      if (!inMenu && !inBtn) setShowColMenu(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showColMenu])

  function openColMenu(e) {
    e.stopPropagation()
    if (!tagBtnRef.current) return
    const rect = tagBtnRef.current.getBoundingClientRect()
    const estimated = Math.min((collections?.length ?? 0) * 38 + 48, 280)
    const spaceBelow = window.innerHeight - rect.top
    setColMenuPos({
      right: window.innerWidth - rect.left + 4,
      top: spaceBelow < estimated + 20 ? Math.max(rect.bottom - estimated, 8) : rect.top
    })
    setShowColMenu(v => !v)
  }

  async function toggleCollection(colId) {
    if (memberOf.has(colId)) {
      await window.api.collections.removeClip(colId, clip.id)
    } else {
      await window.api.collections.addClip(colId, clip.id)
    }
    onCollectionsChanged?.()
  }

  async function saveVolume(val) { await window.api.clips.setVolume(clip.id, val) }

  async function saveTrim(start, end) {
    const dur = clip.duration ?? 0
    await window.api.clips.setTrim(clip.id, start > 0 ? start : null, end < dur ? end : null)
  }

  useEffect(() => {
    const vid = videoRef.current
    if (!vid || !videoUrl) return
    const onMeta = () => { vid.currentTime = trimStart }
    const onTick = () => {
      if (vid.currentTime >= trimEnd) { vid.pause(); return }
      if (clipEnvelope.length > 0) {
        const envVol = getEnvelopeVol(clipEnvelope, vid.currentTime)
        vid.volume = Math.min(1, Math.max(0, volume * envVol))
      }
    }
    vid.addEventListener('loadedmetadata', onMeta)
    vid.addEventListener('timeupdate', onTick)
    if (vid.readyState >= 1) vid.currentTime = trimStart
    return () => { vid.removeEventListener('loadedmetadata', onMeta); vid.removeEventListener('timeupdate', onTick) }
  }, [videoUrl, trimStart, trimEnd, clipEnvelope, volume])

  async function handleExpand() {
    const open = !expanded
    setExpanded(open)
    if (open && !videoUrl) {
      setLoadingUrl(true); setUrlError(null)
      const r = await window.api.clips.getVideoUrl(clip.id)
      if (r.ok) setVideoUrl(r.data); else setUrlError(r.error)
      setLoadingUrl(false)
    }
  }

  async function handleApprove() {
    const oldStatus = clip.status
    await window.api.clips.approve(clip.id)
    onStatusChange(clip.id, 'approved')
    showUndo('Clip approved', async () => {
      await window.api.clips.setStatus(clip.id, oldStatus)
      onStatusChange(clip.id, oldStatus)
    })
  }

  async function handleDeny() {
    const oldStatus = clip.status
    await window.api.clips.deny(clip.id)
    onStatusChange(clip.id, 'denied')
    showUndo('Clip denied', async () => {
      await window.api.clips.setStatus(clip.id, oldStatus)
      onStatusChange(clip.id, oldStatus)
    })
  }

  const showTagBtn = clip.status === 'approved' && collections?.length > 0

  return (
    <div className={`group rounded-lg border transition-colors overflow-hidden ${
      selected ? 'border-twitch-purple' : expanded ? 'border-twitch-purple' : 'border-twitch-border'
    } bg-twitch-surface`}>
      <div className="flex gap-3">
        {/* Checkbox */}
        <div
          className="flex items-center pl-3 shrink-0"
          onClick={e => { e.stopPropagation(); onToggleSelect?.(clip.id, e.shiftKey, clipIndex) }}
        >
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all cursor-pointer ${
            selected
              ? 'bg-twitch-purple border-twitch-purple'
              : 'border-twitch-border bg-transparent hover:border-twitch-purple'
          }`}>
            {selected && <Check size={10} className="text-white" />}
          </div>
        </div>

        {/* Expand area */}
        <button className="flex-1 min-w-0 text-left flex gap-3 p-3 hover:bg-white/5 transition-colors" onClick={handleExpand}>
          <div className="relative shrink-0 w-32 h-[72px] rounded overflow-hidden bg-black">
            {clip.thumbnail_url
              ? <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-twitch-mid" />}
            <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
              {duration(clip.duration)}
            </span>
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
            <p className="text-sm font-medium text-twitch-text leading-snug truncate">{clip.title}</p>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-twitch-muted truncate">{clip.game_name || clip.game_id || 'Unknown game'}</p>
              {memberOf.size > 0 && (
                <div className="flex gap-1 items-center shrink-0">
                  {(collections || []).filter(c => memberOf.has(c.id)).map(c => (
                    <span key={c.id} className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} title={c.name} />
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-twitch-muted">
              {clip.broadcaster_name} &middot; Clipped by <span className="text-twitch-purple">{clip.creator_name}</span>
            </p>
            <p className="text-[11px] text-twitch-muted">
              {clip.view_count?.toLocaleString()} views &middot; {new Date(clip.created_at).toLocaleDateString()}
            </p>
          </div>
          <ChevronDown size={16} className={`self-center shrink-0 mr-1 text-twitch-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {/* Action buttons — always 3 slots for consistent height */}
        <div className="flex flex-col gap-1 justify-center px-3 border-l border-twitch-border shrink-0">
          <button
            onClick={handleApprove}
            title="Approve"
            className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
              clip.status === 'approved' ? 'bg-green-600 text-white' : 'bg-green-600/15 text-green-400 hover:bg-green-600 hover:text-white'
            }`}
          >
            <Check size={14} />
          </button>
          <button
            onClick={handleDeny}
            title="Deny"
            className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
              clip.status === 'denied' ? 'bg-red-600 text-white' : 'bg-red-600/15 text-red-400 hover:bg-red-600 hover:text-white'
            }`}
          >
            <X size={14} />
          </button>

          {/* Tag button — always occupies the 3rd slot to keep heights consistent */}
          {showTagBtn ? (
            <button
              ref={tagBtnRef}
              onClick={openColMenu}
              title="Add to collection"
              className={`w-8 h-8 rounded flex items-center justify-center transition-colors relative ${
                memberOf.size > 0 ? 'bg-twitch-purple/20 text-twitch-purple' : 'text-twitch-muted hover:bg-twitch-surface hover:text-twitch-text'
              }`}
            >
              <Tag size={13} />
              {memberOf.size > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-twitch-purple text-white text-[8px] flex items-center justify-center font-bold">
                  {memberOf.size}
                </span>
              )}
            </button>
          ) : (
            <div className="w-8 h-8 invisible" aria-hidden />
          )}
        </div>
      </div>

      {/* Fixed-position collections dropdown */}
      {showColMenu && colMenuPos && (
        <div
          ref={colMenuRef}
          style={{ position: 'fixed', right: colMenuPos.right, top: colMenuPos.top, zIndex: 9999 }}
          className="w-48 bg-twitch-mid border border-twitch-border rounded-lg shadow-xl py-1"
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

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-twitch-border">
          <div className="bg-black" style={{ aspectRatio: '16/9' }}>
            {loadingUrl && <div className="w-full h-full flex items-center justify-center text-twitch-muted text-sm">Loading video...</div>}
            {urlError && <div className="w-full h-full flex items-center justify-center text-red-400 text-sm px-4 text-center">{urlError}</div>}
            {videoUrl && <video ref={videoRef} key={videoUrl} className="w-full h-full" controls autoPlay src={videoUrl} />}
          </div>
          <div className="px-4 py-3 border-t border-twitch-border space-y-2">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowVolume(v => !v)} className={`flex items-center gap-1 text-xs shrink-0 transition-colors ${showVolume ? 'text-twitch-purple' : 'text-twitch-muted hover:text-twitch-text'}`}>
                <Volume2 size={12} /> Volume
              </button>
              <button onClick={() => setShowTrim(v => !v)} className={`flex items-center gap-1 text-xs shrink-0 transition-colors ${showTrim ? 'text-twitch-purple' : 'text-twitch-muted hover:text-twitch-text'}`}>
                <Scissors size={12} /> Trim
              </button>
              <button onClick={() => setShowWaveform(v => !v)} className={`flex items-center gap-1 text-xs shrink-0 transition-colors ${showWaveform ? 'text-twitch-purple' : 'text-twitch-muted hover:text-twitch-text'}`}>
                <Activity size={12} /> Envelope
              </button>
            </div>
            {showVolume && (
              <div className="flex items-center gap-3">
                <input type="range" min="0" max="2" step="0.05" value={volume}
                  onChange={e => setVolume(Number(e.target.value))}
                  onMouseUp={e => saveVolume(Number(e.target.value))}
                  onTouchEnd={() => saveVolume(volume)}
                  className="flex-1 accent-twitch-purple"
                />
                <span className="text-xs text-twitch-text w-10 text-right shrink-0">{Math.round(volume * 100)}%</span>
              </div>
            )}
            {showTrim && (
              <TrimBar duration={clip.duration} trimStart={trimStart} trimEnd={trimEnd}
                onChange={(s, e) => { setTrimStart(s); setTrimEnd(e) }} onSave={saveTrim} videoRef={videoRef} />
            )}
            {showWaveform && (
              <WaveformEditor clip={clip} envelope={clipEnvelope}
                onChange={env => { setClipEnvelope(env); window.api.clips.setEnvelope(clip.id, env) }} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Review() {
  const [channels, setChannels] = useState([])
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [allClips, setAllClips] = useState([])
  const [loading, setLoading] = useState(false)
  const [sortBy, setSortBy] = useState('views')
  const [search, setSearch] = useState('')
  const [creatorFilter, setCreatorFilter] = useState('')
  const [gameFilter, setGameFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [collections, setCollections] = useState([])

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set())
  const lastSelIdxRef = useRef(null)
  const [showAddToCol, setShowAddToCol] = useState(false)
  const addToColRef = useRef(null)

  useEffect(() => {
    if (!showAddToCol) return
    function h(e) { if (!addToColRef.current?.contains(e.target)) setShowAddToCol(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showAddToCol])

  async function loadCollections() {
    const r = await window.api.collections.list()
    if (r.ok) setCollections(r.data)
  }

  useEffect(() => {
    loadCollections()
    window.api.channels.list().then(r => {
      if (r.ok) { 
        const allChannels = [{ name: 'all', display_name: 'All Channels' }, ...r.data]
        setChannels(allChannels); 
        if (r.data.length > 0) setSelectedChannel(r.data[0].name) 
        }
    })
  }, [])

  useEffect(() => { if (selectedChannel) loadClips() }, [selectedChannel])

  async function loadClips() {
    setLoading(true)
    let r 
    if(selectedChannel==='all'){
      r = await window.api.clips.getAll()
    }else{
      r = await window.api.clips.getAll(selectedChannel)
    }
    if (r.ok) setAllClips(r.data)
    setLoading(false)
  }

  function handleStatusChange(id, newStatus) {
    setAllClips(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c))
  }

  function switchChannel(name) {
    setSelectedChannel(name); setSearch(''); setCreatorFilter(''); setGameFilter('')
    setSelectedIds(new Set()); lastSelIdxRef.current = null
  }

  function handleToggleSelect(clipId, isShift, clipIdx) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (isShift && lastSelIdxRef.current !== null) {
        const lo = Math.min(lastSelIdxRef.current, clipIdx)
        const hi = Math.max(lastSelIdxRef.current, clipIdx)
        const selecting = !prev.has(clipId)
        filteredClips.slice(lo, hi + 1).forEach(c => selecting ? next.add(c.id) : next.delete(c.id))
      } else {
        next.has(clipId) ? next.delete(clipId) : next.add(clipId)
      }
      lastSelIdxRef.current = clipIdx
      return next
    })
  }

  async function approveSelected() {
    const ids = [...selectedIds]
    const oldStatuses = Object.fromEntries(ids.map(id => [id, allClips.find(c => c.id === id)?.status ?? 'pending']))
    await window.api.clips.bulkApprove(ids)
    setAllClips(prev => prev.map(c => ids.includes(c.id) ? { ...c, status: 'approved' } : c))
    setSelectedIds(new Set())
    showUndo(`${ids.length} clip${ids.length !== 1 ? 's' : ''} approved`, async () => {
      for (const id of ids) await window.api.clips.setStatus(id, oldStatuses[id])
      setAllClips(prev => prev.map(c => ids.includes(c.id) ? { ...c, status: oldStatuses[c.id] } : c))
    })
  }

  async function denySelected() {
    const ids = [...selectedIds]
    const oldStatuses = Object.fromEntries(ids.map(id => [id, allClips.find(c => c.id === id)?.status ?? 'pending']))
    await window.api.clips.bulkDeny(ids)
    setAllClips(prev => prev.map(c => ids.includes(c.id) ? { ...c, status: 'denied' } : c))
    setSelectedIds(new Set())
    showUndo(`${ids.length} clip${ids.length !== 1 ? 's' : ''} denied`, async () => {
      for (const id of ids) await window.api.clips.setStatus(id, oldStatuses[id])
      setAllClips(prev => prev.map(c => ids.includes(c.id) ? { ...c, status: oldStatuses[c.id] } : c))
    })
  }

  async function addSelectedToCollection(colId) {
    const ids = [...selectedIds]
    const colName = collections.find(c => c.id === colId)?.name ?? 'collection'
    const unapproved = ids.filter(id => allClips.find(c => c.id === id)?.status !== 'approved')
    if (unapproved.length) {
      await window.api.clips.bulkApprove(unapproved)
      setAllClips(prev => prev.map(c => unapproved.includes(c.id) ? { ...c, status: 'approved' } : c))
    }
    for (const id of ids) await window.api.collections.addClip(colId, id)
    loadCollections()
    setShowAddToCol(false)
    setSelectedIds(new Set())
    showUndo(`Added ${ids.length} to ${colName}`, async () => {
      for (const id of ids) await window.api.collections.removeClip(colId, id)
      loadCollections()
    })
  }

  const creators = useMemo(() => {
    const set = new Set(allClips.map(c => c.creator_name).filter(Boolean))
    return [...set].sort()
  }, [allClips])

  const games = useMemo(() => {
    const set = new Set(allClips.map(c => c.game_name).filter(Boolean))
    return [...set].sort()
  }, [allClips])

  const filteredClips = useMemo(() => {
    let clips = [...allClips]
    if (statusFilter === 'pending')  clips = clips.filter(c => c.status === 'pending')
    if (statusFilter === 'approved') clips = clips.filter(c => c.status === 'approved')
    if (statusFilter === 'denied')   clips = clips.filter(c => c.status === 'denied')
    if (search) clips = clips.filter(c => c.title?.toLowerCase().includes(search.toLowerCase()))
    if (creatorFilter) clips = clips.filter(c => c.creator_name === creatorFilter)
    if (gameFilter) clips = clips.filter(c => c.game_name === gameFilter)
    switch (sortBy) {
      case 'views':  clips.sort((a, b) => (b.view_count || 0) - (a.view_count || 0)); break
      case 'newest': clips.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break
      case 'oldest': clips.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break
      case 'az':     clips.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')); break
    }
    return clips
  }, [allClips, search, creatorFilter, gameFilter, sortBy, statusFilter])

  const selectionActive = selectedIds.size > 0

  return (
    <div className="flex h-full">
      {/* Channel sidebar */}
      <aside className="w-52 border-r border-twitch-border bg-twitch-mid flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-twitch-border">
          <h2 className="font-semibold text-sm text-twitch-text">Channels</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {channels.map(ch => (
            <button key={ch.name} onClick={() => switchChannel(ch.name)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selectedChannel === ch.name ? 'bg-twitch-purple text-white' : 'text-twitch-muted hover:bg-twitch-surface hover:text-twitch-text'
              }`}
            >
              <span className="font-medium">{ch.display_name || ch.name}</span>
              {ch.is_own ? <span className="ml-1 text-[10px] opacity-70">you</span> : null}
            </button>
          ))}
          {channels.length === 0 && (
            <div className="px-3 py-2 space-y-2">
              <p className="text-xs text-twitch-muted">No channels yet.</p>
              <Link to="/settings" className="text-xs text-twitch-purple hover:underline block">Add channels in Settings →</Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="border-b border-twitch-border shrink-0 px-5 py-3 flex items-center gap-3 flex-wrap">
          <h1 className="font-bold text-lg text-twitch-text shrink-0">Review</h1>
          <div className="flex rounded-md overflow-hidden border border-twitch-border shrink-0">
            {[
              { value: 'all',      label: 'All' },
              { value: 'pending',  label: 'Unreviewed' },
              { value: 'approved', label: 'Accepted' },
              { value: 'denied',   label: 'Denied' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`text-xs px-2.5 py-1 transition-colors border-r last:border-r-0 border-twitch-border ${
                  statusFilter === opt.value ? 'bg-twitch-purple text-white' : 'text-twitch-muted hover:text-twitch-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-32">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-twitch-muted pointer-events-none" />
            <input className="input pl-7 text-sm" placeholder="Search clips..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input text-sm w-40" value={creatorFilter} onChange={e => setCreatorFilter(e.target.value)}>
            <option value="">All creators</option>
            {creators.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {games.length > 0 && (
            <select className="input text-sm w-40" value={gameFilter} onChange={e => setGameFilter(e.target.value)}>
              <option value="">All games</option>
              {games.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          <select className="input text-sm w-36" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="views">Most Popular</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="az">A–Z</option>
          </select>
        </div>

        {/* Selection action bar */}
        {selectionActive && (
          <div className="px-5 py-2 border-b border-twitch-border bg-twitch-surface/40 flex items-center gap-2 shrink-0 flex-wrap">
            <span className="text-xs font-medium text-twitch-text">{selectedIds.size} selected</span>
            <button onClick={approveSelected} className="btn-success text-xs py-1 px-2.5 flex items-center gap-1">
              <Check size={11} /> Approve
            </button>
            <button onClick={denySelected} className="btn-danger text-xs py-1 px-2.5 flex items-center gap-1">
              <X size={11} /> Deny
            </button>
            {collections.length > 0 && (
              <div className="relative" ref={addToColRef}>
                <button
                  onClick={() => setShowAddToCol(v => !v)}
                  className="btn-ghost text-xs py-1 px-2.5 flex items-center gap-1"
                >
                  <Tag size={11} /> Add to Collection <ChevronDown size={10} />
                </button>
                {showAddToCol && (
                  <div className="absolute left-0 top-full mt-1 w-48 bg-twitch-mid border border-twitch-border rounded-lg shadow-xl z-50 py-1">
                    {collections.map(col => (
                      <button key={col.id} onClick={() => addSelectedToCollection(col.id)}
                        className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-twitch-surface transition-colors">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.color }} />
                        <span className="flex-1 truncate text-twitch-text">{col.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={() => { setSelectedIds(new Set()); lastSelIdxRef.current = null }}
              className="ml-auto text-xs text-twitch-muted hover:text-twitch-text transition-colors">
              Clear
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && <p className="text-twitch-muted text-sm text-center mt-8">Loading...</p>}
          {!loading && filteredClips.length === 0 && (
            <div className="text-center mt-16 space-y-2">
              <p className="text-twitch-muted text-sm">No clips found.</p>
              <p className="text-twitch-border text-xs">
                {allClips.length === 0 ? 'Check Updates to fetch new clips.' : 'Try adjusting your search or filters.'}
              </p>
            </div>
          )}
          {!loading && filteredClips.length > 0 && (
            <p className="text-[11px] text-twitch-border mb-1">
              {filteredClips.length} clip{filteredClips.length !== 1 ? 's' : ''}{(search || creatorFilter) ? ' (filtered)' : ''}
            </p>
          )}
          {filteredClips.map((clip, idx) => (
            <ClipRow
              key={`${clip.id}-${sortBy}-${search}-${creatorFilter}-${gameFilter}-${statusFilter}-${selectedChannel}`}
              clip={clip}
              onStatusChange={handleStatusChange}
              collections={collections}
              onCollectionsChanged={loadCollections}
              selected={selectedIds.has(clip.id)}
              onToggleSelect={handleToggleSelect}
              clipIndex={idx}
              selectionActive={selectionActive}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
