import React, { useState, useEffect, useRef } from 'react'
import { WifiOff, Trash2, Check, AlertCircle, Loader2 } from 'lucide-react'

const OBS_W = 1920
const OBS_H = 1080
const ZONE_COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899']
const ALIGN_GRID  = [['tl','tc','tr'],['ml','c','mr'],['bl','bc','br']]
const ALIGN_ARROW = { tl:'↖', tc:'↑', tr:'↗', ml:'←', c:'○', mr:'→', bl:'↙', bc:'↓', br:'↘' }
const ALIGN_TO_OBS = { tl:5, tc:4, tr:6, ml:1, c:0, mr:2, bl:9, bc:8, br:10 }
const HANDLES = {
  tl: { top:-4, left:-4,   cursor:'nw-resize' },
  tr: { top:-4, right:-4,  cursor:'ne-resize' },
  bl: { bottom:-4, left:-4, cursor:'sw-resize' },
  br: { bottom:-4, right:-4, cursor:'se-resize' },
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
function uid() { return Math.random().toString(36).slice(2, 8) }

function toOBS(e, el) {
  const r = el.getBoundingClientRect()
  return {
    x: clamp(Math.round((e.clientX - r.left) / r.width  * OBS_W), 0, OBS_W),
    y: clamp(Math.round((e.clientY - r.top)  / r.height * OBS_H), 0, OBS_H),
  }
}

function getTopLeft(t) {
  const useBounds = t.boundsType && t.boundsType !== 'OBS_BOUNDS_NONE'
  const w = useBounds ? (t.boundsWidth  || 0) : (t.width  || (t.sourceWidth  * (t.scaleX || 1)) || 0)
  const h = useBounds ? (t.boundsHeight || 0) : (t.height || (t.sourceHeight * (t.scaleY || 1)) || 0)
  let x = t.positionX || 0, y = t.positionY || 0
  const a = t.alignment || 0
  if (!(a & 1) && !(a & 2)) x -= w / 2; else if (a & 2) x -= w
  if (!(a & 4) && !(a & 8)) y -= h / 2; else if (a & 8) y -= h
  return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(w, 50)), h: Math.round(Math.max(h, 30)) }
}

