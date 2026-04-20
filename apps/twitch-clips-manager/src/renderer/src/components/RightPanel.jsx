import React, { useEffect, useState, useRef } from 'react'
import { Copy, Monitor, Check, Volume2, Lock, X, Scissors, Activity } from 'lucide-react'
import TrimBar from './TrimBar'
import WaveformEditor from './WaveformEditor'

function duration(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function RightPanel() {
  const [obsUrl, setObsUrl] = useState('')
  const [scenes, setScenes] = useState([])
  const [selectedScene, setSelectedScene] = useState('')
  const [copied, setCopied] = useState(false)

  const [nowPlaying, setNowPlaying] = useState(null)
  const [npVolume, setNpVolume] = useState(1.0)
  const [locked, setLocked] = useState(false)
  const [showTrim, setShowTrim] = useState(false)
  const [showEnvelope, setShowEnvelope] = useState(false)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [clipEnvelope, setClipEnvelope] = useState([])

  const pendingClip = useRef(null)
  const lockedRef = useRef(false)

  function applyClip(clip) {
    setNowPlaying(clip)
    setNpVolume(clip?.volume ?? 1.0)
    if (clip) {
      setTrimStart(clip.trim_start ?? 0)
      setTrimEnd(clip.trim_end ?? clip.duration ?? 0)
      setClipEnvelope(clip.envelope ?? [])
      setShowTrim(false)
      setShowEnvelope(false)
    }
  }

  useEffect(() => {
    window.api.overlay.getUrl().then(r => { if (r.ok) setObsUrl(r.data) })
    window.api.obs.getScenes().then(r => {
      if (r.ok) {
        setScenes(r.data.scenes)
        setSelectedScene(r.data.currentScene ?? r.data.scenes[0] ?? '')
      }
    })
    window.api.player.getState().then(r => {
      if (r.ok && r.data.currentClip) applyClip(r.data.currentClip)
    })
    window.api.player.onNowPlaying(clip => {
      if (lockedRef.current) {
        pendingClip.current = clip
      } else {
        applyClip(clip)
      }
    })
  }, [])

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
      applyClip(next)
    }
  }

  async function saveTrim(start, end) {
    if (!nowPlaying) return
    const clipDur = nowPlaying.duration ?? 0
    await window.api.clips.setTrim(
      nowPlaying.id,
      start > 0 ? start : null,
      end < clipDur ? end : null
    )
    setNowPlaying(prev => prev ? {
      ...prev,
      trim_start: start > 0 ? start : null,
      trim_end: end < clipDur ? end : null
    } : prev)
  }

  async function handleRemoveNowPlaying() {
    if (!nowPlaying) return
    await window.api.clips.remove(nowPlaying.id)
    setNowPlaying(null)
    pendingClip.current = null
    setLocked(false)
    lockedRef.current = false
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
    <aside className="w-72 border-l border-twitch-border flex flex-col bg-twitch-mid shrink-0">
      {/* Now Playing */}
      <div className="px-4 py-4 border-b border-twitch-border overflow-y-auto">
        <h2 className="font-semibold text-sm text-twitch-text flex items-center gap-1.5 mb-3">
          <Volume2 size={15} /> Now Playing
        </h2>

        {nowPlaying ? (
          <div className="space-y-3">
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

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-twitch-muted">Volume</span>
                <span className="text-xs text-twitch-text">{Math.round(npVolume * 100)}%</span>
              </div>
              <input
                type="range" min="0" max="2" step="0.05"
                value={npVolume}
                onFocus={onSliderFocus}
                onChange={e => setNpVolume(Number(e.target.value))}
                onBlur={e => onSliderBlur(Number(e.target.value))}
                className="w-full accent-twitch-purple"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowTrim(v => !v)}
                className={`flex items-center gap-1 text-xs shrink-0 transition-colors ${showTrim ? 'text-twitch-purple' : 'text-twitch-muted hover:text-twitch-text'}`}
              >
                <Scissors size={12} /> Trim
              </button>
              <button
                onClick={() => setShowEnvelope(v => !v)}
                className={`flex items-center gap-1 text-xs shrink-0 transition-colors ${showEnvelope ? 'text-twitch-purple' : 'text-twitch-muted hover:text-twitch-text'}`}
              >
                <Activity size={12} /> Envelope
              </button>
            </div>

            {showTrim && (
              <TrimBar
                duration={nowPlaying.duration}
                trimStart={trimStart}
                trimEnd={trimEnd}
                onChange={(s, e) => { setTrimStart(s); setTrimEnd(e) }}
                onSave={saveTrim}
              />
            )}

            {showEnvelope && (
              <WaveformEditor
                clip={nowPlaying}
                envelope={clipEnvelope}
                onChange={env => {
                  setClipEnvelope(env)
                  window.api.clips.setEnvelope(nowPlaying.id, env)
                  setNowPlaying(prev => prev ? { ...prev, envelope: env } : prev)
                }}
              />
            )}

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

      {/* OBS Setup */}
      <div className="px-4 py-4 border-b border-twitch-border shrink-0">
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
  )
}
