import React, { useEffect, useRef, useState, useCallback } from 'react'
import { measureIntegratedLufs, buildNormalizeEnvelope, getBaseVolume, formatLufs, LUFS_TARGET } from '../lib/loudness'

const CANVAS_H = 100
const VOL_MAX = 2.0
const HANDLE_R = 6
const HIT_DIST = 12
const PAD = HANDLE_R + 2        // keeps handles fully inside canvas at vol=0 and vol=MAX
const INNER_H = CANVAS_H - 2 * PAD

function fmtTime(secs) {
  const m = Math.floor(secs / 60)
  const s = (secs % 60).toFixed(1)
  return `${m}:${s.toString().padStart(4, '0')}`
}

function applyInterp(curve, p) {
  if (curve === 'ease-in')     return p * p
  if (curve === 'ease-out')    return 1 - (1 - p) * (1 - p)
  if (curve === 'ease-in-out') return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
  return p
}

export function getEnvelopeVol(envelope, time) {
  if (!envelope || envelope.length === 0) return 1.0
  const kfs = [...envelope].sort((a, b) => a.time - b.time)
  if (time <= kfs[0].time) return kfs[0].volume
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].volume
  let i = 0
  while (i < kfs.length - 2 && kfs[i + 1].time <= time) i++
  const a = kfs[i], b = kfs[i + 1]
  if (b.mode === 'instant') return a.volume
  const p = (time - a.time) / (b.time - a.time)
  return a.volume + (b.volume - a.volume) * applyInterp(b.curve ?? 'linear', p)
}