export default function SceneArranger({ obsConnected }) {
  const canvasRef = useRef(null)
  const dragRef   = useRef(null)

  const [scenes,     setScenes]     = useState([])
  const [scene,      setScene]      = useState('')
  const [sceneItems, setSceneItems] = useState([])
  const [zones,      setZones]      = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [dragging,   setDragging]   = useState(false)
  const [applying,   setApplying]   = useState(false)
  const [status,     setStatus]     = useState(null)

  useEffect(() => {
    if (!obsConnected) return
    window.api.obs.getScenes().then(r => { if (r.ok) setScenes(r.data.scenes ?? []) })
  }, [obsConnected])

  useEffect(() => {
    if (!scene) return
    window.api.scenes.getAll().then(r => {
      if (!r.ok) return
      const items = r.data.find(s => s.name === scene)?.items ?? []
      setSceneItems(items)
      setZones(items.map((item, i) => ({
        id: uid(), ...getTopLeft(item.transform),
        margin: 0, alignment: 'c',
        sourceName: item.sourceName,
        color: ZONE_COLORS[i % ZONE_COLORS.length],
      })))
      setSelectedId(null)
      setStatus(null)
    })
  }, [scene])

  // Stable global mouse listeners — dragRef holds all mutable drag state
  useEffect(() => {
    function onMove(e) {
      const d = dragRef.current
      if (!d || !canvasRef.current) return
      const { x, y } = toOBS(e, canvasRef.current)
      if (d.type === 'create') {
        setZones(zs => zs.map(z => z.id !== d.id ? z : {
          ...z,
          x: Math.min(d.sx, x), y: Math.min(d.sy, y),
          w: Math.abs(x - d.sx), h: Math.abs(y - d.sy),
        }))
      } else if (d.type === 'move') {
        setZones(zs => zs.map(z => z.id !== d.id ? z : {
          ...z,
          x: clamp(x - d.ox, 0, OBS_W - z.w),
          y: clamp(y - d.oy, 0, OBS_H - z.h),
        }))
      } else if (d.type === 'resize') {
        setZones(zs => zs.map(z => {
          if (z.id !== d.id) return z
          const MIN = 40
          let { x: zx, y: zy, w: zw, h: zh } = z
          if (d.h.includes('r')) zw = Math.max(MIN, x - zx)
          if (d.h.includes('l')) { const r = zx+zw; zx = Math.min(x, r-MIN); zw = r-zx }
          if (d.h.includes('b')) zh = Math.max(MIN, y - zy)
          if (d.h.includes('t')) { const b = zy+zh; zy = Math.min(y, b-MIN); zh = b-zy }
          return { ...z, x: zx, y: zy, w: zw, h: zh }
        }))
      }
    }
    function onUp() {
      const d = dragRef.current
      if (!d) return
      if (d.type === 'create') {
        setZones(zs => zs.filter(z => z.id !== d.id || (z.w >= 20 && z.h >= 20)))
      }
      dragRef.current = null
      setDragging(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [])

  function onCanvasMD(e) {
    if (e.target !== canvasRef.current) return
    e.preventDefault()
    const { x, y } = toOBS(e, canvasRef.current)
    const id    = uid()
    const color = ZONE_COLORS[zones.length % ZONE_COLORS.length]
    setZones(zs => [...zs, { id, x, y, w: 0, h: 0, margin: 0, alignment: 'c', sourceName: '', color }])
    setSelectedId(id)
    dragRef.current = { type: 'create', id, sx: x, sy: y }
    setDragging(true)
  }

  function onZoneMD(e, id) {
    e.stopPropagation(); e.preventDefault()
    setSelectedId(id)
    const { x, y } = toOBS(e, canvasRef.current)
    const z = zones.find(z => z.id === id)
    dragRef.current = { type: 'move', id, ox: x - z.x, oy: y - z.y }
    setDragging(true)
  }

  function onHandleMD(e, id, h) {
    e.stopPropagation(); e.preventDefault()
    dragRef.current = { type: 'resize', id, h }
    setDragging(true)
  }

  function updateZone(id, patch) {
    setZones(zs => zs.map(z => z.id === id ? { ...z, ...patch } : z))
  }

  function deleteZone(id) {
    setZones(zs => zs.filter(z => z.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  async function applyLayout() {
    if (!scene) return
    setApplying(true)
    setStatus(null)
    const errors = []
    for (const zone of zones) {
      if (!zone.sourceName) continue
      const item = sceneItems.find(i => i.sourceName === zone.sourceName)
      if (!item) { errors.push(`"${zone.sourceName}" not in scene`); continue }
      const m = zone.margin
      const res = await window.api.scenes.setTransform(scene, item.sceneItemId, {
        positionX: zone.x + m, positionY: zone.y + m,
        alignment: 5,
        boundsType: 'OBS_BOUNDS_SCALE_INNER',
        boundsWidth:  Math.max(1, zone.w - m * 2),
        boundsHeight: Math.max(1, zone.h - m * 2),
        boundsAlignment: ALIGN_TO_OBS[zone.alignment] ?? 0,
        scaleX: 1, scaleY: 1, rotation: 0,
      })
      if (!res.ok) errors.push(`${zone.sourceName}: ${res.error}`)
    }
    setApplying(false)
    setStatus(errors.length
      ? { ok: false, msg: errors.join(' · ') }
      : { ok: true,  msg: 'Layout applied!' }
    )
  }

  const sel        = zones.find(z => z.id === selectedId)
  const usedSources = new Set(zones.map(z => z.sourceName).filter(Boolean))
  const canApply   = scene && zones.some(z => z.sourceName)

  if (!obsConnected) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
      <WifiOff size={36} className="text-twitch-muted" />
      <p className="text-white font-medium">OBS not connected</p>
      <p className="text-twitch-muted text-sm">Connect OBS in Settings first.</p>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-twitch-dark overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
        <select
          value={scene}
          onChange={e => { setScene(e.target.value); setZones([]); setSelectedId(null); setStatus(null) }}
          className="flex-1 max-w-xs px-3 py-1.5 rounded-lg bg-twitch-mid border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500"
        >
          <option value="">— select a scene —</option>
          {scenes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <button
          onClick={() => { setZones([]); setSelectedId(null) }}
          disabled={!zones.length}
          className="px-3 py-1.5 rounded-lg text-twitch-muted hover:text-white hover:bg-white/10 text-sm transition-colors disabled:opacity-30"
        >
          Clear
        </button>

        <div className="flex items-center gap-3 ml-auto">
          {status && (
            <span className={`flex items-center gap-1.5 text-sm ${status.ok ? 'text-green-400' : 'text-red-400'}`}>
              {status.ok ? <Check size={14} /> : <AlertCircle size={14} />}
              {status.msg}
            </span>
          )}
          <button
            onClick={applyLayout}
            disabled={!canApply || applying}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            {applying && <Loader2 size={14} className="animate-spin" />}
            Apply to OBS
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center p-4 bg-black/30 overflow-hidden relative">
          {!scene && (
            <p className="text-twitch-muted text-sm absolute">Select a scene above to get started.</p>
          )}
          <div
            ref={canvasRef}
            className="relative bg-[#0a0a0a] overflow-hidden select-none"
            style={{
              aspectRatio: '16/9',
              maxWidth: '100%',
              maxHeight: '100%',
              width: '100%',
              cursor: dragging ? 'grabbing' : 'crosshair',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
            }}
            onMouseDown={onCanvasMD}
          >
            {/* Subtle grid */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
              backgroundSize: `${100/16}% ${100/9}%`,
            }} />
            {/* Center guides */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/[0.06] pointer-events-none" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/[0.06] pointer-events-none" />

            {zones.map(zone => {
              const isSel = zone.id === selectedId
              return (
                <div
                  key={zone.id}
                  style={{
                    position: 'absolute',
                    left:   `${zone.x / OBS_W * 100}%`,
                    top:    `${zone.y / OBS_H * 100}%`,
                    width:  `${zone.w / OBS_W * 100}%`,
                    height: `${zone.h / OBS_H * 100}%`,
                    border: `2px solid ${zone.color}`,
                    background: isSel ? `${zone.color}30` : `${zone.color}18`,
                    boxSizing: 'border-box',
                    cursor: 'grab',
                  }}
                  onMouseDown={e => onZoneMD(e, zone.id)}
                >
                  <div
                    className="absolute top-0 left-0 px-1 truncate max-w-full pointer-events-none"
                    style={{ color: zone.color, background: 'rgba(0,0,0,0.55)', fontSize: 10, lineHeight: '1.5' }}
                  >
                    {zone.sourceName || '(unassigned)'}
                  </div>

                  {/* Margin inset preview */}
                  {zone.margin > 0 && zone.w > 0 && zone.h > 0 && (
                    <div style={{
                      position: 'absolute',
                      top:    `${zone.margin / zone.h * 100}%`,
                      left:   `${zone.margin / zone.w * 100}%`,
                      right:  `${zone.margin / zone.w * 100}%`,
                      bottom: `${zone.margin / zone.h * 100}%`,
                      border: `1px dashed ${zone.color}70`,
                      pointerEvents: 'none',
                    }} />
                  )}

                  {/* Resize handles */}
                  {isSel && Object.entries(HANDLES).map(([h, s]) => (
                    <div
                      key={h}
                      style={{
                        position: 'absolute', width: 8, height: 8,
                        background: '#fff', border: `2px solid ${zone.color}`,
                        borderRadius: 2, zIndex: 10, ...s,
                      }}
                      onMouseDown={e => onHandleMD(e, zone.id, h)}
                    />
                  ))}
                </div>
              )
            })}
          </div>

          {/* Draw hint */}
          {scene && !zones.length && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/70 rounded-lg text-twitch-muted text-xs pointer-events-none whitespace-nowrap">
              Click and drag to create a zone · Click a zone to configure it
            </div>
          )}
        </div>

        {/* Properties panel */}
        {sel && (
          <div className="w-52 border-l border-white/10 flex-shrink-0 overflow-y-auto">
            <div className="p-4 space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-twitch-muted uppercase tracking-wider">Zone</span>
                <button onClick={() => deleteZone(sel.id)} className="p-1 rounded text-twitch-muted hover:text-red-400 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Source */}
              <div>
                <label className="block text-xs text-twitch-muted mb-1.5">Source</label>
                <select
                  value={sel.sourceName}
                  onChange={e => updateZone(sel.id, { sourceName: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-lg bg-twitch-mid border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="">— unassigned —</option>
                  {sceneItems.map(i => (
                    <option
                      key={i.sourceName} value={i.sourceName}
                      disabled={usedSources.has(i.sourceName) && i.sourceName !== sel.sourceName}
                    >
                      {i.sourceName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Position & Size */}
              <div>
                <label className="block text-xs text-twitch-muted mb-1.5">Position & Size</label>
                <div className="grid grid-cols-2 gap-1">
                  {[['X','x',0,OBS_W],['Y','y',0,OBS_H],['W','w',40,OBS_W],['H','h',40,OBS_H]].map(([lbl, k, lo, hi]) => (
                    <div key={k} className="flex items-center gap-1">
                      <span className="text-xs text-twitch-muted w-3 shrink-0">{lbl}</span>
                      <input
                        type="number" min={lo} max={hi} value={sel[k]}
                        onChange={e => updateZone(sel.id, { [k]: clamp(parseInt(e.target.value) || 0, lo, hi) })}
                        className="w-full px-1.5 py-1 rounded bg-twitch-mid border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 min-w-0"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Margin */}
              <div>
                <label className="block text-xs text-twitch-muted mb-1.5">
                  Margin <span className="text-white">{sel.margin}px</span>
                </label>
                <input
                  type="range" min={0} max={Math.max(0, Math.floor(Math.min(sel.w, sel.h) / 4))}
                  value={sel.margin}
                  onChange={e => updateZone(sel.id, { margin: parseInt(e.target.value) })}
                  className="w-full accent-indigo-500"
                />
              </div>

              {/* Alignment */}
              <div>
                <label className="block text-xs text-twitch-muted mb-1.5">Alignment</label>
                <div className="grid grid-cols-3 gap-1">
                  {ALIGN_GRID.flat().map(a => (
                    <button
                      key={a}
                      onClick={() => updateZone(sel.id, { alignment: a })}
                      className={`py-1.5 rounded text-sm transition-colors ${sel.alignment === a ? 'bg-indigo-600 text-white' : 'bg-twitch-mid text-twitch-muted hover:text-white hover:bg-white/10'}`}
                    >
                      {ALIGN_ARROW[a]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs text-twitch-muted mb-1.5">Color</label>
                <div className="flex gap-1 flex-wrap">
                  {ZONE_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => updateZone(sel.id, { color: c })}
                      style={{
                        background: c, width: 18, height: 18, borderRadius: 3,
                        border: sel.color === c ? '2px solid white' : '2px solid transparent',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
