import React, { useEffect, useState, useMemo, useRef } from 'react'
import { Check, X, ChevronDown, Search, Tag, Trash2, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import WaveformEditor, { getEnvelopeVol } from '../components/WaveformEditor'
import TrimBar from '../components/TrimBar'
import CollectionPicker from '../components/CollectionPicker'
import ControlToggleButtons from '../components/ControlToggleButtons'
import VolumeSlider from '../components/VolumeSlider'
import { showUndo } from '../lib/undoToast'

function duration(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const ClipRow = React.memo(function ClipRow({ clip, onStatusChange, onRemove, onScheduled, collections, onCollectionsChanged, selected, onToggleSelect, clipIndex, selectionActive, isOwnChannel }) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showScheduleUI, setShowScheduleUI] = useState(false)
  const [customDate, setCustomDate] = useState('')
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

  const memberOf = useMemo(
    () => new Set((collections || []).filter(c => c.clipIds?.includes(clip.id)).map(c => c.id)),
    [collections, clip.id]
  )

  async function toggleCollection(colId) {
    if (memberOf.has(colId)) {
      await window.api.collections.removeClip(colId, clip.id)
    } else {
      await window.api.collections.addClip(colId, clip.id)
    }
    onCollectionsChanged?.()
  }

  async function handleCollectionCreated(newCol) {
    await window.api.collections.addClip(newCol.id, clip.id)
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
    return () => {
      vid.removeEventListener('loadedmetadata', onMeta)
      vid.removeEventListener('timeupdate', onTick)
      vid.pause()
      vid.currentTime = 0
    }
  }, [videoUrl, trimStart, trimEnd, clipEnvelope, volume, expanded])

  useEffect(() => {
    if (!expanded) {
      const vid = videoRef.current
      if (vid) {
        vid.pause()
        vid.currentTime = 0
      }
    }
  }, [expanded])

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
    setExpanded(false)
    window.dispatchEvent(new CustomEvent('clips-status-changed', { detail: { clipId: clip.id, status: 'approved' } }))
    showUndo('Clip approved', async () => {
      await window.api.clips.setStatus(clip.id, oldStatus)
      onStatusChange(clip.id, oldStatus)
      window.dispatchEvent(new CustomEvent('clips-status-changed', { detail: { clipId: clip.id, status: oldStatus } }))
    }, [clip.id])
  }

  async function handleDeny() {
    const oldStatus = clip.status
    await window.api.clips.deny(clip.id)
    onStatusChange(clip.id, 'denied')
    setExpanded(false)
    window.dispatchEvent(new CustomEvent('clips-status-changed', { detail: { clipId: clip.id, status: 'denied' } }))
    showUndo('Clip denied', async () => {
      await window.api.clips.setStatus(clip.id, oldStatus)
      onStatusChange(clip.id, oldStatus)
      window.dispatchEvent(new CustomEvent('clips-status-changed', { detail: { clipId: clip.id, status: oldStatus } }))
    })
  }

  async function handleDeleteFromTwitch() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    const r = await window.api.twitch.deleteClips([clip.id])
    if (r.ok && r.data.deleted.includes(clip.id)) {
      onRemove?.(clip.id)
    } else {
      setConfirmDelete(false)
    }
    setDeleting(false)
  }

  async function scheduleDelete(deleteAfter) {
    await window.api.clips.scheduleDelete(clip.id, deleteAfter)
    setShowScheduleUI(false)
    onScheduled?.(clip.id)
  }

  function presetDate(days) {
    const d = new Date(); d.setDate(d.getDate() + days)
    return d.toISOString()
  }

  const showTagBtn = clip.status === 'approved'

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
          <div className="relative shrink-0 w-32 h-[72px] rounded overflow-hidden bg-twitch-mid">
            {clip.thumbnail_url && (
              <img src={clip.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover"
                onError={e => e.currentTarget.remove()} />
            )}
            <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
              {duration(clip.duration)}
            </span>
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
            <p className="text-sm font-medium text-twitch-text leading-snug truncate">{clip.title}</p>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-twitch-muted truncate">{clip.game_name || clip.game_id || 'Unknown game'}</p>
            </div>
            <p className="text-xs text-twitch-muted">
              {clip.broadcaster_name} &middot; Clipped by <span className="text-twitch-purple">{clip.creator_name}</span>
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-[11px] text-twitch-muted shrink-0">
                {clip.view_count?.toLocaleString()} views &middot; {new Date(clip.created_at).toLocaleDateString()}
              </p>
              {(collections || []).filter(c => memberOf.has(c.id)).map(c => (
                <span key={c.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0" style={{ background: c.color + '33', color: c.color }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.color }} />
                  {c.name}
                </span>
              ))}
            </div>

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
            <CollectionPicker
              mode="single"
              memberOf={memberOf}
              onToggle={toggleCollection}
              onCreate={handleCollectionCreated}
              onCollectionsChanged={onCollectionsChanged}
              renderTrigger={(ref, onClick) => (
                <button
                  ref={ref}
                  onClick={onClick}
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
              )}
            />
          ) : (
            <div className="w-8 h-8 invisible" aria-hidden />
          )}
        </div>
      </div>



      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-twitch-border">
          <div className="bg-black" style={{ aspectRatio: '16/9' }}>
            {loadingUrl && (
              <div className="w-full h-full flex items-center justify-center text-twitch-muted text-sm">Loading video...</div>
            )}
            {urlError && (
              <div className="w-full h-full flex items-center justify-center text-red-400 text-sm px-4 text-center">{urlError}</div>
            )}
            {videoUrl && <video ref={videoRef} key={videoUrl} className="w-full h-full" controls autoPlay src={videoUrl} />}
          </div>
          <div className="px-4 py-3 border-t border-twitch-border space-y-2">
            <ControlToggleButtons
              showVolume={showVolume}
              showTrim={showTrim}
              showWaveform={showWaveform}
              onVolumeToggle={() => setShowVolume(v => !v)}
              onTrimToggle={() => setShowTrim(v => !v)}
              onWaveformToggle={() => setShowWaveform(v => !v)}
            />
            {showVolume && (
              <VolumeSlider
                volume={volume}
                onChange={setVolume}
                onSave={saveVolume}
              />
            )}
            {showTrim && (
              <TrimBar duration={clip.duration} trimStart={trimStart} trimEnd={trimEnd}
                onChange={(s, e) => { setTrimStart(s); setTrimEnd(e) }} onSave={saveTrim} videoRef={videoRef} />
            )}
            {showWaveform && (
              <WaveformEditor clip={clip} envelope={clipEnvelope}
                onChange={env => { setClipEnvelope(env); window.api.clips.setEnvelope(clip.id, env) }} />
            )}
            {isOwnChannel && (
              <div className="pt-1 border-t border-twitch-border space-y-1.5">
                <div>
                  {showScheduleUI ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-twitch-muted">Delete after:</span>
                      {[{ label: '1 week', days: 7 }, { label: '1 month', days: 30 }, { label: '3 months', days: 90 }].map(p => (
                        <button key={p.days} onClick={() => scheduleDelete(presetDate(p.days))}
                          className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 hover:bg-orange-500/40 transition-colors">
                          {p.label}
                        </button>
                      ))}
                      <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
                        min={new Date().toISOString().slice(0, 10)}
                        className="text-xs px-2 py-0.5 rounded bg-twitch-mid border border-twitch-border text-twitch-text" />
                      {customDate && (
                        <button onClick={() => scheduleDelete(new Date(customDate).toISOString())}
                          className="text-xs px-2 py-0.5 rounded bg-orange-600 text-white hover:bg-orange-700 transition-colors">
                          Set
                        </button>
                      )}
                      <button onClick={() => setShowScheduleUI(false)} className="text-xs text-twitch-muted hover:text-twitch-text ml-auto">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowScheduleUI(true)}
                      className="text-xs px-2.5 py-1 rounded flex items-center gap-1.5 text-twitch-muted hover:bg-twitch-surface hover:text-twitch-text transition-colors">
                      <Clock size={12} /> Schedule deletion
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {confirmDelete ? (
                    <>
                      <span className="text-xs text-red-400">Delete this clip from Twitch permanently?</span>
                      <button
                        onClick={handleDeleteFromTwitch}
                        disabled={deleting}
                        className="text-xs px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                      >
                        {deleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="text-xs px-2.5 py-1 rounded text-twitch-muted hover:text-twitch-text transition-colors">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleDeleteFromTwitch}
                      className="text-xs px-2.5 py-1 rounded flex items-center gap-1.5 text-red-400 hover:bg-red-600/15 transition-colors"
                    >
                      <Trash2 size={12} /> Delete from Twitch
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

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
  const [displayCount, setDisplayCount] = useState(100)
  const sentinelRef = useRef(null)

  const [scheduledClips, setScheduledClips] = useState([])
  const [scheduledExpanded, setScheduledExpanded] = useState(false)
  const [executingScheduled, setExecutingScheduled] = useState(false)

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set())
  const lastSelIdxRef = useRef(null)

  async function loadCollections() {
    const r = await window.api.collections.list()
    if (r.ok) setCollections(r.data)
  }

  async function loadScheduledClips() {
    const r = await window.api.clips.getScheduledForDeletion()
    if (r.ok) setScheduledClips(r.data)
  }

  useEffect(() => { loadScheduledClips() }, [])

  async function executeOverdueDeletions() {
    setExecutingScheduled(true)
    const r = await window.api.clips.executeScheduledDeletions(true)
    if (r.ok) await loadScheduledClips()
    setExecutingScheduled(false)
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

  useEffect(() => {
    function onCollectionsChanged() { loadCollections() }
    window.addEventListener('collections-changed', onCollectionsChanged)
    return () => window.removeEventListener('collections-changed', onCollectionsChanged)
  }, [])

  useEffect(() => {
    if (displayCount >= allClips.length) return
    const timer = setInterval(() => {
      setDisplayCount(prev => Math.min(prev + 20, allClips.length))
    }, 1200)
    return () => clearInterval(timer)
  }, [displayCount, allClips.length])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && displayCount < allClips.length) {
        setDisplayCount(prev => Math.min(prev + 20, allClips.length))
      }
    }, { rootMargin: '100px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [displayCount, allClips.length])

  async function loadClips() {
    setLoading(true)
    let r
    if(selectedChannel==='all'){
      r = await window.api.clips.getAll()
    }else{
      r = await window.api.clips.getAll(selectedChannel)
    }
    if (r.ok) {
      setAllClips(r.data)
      const missingThumbnails = r.data.filter(c => !c.thumbnail_url).map(c => c.id)
      if (missingThumbnails.length > 0) {
        await window.api.clips.fetchMissingThumbnails({ clipIds: missingThumbnails })
        r = await window.api.clips.getAll(selectedChannel === 'all' ? undefined : selectedChannel)
        if (r.ok) setAllClips(r.data)
      }
    }
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
    ids.forEach(id => window.dispatchEvent(new CustomEvent('clips-status-changed', { detail: { clipId: id, status: 'approved' } })))
    showUndo(`${ids.length} clip${ids.length !== 1 ? 's' : ''} approved`, async () => {
      for (const id of ids) await window.api.clips.setStatus(id, oldStatuses[id])
      setAllClips(prev => prev.map(c => ids.includes(c.id) ? { ...c, status: oldStatuses[c.id] } : c))
      ids.forEach(id => window.dispatchEvent(new CustomEvent('clips-status-changed', { detail: { clipId: id, status: oldStatuses[id] } })))
    }, ids)
  }

  async function denySelected() {
    const ids = [...selectedIds]
    const oldStatuses = Object.fromEntries(ids.map(id => [id, allClips.find(c => c.id === id)?.status ?? 'pending']))
    await window.api.clips.bulkDeny(ids)
    setAllClips(prev => prev.map(c => ids.includes(c.id) ? { ...c, status: 'denied' } : c))
    setSelectedIds(new Set())
    ids.forEach(id => window.dispatchEvent(new CustomEvent('clips-status-changed', { detail: { clipId: id, status: 'denied' } })))
    showUndo(`${ids.length} clip${ids.length !== 1 ? 's' : ''} denied`, async () => {
      for (const id of ids) await window.api.clips.setStatus(id, oldStatuses[id])
      setAllClips(prev => prev.map(c => ids.includes(c.id) ? { ...c, status: oldStatuses[c.id] } : c))
      ids.forEach(id => window.dispatchEvent(new CustomEvent('clips-status-changed', { detail: { clipId: id, status: oldStatuses[id] } })))
    })
  }

  async function toggleSelectedInCollection(colId, shouldAdd) {
    const ids = [...selectedIds]
    if (shouldAdd) {
      const unapproved = ids.filter(id => allClips.find(c => c.id === id)?.status !== 'approved')
      if (unapproved.length) {
        await window.api.clips.bulkApprove(unapproved)
        setAllClips(prev => prev.map(c => unapproved.includes(c.id) ? { ...c, status: 'approved' } : c))
      }
      for (const id of ids) await window.api.collections.addClip(colId, id)
      loadCollections()
    } else {
      for (const id of ids) await window.api.collections.removeClip(colId, id)
      loadCollections()
    }
  }

  async function handleBulkCollectionCreated(newCol) {
    const ids = [...selectedIds]
    const unapproved = ids.filter(id => allClips.find(c => c.id === id)?.status !== 'approved')
    if (unapproved.length) {
      await window.api.clips.bulkApprove(unapproved)
      setAllClips(prev => prev.map(c => unapproved.includes(c.id) ? { ...c, status: 'approved' } : c))
    }
    for (const id of ids) await window.api.collections.addClip(newCol.id, id)
    loadCollections()
    setSelectedIds(new Set())
  }

  const ownBroadcasterIds = useMemo(() =>
    new Set(channels.filter(c => c.is_own).map(c => c.broadcaster_id))
  , [channels])

  async function deleteSelected() {
    const ids = [...selectedIds].filter(id => {
      const clip = allClips.find(c => c.id === id)
      return clip && ownBroadcasterIds.has(clip.broadcaster_id)
    })
    if (!ids.length) return
    const r = await window.api.twitch.deleteClips(ids)
    if (r.ok && r.data.deleted.length > 0) {
      setAllClips(prev => prev.filter(c => !r.data.deleted.includes(c.id)))
      setSelectedIds(prev => { const next = new Set(prev); r.data.deleted.forEach(id => next.delete(id)); return next })
    }
  }

  const [bulkScheduleOpen, setBulkScheduleOpen] = useState(false)
  const [bulkCustomDate, setBulkCustomDate] = useState('')

  async function bulkScheduleDelete(deleteAfter) {
    const ids = [...selectedIds].filter(id => {
      const c = allClips.find(x => x.id === id)
      return c && ownBroadcasterIds.has(c.broadcaster_id)
    })
    await window.api.clips.bulkScheduleDelete(ids, deleteAfter)
    setAllClips(prev => prev.filter(c => !ids.includes(c.id)))
    setSelectedIds(new Set())
    setBulkScheduleOpen(false)
    await loadScheduledClips()
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
            <option value="">All clip creators</option>
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
            {[...selectedIds].some(id => { const c = allClips.find(x => x.id === id); return c && ownBroadcasterIds.has(c.broadcaster_id) }) && (
              <button onClick={deleteSelected} className="text-xs py-1 px-2.5 flex items-center gap-1 rounded border border-red-600/40 text-red-400 hover:bg-red-600 hover:text-white transition-colors">
                <Trash2 size={11} /> Delete from Twitch
              </button>
            )}
            <CollectionPicker
              mode="batch"
              selectedIds={selectedIds}
              onSelect={toggleSelectedInCollection}
              onCreate={handleBulkCollectionCreated}
              onCollectionsChanged={loadCollections}
              renderTrigger={(ref, onClick) => (
                <button
                  ref={ref}
                  onClick={onClick}
                  className="btn-ghost text-xs py-1 px-2.5 flex items-center gap-1"
                >
                  <Tag size={11} /> Add to Collection <ChevronDown size={10} />
                </button>
              )}
            />
            {[...selectedIds].some(id => { const c = allClips.find(x => x.id === id); return c && ownBroadcasterIds.has(c.broadcaster_id) }) && (bulkScheduleOpen ? (
              <div className="flex items-center gap-2 flex-wrap">
                {[{ label: '1 wk', days: 7 }, { label: '1 mo', days: 30 }, { label: '3 mo', days: 90 }].map(p => (
                  <button key={p.days} onClick={() => { const d = new Date(); d.setDate(d.getDate() + p.days); bulkScheduleDelete(d.toISOString()) }}
                    className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 hover:bg-orange-500/40 transition-colors">
                    {p.label}
                  </button>
                ))}
                <input type="date" value={bulkCustomDate} onChange={e => setBulkCustomDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="text-xs px-2 py-0.5 rounded bg-twitch-mid border border-twitch-border text-twitch-text" />
                {bulkCustomDate && (
                  <button onClick={() => bulkScheduleDelete(new Date(bulkCustomDate).toISOString())}
                    className="text-xs px-2 py-0.5 rounded bg-orange-600 text-white hover:bg-orange-700 transition-colors">Set</button>
                )}
                <button onClick={() => setBulkScheduleOpen(false)} className="text-xs text-twitch-muted hover:text-twitch-text">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setBulkScheduleOpen(true)} className="text-xs py-1 px-2.5 flex items-center gap-1 rounded text-orange-400 border border-orange-500/40 hover:bg-orange-500/15 transition-colors">
                <Clock size={11} /> Schedule deletion
              </button>
            ) )}
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
          {filteredClips.slice(0, displayCount).map((clip, idx) => (
            <ClipRow
              key={`${clip.id}-${sortBy}-${search}-${creatorFilter}-${gameFilter}-${statusFilter}-${selectedChannel}`}
              clip={clip}
              onStatusChange={handleStatusChange}
              onRemove={id => setAllClips(prev => prev.filter(c => c.id !== id))}
              onScheduled={id => { setAllClips(prev => prev.filter(c => c.id !== id)); loadScheduledClips() }}
              collections={collections}
              onCollectionsChanged={loadCollections}
              selected={selectedIds.has(clip.id)}
              onToggleSelect={handleToggleSelect}
              clipIndex={idx}
              selectionActive={selectionActive}
              isOwnChannel={ownBroadcasterIds.has(clip.broadcaster_id)}
            />
          ))}
          <div ref={sentinelRef} className="h-2" />

          {/* Scheduled for deletion section */}
          {scheduledClips.length > 0 && (
            <div className="mt-4 rounded-lg border border-orange-500/30 overflow-hidden">
              <button
                onClick={() => setScheduledExpanded(v => !v)}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-orange-500/10 hover:bg-orange-500/15 transition-colors text-left"
              >
                <Clock size={13} className="text-orange-400 shrink-0" />
                <span className="text-xs font-medium text-orange-300 flex-1">
                  Scheduled for deletion ({scheduledClips.length})
                </span>
                {(() => {
                  const overdue = scheduledClips.filter(c => c.delete_after <= new Date().toISOString())
                  return overdue.length > 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-600/30 text-red-400 mr-2">
                      {overdue.length} overdue
                    </span>
                  ) : null
                })()}
                <ChevronDown size={14} className={`text-orange-400 transition-transform ${scheduledExpanded ? 'rotate-180' : ''}`} />
              </button>
              {scheduledExpanded && (
                <div className="divide-y divide-twitch-border/50">
                  {scheduledClips.filter(c => c.delete_after <= new Date().toISOString()).length > 0 && (
                    <div className="px-4 py-2 flex items-center gap-3">
                      <span className="text-xs text-red-400 flex-1">Some clips are past their scheduled date.</span>
                      <button onClick={executeOverdueDeletions} disabled={executingScheduled}
                        className="text-xs px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors">
                        {executingScheduled ? 'Deleting…' : 'Delete overdue now'}
                      </button>
                    </div>
                  )}
                  {scheduledClips.map(c => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="relative shrink-0 w-16 h-9 rounded overflow-hidden bg-twitch-mid">
                        {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" onError={e => e.currentTarget.remove()} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-twitch-text truncate">{c.title}</p>
                        <p className="text-[11px] text-twitch-muted">
                          {c.broadcaster_name} &middot;{' '}
                          <span className={c.delete_after <= new Date().toISOString() ? 'text-red-400' : 'text-orange-400'}>
                            {c.delete_after <= new Date().toISOString() ? 'Overdue — ' : 'Delete after '}
                            {new Date(c.delete_after).toLocaleDateString()}
                          </span>
                        </p>
                      </div>
                      <button
                        onClick={async () => { await window.api.clips.scheduleDelete(c.id, null); loadScheduledClips(); loadClips() }}
                        className="text-[11px] px-2 py-0.5 rounded text-twitch-muted border border-twitch-border hover:text-twitch-text transition-colors shrink-0"
                      >
                        Unschedule
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>


    </div>
  )
}
