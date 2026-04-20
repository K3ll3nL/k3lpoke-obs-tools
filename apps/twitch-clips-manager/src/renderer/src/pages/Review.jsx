import React, { useEffect, useState, useMemo, useRef } from 'react'
import { Check, X, ChevronDown, Search, Volume2, Scissors, Activity } from 'lucide-react'
import { Link } from 'react-router-dom'
import WaveformEditor, { getEnvelopeVol } from '../components/WaveformEditor'
import TrimBar from '../components/TrimBar'
import RightPanel from '../components/RightPanel'

function duration(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}


function ClipRow({ clip, onStatusChange }) {
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

  async function saveVolume(val) {
    await window.api.clips.setVolume(clip.id, val)
  }

  async function saveTrim(start, end) {
    const clipDur = clip.duration ?? 0
    await window.api.clips.setTrim(
      clip.id,
      start > 0 ? start : null,
      end < clipDur ? end : null
    )
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
    // If already loaded, seek immediately when trimStart changes
    if (vid.readyState >= 1) vid.currentTime = trimStart
    return () => {
      vid.removeEventListener('loadedmetadata', onMeta)
      vid.removeEventListener('timeupdate', onTick)
    }
  }, [videoUrl, trimStart, trimEnd, clipEnvelope, volume])

  async function handleExpand() {
    const open = !expanded
    setExpanded(open)
    if (open && !videoUrl) {
      setLoadingUrl(true)
      setUrlError(null)
      const r = await window.api.clips.getVideoUrl(clip.id)
      if (r.ok) setVideoUrl(r.data)
      else setUrlError(r.error)
      setLoadingUrl(false)
    }
  }

  async function handleApprove() {
    await window.api.clips.approve(clip.id)
    onStatusChange(clip.id, 'approved')
  }

  async function handleDeny() {
    await window.api.clips.deny(clip.id)
    onStatusChange(clip.id, 'denied')
  }

  return (
    <div className={`rounded-lg border transition-colors overflow-hidden ${expanded ? 'border-twitch-purple' : 'border-twitch-border'} bg-twitch-surface`}>
      {/* Card row */}
      <div className="flex">
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
            <p className="text-xs text-twitch-muted">
              {clip.broadcaster_name} &middot; Clipped by <span className="text-twitch-purple">{clip.creator_name}</span>
            </p>
            <p className="text-[11px] text-twitch-muted">
              {clip.view_count?.toLocaleString()} views &middot; {new Date(clip.created_at).toLocaleDateString()}
            </p>
          </div>

          <ChevronDown size={16} className={`self-center shrink-0 mr-1 text-twitch-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {/* Approve / Deny buttons */}
        <div className="flex flex-col gap-1 justify-center px-3 border-l border-twitch-border shrink-0">
          <button
            onClick={handleApprove}
            title="Approve"
            className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
              clip.status === 'approved'
                ? 'bg-green-600 text-white'
                : 'bg-green-600/15 text-green-400 hover:bg-green-600 hover:text-white'
            }`}
          >
            <Check size={14} />
          </button>
          <button
            onClick={handleDeny}
            title="Deny"
            className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
              clip.status === 'denied'
                ? 'bg-red-600 text-white'
                : 'bg-red-600/15 text-red-400 hover:bg-red-600 hover:text-white'
            }`}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Expanded video + config */}
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
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowVolume(v => !v)}
                className={`flex items-center gap-1 text-xs shrink-0 transition-colors ${showVolume ? 'text-twitch-purple' : 'text-twitch-muted hover:text-twitch-text'}`}
              >
                <Volume2 size={12} /> Volume
              </button>
              <button
                onClick={() => setShowTrim(v => !v)}
                className={`flex items-center gap-1 text-xs shrink-0 transition-colors ${showTrim ? 'text-twitch-purple' : 'text-twitch-muted hover:text-twitch-text'}`}
              >
                <Scissors size={12} /> Trim
              </button>
              <button
                onClick={() => setShowWaveform(v => !v)}
                className={`flex items-center gap-1 text-xs shrink-0 transition-colors ${showWaveform ? 'text-twitch-purple' : 'text-twitch-muted hover:text-twitch-text'}`}
              >
                <Activity size={12} /> Envelope
              </button>
            </div>
            {showVolume && (
              <div className="flex items-center gap-3">
                <input
                  type="range" min="0" max="2" step="0.05"
                  value={volume}
                  onChange={e => setVolume(Number(e.target.value))}
                  onMouseUp={e => saveVolume(Number(e.target.value))}
                  onTouchEnd={() => saveVolume(volume)}
                  className="flex-1 accent-twitch-purple"
                />
                <span className="text-xs text-twitch-text w-10 text-right shrink-0">{Math.round(volume * 100)}%</span>
              </div>
            )}
            {showTrim && (
              <TrimBar
                duration={clip.duration}
                trimStart={trimStart}
                trimEnd={trimEnd}
                onChange={(s, e) => { setTrimStart(s); setTrimEnd(e) }}
                onSave={saveTrim}
                videoRef={videoRef}
              />
            )}
            {showWaveform && (
              <WaveformEditor
                clip={clip}
                envelope={clipEnvelope}
                onChange={env => {
                  setClipEnvelope(env)
                  window.api.clips.setEnvelope(clip.id, env)
                }}
              />
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
  const [hideReviewed, setHideReviewed] = useState(false)

  useEffect(() => {
    window.api.channels.list().then(r => {
      if (r.ok) {
        setChannels(r.data)
        if (r.data.length > 0) setSelectedChannel(r.data[0].name)
      }
    })
  }, [])

  useEffect(() => {
    if (!selectedChannel) return
    loadClips()
  }, [selectedChannel])

  async function loadClips() {
    setLoading(true)
    const r = await window.api.clips.getAll(selectedChannel)
    if (r.ok) setAllClips(r.data)
    setLoading(false)
  }

  function handleStatusChange(id, newStatus) {
    setAllClips(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c))
  }

  function switchChannel(name) {
    setSelectedChannel(name)
    setSearch('')
    setCreatorFilter('')
  }

  const creators = useMemo(() => {
    const set = new Set(allClips.map(c => c.creator_name).filter(Boolean))
    return [...set].sort()
  }, [allClips])

  const filteredClips = useMemo(() => {
    let clips = [...allClips]
    if (hideReviewed) clips = clips.filter(c => c.status === 'pending')
    if (search) clips = clips.filter(c => c.title?.toLowerCase().includes(search.toLowerCase()))
    if (creatorFilter) clips = clips.filter(c => c.creator_name === creatorFilter)
    switch (sortBy) {
      case 'views':  clips.sort((a, b) => (b.view_count || 0) - (a.view_count || 0)); break
      case 'newest': clips.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break
      case 'oldest': clips.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break
      case 'az':     clips.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')); break
    }
    return clips
  }, [allClips, search, creatorFilter, sortBy, hideReviewed])

  return (
    <div className="flex h-full">
      {/* Channel sidebar */}
      <aside className="w-52 border-r border-twitch-border bg-twitch-mid flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-twitch-border">
          <h2 className="font-semibold text-sm text-twitch-text">Channels</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {channels.map(ch => (
            <button
              key={ch.name}
              onClick={() => switchChannel(ch.name)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selectedChannel === ch.name
                  ? 'bg-twitch-purple text-white'
                  : 'text-twitch-muted hover:bg-twitch-surface hover:text-twitch-text'
              }`}
            >
              <span className="font-medium">{ch.display_name || ch.name}</span>
              {ch.is_own ? <span className="ml-1 text-[10px] opacity-70">you</span> : null}
            </button>
          ))}
          {channels.length === 0 && (
            <div className="px-3 py-2 space-y-2">
              <p className="text-xs text-twitch-muted">No channels yet.</p>
              <Link to="/settings" className="text-xs text-twitch-purple hover:underline block">
                Add channels in Settings →
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-twitch-border shrink-0 px-5 py-3 flex items-center gap-3 flex-wrap">
          <h1 className="font-bold text-lg text-twitch-text shrink-0">Review</h1>
          <button
            onClick={() => setHideReviewed(v => !v)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              hideReviewed
                ? 'bg-twitch-purple border-twitch-purple text-white'
                : 'border-twitch-border text-twitch-muted hover:border-twitch-purple/50 hover:text-twitch-text'
            }`}
          >
            Hide Reviewed
          </button>
          <div className="relative flex-1 min-w-32">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-twitch-muted pointer-events-none" />
            <input
              className="input pl-7 text-sm"
              placeholder="Search clips..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="input text-sm w-40" value={creatorFilter} onChange={e => setCreatorFilter(e.target.value)}>
            <option value="">All creators</option>
            {creators.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input text-sm w-36" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="views">Most Popular</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="az">A–Z</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && <p className="text-twitch-muted text-sm text-center mt-8">Loading...</p>}

          {!loading && filteredClips.length === 0 && (
            <div className="text-center mt-16 space-y-2">
              <p className="text-twitch-muted text-sm">No clips found.</p>
              <p className="text-twitch-border text-xs">
                {allClips.length === 0
                  ? 'Check Updates to fetch new clips from your channels.'
                  : 'Try adjusting your search or filters.'}
              </p>
            </div>
          )}

          {!loading && filteredClips.length > 0 && (
            <p className="text-[11px] text-twitch-border mb-1">
              {filteredClips.length} clip{filteredClips.length !== 1 ? 's' : ''}
              {(search || creatorFilter) ? ' (filtered)' : ''}
            </p>
          )}

          {filteredClips.map(clip => (
            <ClipRow key={`${clip.id}-${sortBy}-${search}-${creatorFilter}-${hideReviewed}-${selectedChannel}`} clip={clip} onStatusChange={handleStatusChange} />
          ))}
        </div>
      </div>
      <RightPanel />
    </div>
  )
}
