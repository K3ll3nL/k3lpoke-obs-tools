import React, { useEffect, useState, useRef, useMemo } from 'react'
import { Copy, Monitor, Check, Volume2, Lock, X, Scissors, Activity, Layers, Shuffle, SkipForward } from 'lucide-react'
import { Link } from 'react-router-dom'
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

  // Now Playing
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

  // Up Next
  const [nextClip, setNextClip] = useState(null)

  // Collections / playback source
  const [collections, setCollections] = useState([])
  const [playMode, setPlayMode] = useState('single')
  const [activeSingleId, setActiveSingleId] = useState('main')
  const [weightedSets, setWeightedSets] = useState([])
  const [configSaved, setConfigSaved] = useState(false)

  const allCollections = useMemo(() => [
    { id: 'main', name: 'Main Queue', color: '#9146ff' },
    ...collections
  ], [collections])

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
      if (lockedRef.current) { pendingClip.current = clip } else { applyClip(clip) }
    })
    window.api.player.getNextClip().then(r => { if (r.ok) setNextClip(r.data) })
    window.api.player.onNextClip(clip => setNextClip(clip))
    window.api.collections.list().then(r => { if (r.ok) setCollections(r.data) })
    window.api.playback.getConfig().then(r => {
      if (!r.ok) return
      setPlayMode(r.data.mode)
      setActiveSingleId(r.data.activeCollectionId || 'main')
      setWeightedSets(r.data.weightedSets || [])
    })
  }, [])

  async function saveNpVolume(val) {
    if (!nowPlaying) return
    await window.api.clips.setVolume(nowPlaying.id, val)
    setNowPlaying(prev => prev ? { ...prev, volume: val } : prev)
  }

  function onSliderFocus() { lockedRef.current = true; setLocked(true) }

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

  // Playback config helpers
  function isInWeightedSet(colId) {
    return weightedSets.some(s => s.collectionId === colId)
  }

  function toggleWeightedSet(colId) {
    setWeightedSets(prev =>
      isInWeightedSet(colId)
        ? prev.filter(s => s.collectionId !== colId)
        : [...prev, { collectionId: colId, weight: 50 }]
    )
  }

  function setWeight(colId, weight) {
    setWeightedSets(prev =>
      prev.map(s => s.collectionId === colId ? { ...s, weight: Math.max(1, Math.min(100, Number(weight) || 1)) } : s)
    )
  }

  const totalWeight = weightedSets.reduce((s, w) => s + w.weight, 0)

  async function savePlaybackConfig() {
    await window.api.playback.setConfig({
      mode: playMode,
      activeCollectionId: playMode === 'single' ? activeSingleId : 'main',
      weightedSets: playMode === 'weighted' ? weightedSets : []
    })
    setConfigSaved(true)
    setTimeout(() => setConfigSaved(false), 2000)
  }

  async function handleSingleSwitch(id) {
    setActiveSingleId(id)
    await window.api.playback.setConfig({ mode: 'single', activeCollectionId: id, weightedSets: [] })
    setPlayMode('single')
  }

  return (
    <aside className="w-72 border-l border-twitch-border flex flex-col bg-twitch-mid shrink-0 overflow-y-auto">

      {/* Now Playing */}
      <div className="px-4 py-4 border-b border-twitch-border shrink-0">
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

      {/* Up Next */}
      <div className="px-4 py-4 border-b border-twitch-border shrink-0">
        <h2 className="font-semibold text-sm text-twitch-text flex items-center gap-1.5 mb-3">
          <SkipForward size={15} /> Up Next
        </h2>
        {nextClip ? (
          <div className="flex gap-2.5 items-start">
            <div className="relative shrink-0 w-16 h-9 rounded overflow-hidden bg-black">
              {nextClip.thumbnail_url
                ? <img src={nextClip.thumbnail_url} className="w-full h-full object-cover" alt="" />
                : <div className="w-full h-full bg-twitch-surface" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-twitch-text leading-snug line-clamp-2">{nextClip.title}</p>
              <p className="text-[10px] text-twitch-muted mt-0.5">{nextClip.broadcaster_name}</p>
            </div>
            <button
              onClick={() => window.api.player.skipNext()}
              title="Skip — pick a different next clip"
              className="shrink-0 w-7 h-7 rounded flex items-center justify-center text-twitch-muted hover:text-twitch-text hover:bg-twitch-surface transition-colors"
            >
              <SkipForward size={13} />
            </button>
          </div>
        ) : (
          <p className="text-xs text-twitch-muted">Nothing queued yet.</p>
        )}
      </div>

      {/* Now Playing Source */}
      <div className="px-4 py-4 border-b border-twitch-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm text-twitch-text flex items-center gap-1.5">
            <Layers size={15} /> Now Playing Source
          </h2>
          <Link to="/collections" className="text-[10px] text-twitch-purple hover:underline shrink-0">Manage →</Link>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-twitch-border mb-3">
          <button
            onClick={() => setPlayMode('single')}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${playMode === 'single' ? 'bg-twitch-purple text-white' : 'text-twitch-muted hover:text-twitch-text'}`}
          >
            Single
          </button>
          <button
            onClick={() => setPlayMode('weighted')}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${playMode === 'weighted' ? 'bg-twitch-purple text-white' : 'text-twitch-muted hover:text-twitch-text'}`}
          >
            <Shuffle size={11} /> Weighted
          </button>
        </div>

        {/* Single mode: quick-switch dropdown */}
        {playMode === 'single' && (
          <div className="space-y-1">
            {allCollections.map(col => (
              <button
                key={col.id}
                onClick={() => handleSingleSwitch(col.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                  activeSingleId === col.id
                    ? 'bg-twitch-surface border border-twitch-purple/40 text-twitch-text'
                    : 'text-twitch-muted hover:bg-twitch-surface/60 hover:text-twitch-text border border-transparent'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.color }} />
                <span className="flex-1 truncate">{col.name}</span>
                {activeSingleId === col.id && <Check size={11} className="text-twitch-purple shrink-0" />}
              </button>
            ))}
          </div>
        )}

        {/* Weighted mode: sliders */}
        {playMode === 'weighted' && (
          <div className="space-y-2.5">
            {allCollections.map(col => {
              const inSet = isInWeightedSet(col.id)
              const set = weightedSets.find(s => s.collectionId === col.id)
              const pct = totalWeight > 0 && inSet ? Math.round((set.weight / totalWeight) * 100) : 0
              return (
                <div key={col.id}>
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={() => toggleWeightedSet(col.id)}
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        inSet ? 'bg-twitch-purple border-twitch-purple' : 'border-twitch-border hover:border-twitch-purple/50'
                      }`}
                    >
                      {inSet && <Check size={9} className="text-white" />}
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
                      className="w-full accent-twitch-purple"
                    />
                  )}
                </div>
              )
            })}
            {weightedSets.length === 0 && (
              <p className="text-[11px] text-twitch-border">Check collections above to include them.</p>
            )}
            <button
              onClick={savePlaybackConfig}
              disabled={weightedSets.length === 0}
              className="btn-purple w-full text-xs py-1.5 flex items-center justify-center gap-1 mt-1"
            >
              {configSaved ? <><Check size={11} /> Saved</> : 'Apply Mix'}
            </button>
          </div>
        )}
      </div>

      {/* OBS Setup */}
      <div className="px-4 py-4 border-b border-twitch-border shrink-0">
        <h2 className="font-semibold text-sm text-twitch-text flex items-center gap-1.5">
          <Monitor size={15} /> OBS Setup
        </h2>
      </div>

      <div className="p-4 space-y-4 shrink-0">
        <div>
          <label className="label">Browser Source URL</label>
          <div className="flex gap-2">
            <input className="input text-xs font-mono" readOnly value={obsUrl} />
            <button className="btn-ghost shrink-0 px-3" onClick={copyUrl} title="Copy">
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-[11px] text-twitch-muted mt-1">In OBS: Add Source → Browser → paste this URL</p>
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
        </div>
      </div>
    </aside>
  )
}
