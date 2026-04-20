import React, { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, CheckCheck, XSquare, Check, X, ChevronDown, Eye, Volume2, Scissors, Activity } from 'lucide-react'
import WaveformEditor from '../components/WaveformEditor'
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
  const [status, setStatus] = useState(clip.status ?? 'pending')
  const videoRef = useRef(null)

  async function saveTrim(start, end) {
    const clipDur = clip.duration ?? 0
    await window.api.clips.setTrim(
      clip.id,
      start > 0 ? start : null,
      end < clipDur ? end : null
    )
  }

  async function saveVolume(val) {
    await window.api.clips.setVolume(clip.id, val)
  }

  useEffect(() => {
    const vid = videoRef.current
    if (!vid || !videoUrl) return
    const onMeta = () => { vid.currentTime = trimStart }
    const onTick = () => {
      if (vid.currentTime >= trimEnd) vid.pause()
    }
    vid.addEventListener('loadedmetadata', onMeta)
    vid.addEventListener('timeupdate', onTick)
    if (vid.readyState >= 1) vid.currentTime = trimStart
    return () => {
      vid.removeEventListener('loadedmetadata', onMeta)
      vid.removeEventListener('timeupdate', onTick)
    }
  }, [videoUrl, trimStart, trimEnd])

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
    setStatus('approved')
    onStatusChange(clip.id, 'approved')
  }

  async function handleDeny() {
    await window.api.clips.deny(clip.id)
    setStatus('denied')
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
              <span className="text-twitch-text font-medium">{clip.broadcaster_name}</span>
              {' '}&middot; Clipped by <span className="text-twitch-purple">{clip.creator_name}</span>
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
              status === 'approved'
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
              status === 'denied'
                ? 'bg-red-600 text-white'
                : 'bg-red-600/15 text-red-400 hover:bg-red-600 hover:text-white'
            }`}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Expanded video + volume */}
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

export default function Updates() {
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [checking, setChecking] = useState(false)
  const [fetchResults, setFetchResults] = useState(null)
  const [lastCheck, setLastCheck] = useState(null)
  const lastCheckRef = useRef(null)

  const load = useCallback(async (since) => {
    const r = await window.api.clips.getNew(since)
    if (r.ok) setClips(r.data)
  }, [])

  useEffect(() => {
    async function init() {
      const r = await window.api.settings.get('lastUpdatesCheck')
      const since = r.ok ? r.data : null
      lastCheckRef.current = since
      setLastCheck(since)
      await load(since)
      setLoading(false)
    }
    init()
  }, [load])

  useEffect(() => {
    window.api.twitch.onNewClips(({ count }) => {
      if (count > 0) load(lastCheckRef.current)
    })
  }, [load])

  async function handleRefresh() {
    setFetching(true)
    setFetchResults(null)
    const r = await window.api.twitch.fetchAllChannels()
    if (r.ok) {
      setFetchResults(r.data)
      await load(lastCheck)
    }
    setFetching(false)
  }

  async function handleCheckNew() {
    setChecking(true)
    await window.api.twitch.fetchNewClips()
    await load(lastCheck)
    setChecking(false)
  }

  async function markSeen() {
    const now = new Date().toISOString()
    await window.api.settings.set('lastUpdatesCheck', now)
    setLastCheck(now)
    setClips([])
    setFetchResults(null)
  }

  async function approveAll() {
    const ids = clips.map(c => c.id)
    await window.api.clips.bulkApprove(ids)
    setClips([])
  }

  async function denyAll() {
    const ids = clips.map(c => c.id)
    await window.api.clips.bulkDeny(ids)
    setClips([])
  }

  function handleStatusChange(id) {
    setClips(prev => prev.filter(c => c.id !== id))
  }

  const sinceLabel = lastCheck
    ? new Date(lastCheck).toLocaleString()
    : 'the beginning'

  return (
    <div className="flex h-full">
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-twitch-border shrink-0">
        <div>
          <h1 className="font-bold text-lg text-twitch-text">Updates</h1>
          <p className="text-xs text-twitch-muted">
            {loading ? 'Loading...' : `${clips.length} new clip${clips.length !== 1 ? 's' : ''} since ${sinceLabel}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {clips.length > 0 && (
            <>
              <button className="btn-success flex items-center gap-1.5 text-xs" onClick={approveAll}>
                <CheckCheck size={13} /> Approve All
              </button>
              <button className="btn-danger flex items-center gap-1.5 text-xs" onClick={denyAll}>
                <XSquare size={13} /> Deny All
              </button>
            </>
          )}
          {clips.length > 0 && (
            <button className="btn-ghost flex items-center gap-1.5 text-xs" onClick={markSeen}>
              <Eye size={13} /> Mark Seen
            </button>
          )}
          <button
            className="btn-ghost flex items-center gap-1.5 text-sm"
            onClick={handleCheckNew}
            disabled={checking || fetching}
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking...' : 'Check for New'}
          </button>
          <button
            className="btn-purple flex items-center gap-1.5 text-sm"
            onClick={handleRefresh}
            disabled={fetching || checking}
          >
            <RefreshCw size={14} className={fetching ? 'animate-spin' : ''} />
            {fetching ? 'Fetching...' : 'Refresh All Channels'}
          </button>
        </div>
      </div>

      {fetchResults && (
        <div className="mx-5 mt-3 shrink-0 flex flex-wrap gap-2">
          {fetchResults.map(r => (
            <span
              key={r.channel}
              className={`text-[11px] px-2 py-1 rounded border ${
                r.error
                  ? 'bg-red-600/10 border-red-600/30 text-red-400'
                  : 'bg-twitch-surface border-twitch-border text-twitch-muted'
              }`}
            >
              {r.channel}: {r.error ? `error` : `+${r.added} new`}
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading && <p className="text-twitch-muted text-sm text-center mt-8">Loading...</p>}

        {!loading && clips.length === 0 && (
          <div className="text-center mt-16 space-y-3">
            <p className="text-twitch-muted text-sm">No new clips since {sinceLabel}.</p>
            <p className="text-twitch-border text-xs">Hit "Refresh All Channels" to check for new clips from everyone you follow.</p>
          </div>
        )}

        {clips.map(clip => (
          <ClipRow key={clip.id} clip={clip} onStatusChange={handleStatusChange} />
        ))}
      </div>
    </div>
    <RightPanel />
    </div>
  )
}
