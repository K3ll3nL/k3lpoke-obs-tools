import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Copy, Monitor, Trash2, Check, Volume2, Lock, X } from 'lucide-react'
import ClipCard from '../components/ClipCard'

function duration(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function Queue() {
  const [queue, setQueue] = useState([])
  const [obsUrl, setObsUrl] = useState('')
  const [scenes, setScenes] = useState([])
  const [selectedScene, setSelectedScene] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  // Now Playing
  const [nowPlaying, setNowPlaying] = useState(null)
  const [npVolume, setNpVolume] = useState(1.0)
  const [locked, setLocked] = useState(false)
  const pendingClip = useRef(null)
  const lockedRef = useRef(false)

  const reload = useCallback(async () => {
    const r = await window.api.clips.getQueue()
    if (r.ok) setQueue(r.data)
  }, [])

  useEffect(() => {
    reload().then(() => setLoading(false))
    window.api.overlay.getUrl().then(r => { if (r.ok) setObsUrl(r.data) })
    window.api.obs.getScenes().then(r => {
      if (r.ok) {
        setScenes(r.data.scenes)
        setSelectedScene(r.data.currentScene ?? r.data.scenes[0] ?? '')
      }
    })
    window.api.player.getState().then(r => {
      if (r.ok && r.data.currentClip) {
        setNowPlaying(r.data.currentClip)
        setNpVolume(r.data.currentClip.volume ?? 1.0)
      }
    })
    window.api.player.onNowPlaying(clip => {
      if (lockedRef.current) {
        pendingClip.current = clip
      } else {
        setNowPlaying(clip)
        setNpVolume(clip?.volume ?? 1.0)
      }
    })
  }, [reload])

  function handleVolumeChange(val) {
    setNpVolume(val)
  }

  async function saveNpVolume(val) {
    if (!nowPlaying) return
    await window.api.clips.setVolume(nowPlaying.id, val)
    setNowPlaying(prev => prev ? { ...prev, volume: val } : prev)
  }

  function onSliderFocus() {
    lockedRef.current = true
    setLocked(true)
  }

  function onSliderBlur(val) {
    saveNpVolume(val)
    lockedRef.current = false
    setLocked(false)
    if (pendingClip.current) {
      const next = pendingClip.current
      pendingClip.current = null
      setNowPlaying(next)
      setNpVolume(next?.volume ?? 1.0)
    }
  }

  async function handleRemove(id) {
    await window.api.clips.remove(id)
    reload()
  }

  async function handleRemoveNowPlaying() {
    if (!nowPlaying) return
    await window.api.clips.remove(nowPlaying.id)
    setNowPlaying(null)
    pendingClip.current = null
    setLocked(false)
    reload()
  }

  async function handleAddToOBS() {
    if (!selectedScene) return
    await window.api.obs.addBrowserSource(selectedScene)
  }

  function copyUrl() {
    navigator.clipboard.writeText(obsUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full">
      {/* Clip list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-twitch-border shrink-0">
          <div>
            <h1 className="font-bold text-lg text-twitch-text">Queue</h1>
            <p className="text-xs text-twitch-muted">
              {queue.length} approved clip{queue.length !== 1 ? 's' : ''} &mdash; plays shuffled &amp; looping in OBS
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && <p className="text-twitch-muted text-sm text-center mt-8">Loading...</p>}
          {!loading && queue.length === 0 && (
            <div className="text-center mt-16 space-y-2">
              <p className="text-twitch-muted text-sm">No approved clips yet.</p>
              <p className="text-twitch-border text-xs">Go to Review to approve clips from your channels.</p>
            </div>
          )}
          {queue.map(clip => (
            <ClipCard
              key={clip.id}
              clip={clip}
              mode="queue"
              onRemove={() => handleRemove(clip.id)}
            />
          ))}
        </div>
      </div>

      {/* Right panel */}
      <aside className="w-72 border-l border-twitch-border flex flex-col bg-twitch-mid shrink-0">

        {/* Now Playing */}
        <div className="px-4 py-4 border-b border-twitch-border">
          <h2 className="font-semibold text-sm text-twitch-text flex items-center gap-1.5 mb-3">
            <Volume2 size={15} /> Now Playing
          </h2>

          {nowPlaying ? (
            <div className="space-y-3">
              {/* Thumbnail + info */}
              <div className="flex gap-2.5 items-start">
                <div className="relative shrink-0 w-20 h-[45px] rounded overflow-hidden bg-black">
                  {nowPlaying.thumbnail_url
                    ? <img src={nowPlaying.thumbnail_url} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full bg-twitch-surface" />}
                  {nowPlaying.duration && (
                    <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[9px] px-0.5 rounded">
                      {duration(nowPlaying.duration)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-twitch-text leading-snug line-clamp-2">{nowPlaying.title}</p>
                  <p className="text-[10px] text-twitch-muted mt-0.5">{nowPlaying.broadcaster_name}</p>
                </div>
              </div>

              {/* Volume */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-twitch-muted">Adjust Volume</span>
                  <span className="text-xs text-twitch-text">{Math.round(npVolume * 100)}%</span>
                </div>
                <input
                  type="range" min="0" max="2" step="0.05"
                  value={npVolume}
                  onFocus={onSliderFocus}
                  onChange={e => handleVolumeChange(Number(e.target.value))}
                  onBlur={e => onSliderBlur(Number(e.target.value))}
                  className="w-full accent-twitch-purple"
                />
              </div>

              {/* Lock indicator + remove */}
              <div className="flex items-center justify-between">
                {locked
                  ? <span className="text-[10px] text-twitch-muted flex items-center gap-1"><Lock size={10} /> Auto-update paused</span>
                  : <span />}
                <button
                  onClick={handleRemoveNowPlaying}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                >
                  <X size={11} /> Deny
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-twitch-muted">Nothing playing in OBS yet.</p>
          )}
        </div>

        {/* OBS panel */}
        <div className="px-4 py-4 border-b border-twitch-border">
          <h2 className="font-semibold text-sm text-twitch-text flex items-center gap-1.5">
            <Monitor size={15} /> OBS Setup
          </h2>
        </div>

        <div className="p-4 space-y-5 flex-1 overflow-y-auto">
          <div className="card p-3 bg-twitch-surface border-twitch-purple/40">
            <p className="text-xs text-twitch-purple font-semibold uppercase tracking-wide mb-1">How it works</p>
            <p className="text-xs text-twitch-muted leading-relaxed">
              Add the Browser Source to OBS once. Whenever the source is visible, it automatically plays your approved clips in a shuffled loop — no controls needed.
            </p>
          </div>

          {/* Browser source URL */}
          <div>
            <label className="label">Browser Source URL</label>
            <div className="flex gap-2">
              <input className="input text-xs font-mono" readOnly value={obsUrl} />
              <button className="btn-ghost shrink-0 px-3" onClick={copyUrl} title="Copy">
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-[11px] text-twitch-muted mt-1">
              In OBS: Add Source → Browser → paste this URL
            </p>
          </div>

          {/* Auto-add to scene */}
          <div>
            <label className="label">Add to Scene</label>
            <select
              className="input mb-2"
              value={selectedScene}
              onChange={e => setSelectedScene(e.target.value)}
            >
              {scenes.map(s => <option key={s} value={s}>{s}</option>)}
              {scenes.length === 0 && <option value="">Connect OBS first</option>}
            </select>
            <button
              className="btn-purple w-full text-sm"
              onClick={handleAddToOBS}
              disabled={!selectedScene}
            >
              Add Browser Source to Scene
            </button>
            <p className="text-[11px] text-twitch-muted mt-1">
              Creates or updates "Twitch Clip Queue" in the selected scene.
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}