export default function WaveformEditor({
  clip,
  envelope: initEnvelope,
  onChange,
  videoRef,
  onLoudnessMeasured,
  onNormalizedChange
}) {
  const canvasRef = useRef(null)
  const draggingRef = useRef(null)
  const bufferRef = useRef(null)
  const keyframesRef = useRef(initEnvelope ?? [])

  const [keyframes, _setKfs] = useState(() => initEnvelope ?? [])
  const [selected, _setSel] = useState(null)
  const [peaks, setPeaks] = useState(null)
  const [canvasWidth, setCanvasWidth] = useState(0)
  const [loadingWave, setLoadingWave] = useState(false)
  const [waveError, setWaveError] = useState(null)
  const [measuring, setMeasuring] = useState(false)
  const [normalizing, setNormalizing] = useState(false)
  const [playhead, setPlayhead] = useState(null)

  const dur = clip.duration ?? 60
  const baseVolume = getBaseVolume(clip)

  // Track the playhead so the drawn curve lines up with what's audible.
  useEffect(() => {
    const vid = videoRef?.current
    if (!vid) return
    let raf
    const tick = () => {
      setPlayhead(vid.paused && vid.currentTime === 0 ? null : vid.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [videoRef])

  function setKeyframes(v) {
    const next = typeof v === 'function' ? v(keyframesRef.current) : v
    keyframesRef.current = next
    _setKfs(next)
  }

  function toXY(time, volume, w) {
    return { x: (time / dur) * w, y: PAD + (1 - volume / VOL_MAX) * INNER_H }
  }

  function fromXY(x, y, w) {
    return {
      time:   Math.max(0, Math.min(dur,     (x / w) * dur)),
      volume: Math.max(0, Math.min(VOL_MAX, (1 - (y - PAD) / INNER_H) * VOL_MAX))
    }
  }

  function findHandle(cx, cy, w, kfs) {
    for (const kf of [...kfs].reverse()) {
      const { x, y } = toXY(kf.time, kf.volume, w)
      if (Math.hypot(cx - x, cy - y) <= HIT_DIST) return kf
    }
    return null
  }

  const draw = useCallback((kfs, sel, pks, w, base, head) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const actualW = w > 0 ? w : Math.floor(canvas.getBoundingClientRect().width)
    if (actualW <= 0) return
    w = actualW
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, w, CANVAS_H)

    ctx.fillStyle = '#111118'
    ctx.fillRect(0, 0, w, CANVAS_H)

    if (pks && pks.length > 0) {
      const bw = w / pks.length
      ctx.fillStyle = 'rgba(145,70,255,0.22)'
      pks.forEach((peak, i) => {
        const bh = peak * INNER_H
        ctx.fillRect(i * bw, CANVAS_H - PAD - bh, Math.max(1, bw - 0.5), bh)
      })
    }

    // 100% reference line
    const refY = PAD + (1 - 1.0 / VOL_MAX) * INNER_H
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, refY); ctx.lineTo(w, refY); ctx.stroke()
    ctx.setLineDash([])

    // Effective (audible) level = base gain x envelope. This is what the player
    // actually plays, so drawing it removes the see/hear mismatch.
    const yFor = v => PAD + (1 - Math.min(VOL_MAX, v) / VOL_MAX) * INNER_H
    const drawPlayhead = () => {
      if (head == null || dur <= 0) return
      const hx = (head / dur) * w
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, CANVAS_H); ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(0,209,145,0.85)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    const STEPS = Math.max(2, Math.floor(w))
    for (let i = 0; i <= STEPS; i++) {
      const t = (i / STEPS) * dur
      const env = kfs && kfs.length ? getEnvelopeVol(kfs, t) : 1.0
      const y = yFor(base * env)
      i === 0 ? ctx.moveTo(0, y) : ctx.lineTo((i / STEPS) * w, y)
    }
    ctx.stroke()

    if (!kfs || kfs.length === 0) { drawPlayhead(); return }

    const sorted = [...kfs].sort((a, b) => a.time - b.time)

    // Envelope line
    ctx.strokeStyle = '#9146FF'
    ctx.lineWidth = 2
    ctx.beginPath()
    const first = toXY(sorted[0].time, sorted[0].volume, w)
    ctx.moveTo(0, first.y)
    ctx.lineTo(first.x, first.y)

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1]
      const pa = toXY(a.time, a.volume, w)
      const pb = toXY(b.time, b.volume, w)
      if (b.mode === 'instant') {
        ctx.lineTo(pb.x, pa.y)
        ctx.lineTo(pb.x, pb.y)
      } else {
        const steps = Math.max(2, Math.round((pb.x - pa.x) / 3))
        for (let s = 1; s <= steps; s++) {
          const p = s / steps
          const t = applyInterp(b.curve ?? 'linear', p)
          const vol = a.volume + (b.volume - a.volume) * t
          const pt = toXY(a.time + (b.time - a.time) * p, vol, w)
          ctx.lineTo(pt.x, pt.y)
        }
      }
    }
    const last = toXY(sorted[sorted.length - 1].time, sorted[sorted.length - 1].volume, w)
    ctx.lineTo(w, last.y)
    ctx.stroke()

    // Handles
    sorted.forEach(kf => {
      const { x, y } = toXY(kf.time, kf.volume, w)
      const isSel = kf.id === sel
      ctx.beginPath()
      ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2)
      ctx.fillStyle = isSel ? '#ffffff' : '#9146FF'
      ctx.fill()
      ctx.strokeStyle = isSel ? '#9146FF' : 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })

    drawPlayhead()
  }, [dur])

  useEffect(() => {
    draw(keyframes, selected, peaks, canvasWidth, baseVolume, playhead)
  }, [keyframes, selected, peaks, canvasWidth, draw, baseVolume, playhead])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Set initial size immediately (ResizeObserver fires async)
    const initW = Math.floor(canvas.getBoundingClientRect().width)
    if (initW > 0) { canvas.width = initW; setCanvasWidth(initW) }
    const ro = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width)
      if (w > 0) { canvas.width = w; setCanvasWidth(w) }
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  function getPos(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    // Always use CSS display width for coordinate math (matches canvas.width after ResizeObserver)
    return { cx: e.clientX - rect.left, cy: e.clientY - rect.top, w: rect.width }
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return
    e.preventDefault()
    const { cx, cy, w } = getPos(e)
    if (w <= 0) return
    const hit = findHandle(cx, cy, w, keyframesRef.current)
    if (hit) {
      _setSel(hit.id)
      draggingRef.current = hit.id
    } else {
      const { time, volume } = fromXY(cx, cy, w)
      const id = `kf_${Date.now()}`
      const newKf = { id, time, volume, mode: 'smooth', curve: 'linear' }
      const next = [...keyframesRef.current, newKf]
      setKeyframes(next)
      _setSel(id)
      draggingRef.current = id
      onChange?.(next)
    }
  }

  function handleMouseMove(e) {
    if (!draggingRef.current) return
    const { cx, cy, w } = getPos(e)
    const { time, volume } = fromXY(cx, cy, w)
    const id = draggingRef.current
    setKeyframes(prev => prev.map(kf => kf.id === id ? { ...kf, time, volume } : kf))
  }

  function handleMouseUp() {
    if (draggingRef.current) {
      onChange?.(keyframesRef.current)
      draggingRef.current = null
    }
  }

  function handleContextMenu(e) {
    e.preventDefault()
    const { cx, cy, w } = getPos(e)
    const hit = findHandle(cx, cy, w, keyframesRef.current)
    if (hit) {
      const next = keyframesRef.current.filter(kf => kf.id !== hit.id)
      setKeyframes(next)
      _setSel(s => s === hit.id ? null : s)
      onChange?.(next)
    }
  }

  function patchSelected(patch) {
    setKeyframes(prev => {
      const next = prev.map(kf => kf.id === selected ? { ...kf, ...patch } : kf)
      onChange?.(next)
      return next
    })
  }

  // Decoding is the expensive part, so it's done once and reused for peaks,
  // the native loudness readout, and building the normalize envelope.
  async function decodeAudio() {
    if (bufferRef.current) return bufferRef.current
    const r = await window.api.clips.getVideoUrl(clip.id)
    if (!r.ok) throw new Error(r.error || 'no url')
    const resp = await fetch(r.data)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const buf = await resp.arrayBuffer()
    const actx = new AudioContext()
    const audio = await actx.decodeAudioData(buf)
    actx.close()
    bufferRef.current = audio
    return audio
  }

  async function analyzeAudio() {
    setLoadingWave(true)
    setMeasuring(true)
    setWaveError(null)
    try {
      const audio = await decodeAudio()

      const ch = audio.getChannelData(0)
      const BUCKETS = 500
      const step = Math.floor(ch.length / BUCKETS)
      setPeaks(Array.from({ length: BUCKETS }, (_, i) => {
        let max = 0
        for (let j = 0; j < step; j++) {
          const v = Math.abs(ch[i * step + j] || 0)
          if (v > max) max = v
        }
        return max
      }))

      const lufs = measureIntegratedLufs(audio)
      await window.api.clips.setLoudness(clip.id, lufs)
      onLoudnessMeasured?.(lufs)
      return audio
    } catch {
      setWaveError('Could not load audio')
      return null
    } finally {
      setLoadingWave(false)
      setMeasuring(false)
    }
  }

  // Measure native loudness once per clip so the user always sees it.
  useEffect(() => {
    bufferRef.current = null
    if (clip.loudness_lufs == null) analyzeAudio()
  }, [clip.id])

  // Auto-normalize writes the correction into the envelope itself, so the level
  // is held near the target across the whole clip rather than shifted by one
  // flat gain. The generated curve stays fully editable.
  async function applyAutoNormalize() {
    setNormalizing(true)
    try {
      const audio = bufferRef.current ?? (await analyzeAudio())
      if (!audio) return
      const kfs = buildNormalizeEnvelope(audio, { target: LUFS_TARGET })
      if (!kfs) { setWaveError('Clip is too quiet or too short to normalize'); return }
      setKeyframes(kfs)
      _setSel(null)
      onChange?.(kfs)
      await window.api.clips.setNormalized(clip.id, true)
      onNormalizedChange?.(true)
    } finally {
      setNormalizing(false)
    }
  }

  async function clearEnvelope() {
    setKeyframes([])
    _setSel(null)
    onChange?.([])
    await window.api.clips.setNormalized(clip.id, false)
    onNormalizedChange?.(false)
  }

  const selectedKf = keyframes.find(kf => kf.id === selected)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-twitch-muted uppercase tracking-wide">Volume Envelope</span>
        <div className="flex items-center gap-3">
          {waveError && <span className="text-[10px] text-red-400">{waveError}</span>}
          <button
            onClick={analyzeAudio}
            disabled={loadingWave}
            className="text-[10px] text-twitch-purple hover:text-white transition-colors disabled:opacity-40"
          >
            {loadingWave ? 'Analyzing…' : peaks ? 'Reload Waveform' : 'Load Waveform'}
          </button>
        </div>
      </div>

      {/* Native loudness — always visible, never hidden behind a toggle. */}
      <div className="flex items-center justify-between rounded border border-twitch-border bg-twitch-dark px-3 py-2 gap-3">
        <div className="min-w-0">
          <p className="text-[10px] text-twitch-muted uppercase tracking-wide">Native Volume</p>
          <p className="text-sm text-twitch-text tabular-nums">
            {measuring ? 'Measuring…' : formatLufs(clip.loudness_lufs)}
            {clip.loudness_lufs != null && !measuring && (
              <span className="text-[10px] text-twitch-muted ml-2">
                target {LUFS_TARGET} LUFS
                {clip.normalized && <span className="text-[#00d191] ml-1.5">· normalized</span>}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {keyframes.length > 0 && (
            <button
              onClick={clearEnvelope}
              className="px-2.5 py-1 text-xs rounded border border-twitch-border text-twitch-muted hover:text-twitch-text transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={applyAutoNormalize}
            disabled={measuring || normalizing}
            className="px-2.5 py-1 text-xs rounded border border-twitch-purple bg-twitch-purple text-white transition-colors disabled:opacity-40"
          >
            {normalizing ? 'Normalizing…' : 'Auto-Normalize'}
          </button>
        </div>
      </div>

      <div className="rounded border border-twitch-border overflow-hidden select-none">
        <canvas
          ref={canvasRef}
          height={CANVAS_H}
          style={{ display: 'block', width: '100%', height: CANVAS_H, cursor: 'crosshair' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-twitch-muted">
        <span>Click to add point · Drag to move · Right-click to remove</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-0.5 bg-[#9146FF]" /> envelope
          <span className="inline-block w-2 h-0.5 bg-[#00d191] ml-1.5" /> audible
        </span>
      </div>

      {selectedKf && (
        <div className="rounded border border-twitch-border bg-twitch-dark px-3 py-2.5 space-y-2">
          <p className="text-[10px] text-twitch-muted">
            {fmtTime(selectedKf.time)} &middot; {Math.round(selectedKf.volume * 100)}%
          </p>
          <div className="flex gap-1.5">
            {[['smooth', 'Smooth'], ['instant', 'Jump']].map(([m, label]) => (
              <button
                key={m}
                onClick={() => patchSelected({ mode: m })}
                className={`flex-1 py-1 text-xs rounded border transition-colors ${
                  selectedKf.mode === m
                    ? 'bg-twitch-purple border-twitch-purple text-white'
                    : 'border-twitch-border text-twitch-muted hover:text-twitch-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {selectedKf.mode === 'smooth' && (
            <div className="flex gap-1">
              {[
                ['linear',      'Linear'],
                ['ease-in',     'Ease In'],
                ['ease-out',    'Ease Out'],
                ['ease-in-out', 'S-Curve'],
              ].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => patchSelected({ curve: v })}
                  className={`flex-1 py-0.5 text-[10px] rounded border transition-colors ${
                    (selectedKf.curve ?? 'linear') === v
                      ? 'bg-twitch-purple/80 border-twitch-purple text-white'
                      : 'border-twitch-border text-twitch-muted hover:text-twitch-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
