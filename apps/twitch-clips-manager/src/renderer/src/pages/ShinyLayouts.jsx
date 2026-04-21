import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// w and h are % of canvas width/height (same units as x, y).
// Group fills this much of the canvas after normalize (Windows-style).
const DEFAULT_W = 45
const DEFAULT_H = 45
const FILL_PCT  = 85
const EPS       = 0.001

function tilesOverlap(a, b) {
  return (a.x + a.w/2) > (b.x - b.w/2) + EPS && (a.x - a.w/2) + EPS < (b.x + b.w/2) &&
         (a.y + a.h/2) > (b.y - b.h/2) + EPS && (a.y - a.h/2) + EPS < (b.y + b.h/2)
}

function hasOverlapWithOthers(pos, others) {
  return others.some(o => tilesOverlap(pos, o))
}

// Snap `dragged` flush against the nearest edge of any `others` tile.
// Perpendicular axis is clamped to the target tile's span so tiles always touch.
function snapAdjacent(dragged, others) {
  if (others.length === 0) return { ...dragged, x: 50, y: 50 }
  const dw = dragged.w, dh = dragged.h
  const cands = []
  for (const o of others) {
    const ow = o.w, oh = o.h
    // Clamp perpendicular so the tile stays within o's span (never floats free)
    const cy = Math.max(o.y - oh/2 + dh/2, Math.min(o.y + oh/2 - dh/2, dragged.y))
    const cx = Math.max(o.x - ow/2 + dw/2, Math.min(o.x + ow/2 - dw/2, dragged.x))
    cands.push({ x: o.x + ow/2 + dw/2, y: cy })  // right
    cands.push({ x: o.x - ow/2 - dw/2, y: cy })  // left
    cands.push({ x: cx, y: o.y + oh/2 + dh/2 })  // below
    cands.push({ x: cx, y: o.y - oh/2 - dh/2 })  // above
    // Center-aligned fallback for each side
    cands.push({ x: o.x + ow/2 + dw/2, y: o.y })
    cands.push({ x: o.x - ow/2 - dw/2, y: o.y })
    cands.push({ x: o.x, y: o.y + oh/2 + dh/2 })
    cands.push({ x: o.x, y: o.y - oh/2 - dh/2 })
  }
  cands.sort((a, b) => (a.x - dragged.x) ** 2 + (a.y - dragged.y) ** 2 - ((b.x - dragged.x) ** 2 + (b.y - dragged.y) ** 2))
  for (const c of cands) {
    const test = { ...dragged, x: c.x, y: c.y }
    if (!hasOverlapWithOthers(test, others)) return test
  }
  // Fallback: place above the nearest tile
  const nearest = others.reduce((a, b) => (a.x - dragged.x) ** 2 + (a.y - dragged.y) ** 2 < (b.x - dragged.x) ** 2 + (b.y - dragged.y) ** 2 ? a : b)
  return { ...dragged, x: nearest.x, y: nearest.y - nearest.h/2 - dh/2 }
}

// On a 16:9 canvas, equal % of width and height gives a 16:9 pixel tile.
// canvasH = canvasW * 9/16, so h% of canvasH = h/100 * canvasW * 9/16.
// For 16:9 tile: pixelW/pixelH = (w * canvasW) / (h * canvasH) = (w/h) * (16/9) = 16/9 → w = h.
function enforce16x9(positions) {
  return positions.map(p => ({ ...p, h: p.w }))
}

// Recenter the group and uniformly scale so its bounding box fills FILL_PCT.
function normalizeToCanvas(positions) {
  if (positions.length === 0) return positions
  positions = enforce16x9(positions)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of positions) {
    if (p.x - p.w/2 < minX) minX = p.x - p.w/2
    if (p.x + p.w/2 > maxX) maxX = p.x + p.w/2
    if (p.y - p.h/2 < minY) minY = p.y - p.h/2
    if (p.y + p.h/2 > maxY) maxY = p.y + p.h/2
  }
  const bw = maxX - minX, bh = maxY - minY
  const scale = Math.min(FILL_PCT / bw, FILL_PCT / bh)
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  return positions.map(p => ({
    ...p,
    x: 50 + (p.x - cx) * scale,
    y: 50 + (p.y - cy) * scale,
    w: p.w * scale,
    h: p.h * scale,
  }))
}

// After resizing `resized`, push neighbors that were flush against `prev` to stay flush.
function pushNeighborsAfterResize(resized, others, prevResized) {
  const TOUCH = 1.5 // % gap threshold to count as "was touching"
  return others.map(o => {
    const wasRight = Math.abs((prevResized.x + prevResized.w/2) - (o.x - o.w/2)) < TOUCH
    const wasLeft  = Math.abs((prevResized.x - prevResized.w/2) - (o.x + o.w/2)) < TOUCH
    const wasBelow = Math.abs((prevResized.y + prevResized.h/2) - (o.y - o.h/2)) < TOUCH
    const wasAbove = Math.abs((prevResized.y - prevResized.h/2) - (o.y + o.h/2)) < TOUCH
    if (wasRight) return { ...o, x: resized.x + resized.w/2 + o.w/2 }
    if (wasLeft)  return { ...o, x: resized.x - resized.w/2 - o.w/2 }
    if (wasBelow) return { ...o, y: resized.y + resized.h/2 + o.h/2 }
    if (wasAbove) return { ...o, y: resized.y - resized.h/2 - o.h/2 }
    return o
  })
}


// Append a new device adjacent to the existing group (or centered if first).
function appendDevice(positions, deviceId) {
  if (positions.length === 0) {
    return normalizeToCanvas([{ deviceId, x: 50, y: 50, w: DEFAULT_W, h: DEFAULT_H }])
  }
  // Place to the right of the rightmost tile, then normalize.
  const rightmost = positions.reduce((a, b) => (a.x + a.w/2 > b.x + b.w/2 ? a : b))
  const avgW = positions.reduce((s, p) => s + p.w, 0) / positions.length
  const avgH = positions.reduce((s, p) => s + p.h, 0) / positions.length
  const fresh = { deviceId, x: rightmost.x + rightmost.w/2 + avgW/2, y: rightmost.y, w: avgW, h: avgH }
  return normalizeToCanvas([...positions, fresh])
}

function CanvasEditor({ layout, devices, onSetPosition, onReplacePositions, onRemoveDevice }) {
  const canvasRef = useRef(null)
  const [dragging, setDragging] = useState(null)
  const withDefaults = (ps) => enforce16x9((ps ?? []).map(p => ({ ...p, w: p.w ?? DEFAULT_W, h: p.h ?? DEFAULT_H })))
  const [localPositions, setLocalPositions] = useState(() => withDefaults(layout.positions))

  const devMap = new Map(devices.map(d => [d.id, d]))

  useEffect(() => {
    setLocalPositions(withDefaults(layout.positions))
  }, [layout.id, layout.positions])

  function getCanvas(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      px: e.clientX - rect.left,
      py: e.clientY - rect.top,
      x: Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width  * 100)),
      y: Math.max(0, Math.min(100, (e.clientY - rect.top)  / rect.height * 100)),
      canvasW: rect.width,
      canvasH: rect.height,
    }
  }

  function onMouseDownMove(e, deviceId) {
    e.preventDefault()
    const pos = localPositions.find(p => p.deviceId === deviceId)
    const { x, y } = getCanvas(e)
    setDragging({ deviceId, mode: 'move', startX: x, startY: y, origX: pos?.x ?? 50, origY: pos?.y ?? 50 })
  }

  function onMouseDownResize(e, deviceId) {
    e.preventDefault()
    e.stopPropagation()
    const pos = localPositions.find(p => p.deviceId === deviceId)
    const { px, py } = getCanvas(e)
    setDragging({ deviceId, mode: 'resize', startPx: px, startPy: py, origW: pos?.w ?? DEFAULT_W, origH: pos?.h ?? DEFAULT_H })
  }

  const onMouseMove = useCallback((e) => {
    if (!dragging) return
    const { x, y, px, py, canvasW, canvasH } = getCanvas(e)
    setLocalPositions(prev => {
      const pos = prev.find(p => p.deviceId === dragging.deviceId)
      if (!pos) return prev
      const rest = prev.filter(p => p.deviceId !== dragging.deviceId)
      if (dragging.mode === 'move') {
        return [...rest, { ...pos, x: Math.max(0, Math.min(100, dragging.origX + (x - dragging.startX))), y: Math.max(0, Math.min(100, dragging.origY + (y - dragging.startY))) }]
      } else {
        const nw = Math.max(5, dragging.origW + (px - dragging.startPx) / canvasW * 100)
        return [...rest, { ...pos, w: nw, h: nw }]
      }
    })
  }, [dragging])

  const onMouseUp = useCallback((e) => {
    if (!dragging) return
    const { x, y, px, py, canvasW } = getCanvas(e)
    setLocalPositions(prev => {
      const pos = prev.find(p => p.deviceId === dragging.deviceId)
      if (!pos) return prev
      const others = prev.filter(p => p.deviceId !== dragging.deviceId)
      let updated
      if (dragging.mode === 'move') {
        updated = { ...pos, x: dragging.origX + (x - dragging.startX), y: dragging.origY + (y - dragging.startY) }
      } else {
        const nw = Math.max(5, dragging.origW + (px - dragging.startPx) / canvasW * 100)
        updated = { ...pos, w: nw, h: nw }
      }
      let resolvedOthers = others
      if (dragging.mode === 'resize') {
        resolvedOthers = pushNeighborsAfterResize(updated, others, pos)
      }
      const snapped = (dragging.mode === 'move' && others.length > 0) ? snapAdjacent(updated, resolvedOthers) : updated
      const final = normalizeToCanvas([...resolvedOthers, snapped])
      onReplacePositions(layout.id, final)
      return final
    })
    setDragging(null)
  }, [dragging, layout.id, onReplacePositions])

  const layoutDeviceIds = new Set(localPositions.map(p => p.deviceId))
  const unpositioned = devices.filter(d => !layoutDeviceIds.has(d.id))

  function addDevice(deviceId) {
    onReplacePositions(layout.id, appendDevice(localPositions, deviceId))
  }

  return (
    <div className="space-y-5">
      <h3 className="text-twitch-text font-medium">{layout.name}</h3>

      <div
        ref={canvasRef}
        className="relative w-full bg-[#0e0e10] border border-twitch-border rounded-lg overflow-hidden select-none"
        style={{ aspectRatio: '16 / 9' }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {localPositions.map(pos => {
          const device = devMap.get(pos.deviceId)
          if (!device) return null
          const w = pos.w ?? DEFAULT_W
          const h = pos.h ?? DEFAULT_H
          return (
            <div
              key={pos.deviceId}
              onMouseDown={e => onMouseDownMove(e, pos.deviceId)}
              className="absolute flex items-center justify-center bg-twitch-surface border-2 border-twitch-border hover:border-twitch-purple rounded-lg cursor-grab active:cursor-grabbing text-center"
              style={{ left: pos.x + '%', top: pos.y + '%', width: w + '%', height: h + '%', transform: 'translate(-50%, -50%)' }}
            >
              <span className="text-twitch-text text-xs font-medium leading-tight px-2 truncate max-w-full">{device.name}</span>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => onRemoveDevice(layout.id, pos.deviceId)}
                className="absolute top-1 right-1 text-twitch-muted hover:text-red-400 p-0.5 rounded"
              >
                <X size={10} />
              </button>
              <div
                onMouseDown={e => onMouseDownResize(e, pos.deviceId)}
                className="absolute bottom-1 right-1 w-3 h-3 cursor-se-resize opacity-30 hover:opacity-80 transition-opacity"
                style={{ backgroundImage: 'radial-gradient(circle, #adadb8 1.2px, transparent 1.2px)', backgroundSize: '3px 3px' }}
              />
            </div>
          )
        })}
        {localPositions.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-twitch-muted text-sm pointer-events-none">
            Add devices below to place them on the canvas
          </div>
        )}
      </div>

      {unpositioned.length > 0 && (
        <div className="space-y-2">
          <p className="text-twitch-muted text-xs">Add to layout:</p>
          <div className="flex flex-wrap gap-2">
            {unpositioned.map(d => (
              <button
                key={d.id}
                onClick={() => addDevice(d.id)}
                className="flex items-center gap-1.5 bg-twitch-surface border border-twitch-border hover:border-twitch-purple text-twitch-text text-xs px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={11} /> {d.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ShinyLayouts() {
  const navigate = useNavigate()
  const [layouts, setLayouts]           = useState([])
  const [devices, setDevices]           = useState([])
  const [obsScenes, setObsScenes]       = useState([])
  const [currentScene, setCurrentScene] = useState(null)
  const [selected, setSelected]         = useState(null)
  const [newScene, setNewScene]         = useState('')

  async function load() {
    const [lRes, dRes, wRes, sRes] = await Promise.all([
      window.api.shiny.layouts.list(),
      window.api.shiny.devices.list(),
      window.api.settings.get('shinyWizardComplete'),
      window.api.obs.getScenes()
    ])
    if (!wRes.ok || !wRes.data) { navigate('/shiny/setup'); return }
    if (lRes.ok) setLayouts(lRes.data)
    if (dRes.ok) setDevices(dRes.data)
    if (sRes.ok) {
      const scenes = sRes.data.scenes ?? []
      setObsScenes(scenes)
      setCurrentScene(sRes.data.currentScene ?? null)
      setNewScene(scenes[0] ?? '')
    }
  }

  useEffect(() => {
    load()
    window.api.obs.onSceneChanged(s => setCurrentScene(s))
  }, [])

  const activeLayoutId  = layouts.find(l => l.triggerScenes?.includes(currentScene))?.id ?? 'base'
  const claimedScenes   = new Set(layouts.flatMap(l => l.triggerScenes ?? []))
  const availableScenes = obsScenes.filter(s => !claimedScenes.has(s))

  async function create() {
    if (!newScene) return
    const res = await window.api.shiny.layouts.create({ name: newScene, triggerScenes: [newScene] })
    if (res.ok) {
      setLayouts(l => [...l, res.data])
      setSelected(res.data.id)
      setNewScene(availableScenes.filter(s => s !== newScene)[0] ?? '')
    }
  }

  async function remove(id) {
    await window.api.shiny.layouts.remove(id)
    setLayouts(l => l.filter(x => x.id !== id))
    if (selected === id) setSelected(null)
  }

  async function setPosition(layoutId, deviceId, x, y, w, h) {
    const res = await window.api.shiny.layouts.setPosition(layoutId, deviceId, x, y, w, h)
    if (res.ok) setLayouts(l => l.map(x => x.id === layoutId ? res.data : x))
  }

  async function replacePositions(layoutId, positions) {
    const res = await window.api.shiny.layouts.replacePositions(layoutId, positions)
    if (res.ok) setLayouts(l => l.map(x => x.id === layoutId ? res.data : x))
  }

  async function removeDevice(layoutId, deviceId) {
    const res = await window.api.shiny.layouts.removeDevice(layoutId, deviceId)
    if (res.ok) setLayouts(l => l.map(x => x.id === layoutId ? res.data : x))
  }

  const selectedLayout = layouts.find(l => l.id === selected) ?? null

  return (
    <div className="p-6 flex gap-6 h-full">
      <div className="w-56 shrink-0 space-y-3">
        <h1 className="text-twitch-text text-xl font-semibold">Layouts</h1>

        <div className="space-y-1">
          {layouts.length === 0 && <p className="text-twitch-muted text-xs py-4 text-center">No layouts yet.</p>}
          {layouts.map(l => (
            <div
              key={l.id}
              onClick={() => setSelected(l.id)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                selected === l.id ? 'bg-twitch-surface text-twitch-text' : 'text-twitch-muted hover:bg-twitch-surface hover:text-twitch-text'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeLayoutId === l.id ? 'bg-green-400' : 'bg-transparent border border-twitch-border'}`} />
                <span className="text-sm truncate">{l.name}</span>
                {l.id === 'base' && <span className="text-[10px] text-twitch-purple border border-twitch-purple/40 rounded px-1 shrink-0">default</span>}
              </div>
              {l.id !== 'base' && (
                <button onClick={e => { e.stopPropagation(); remove(l.id) }} className="p-1 text-twitch-muted hover:text-red-400 rounded ml-1 shrink-0">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-twitch-border pt-3 space-y-2">
          {availableScenes.length > 0 ? (
            <>
              <select
                value={newScene}
                onChange={e => setNewScene(e.target.value)}
                className="w-full bg-twitch-surface border border-twitch-border rounded px-3 py-2 text-twitch-text text-sm outline-none focus:border-twitch-purple"
              >
                {availableScenes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                onClick={create}
                disabled={!newScene}
                className="w-full flex items-center justify-center gap-1.5 bg-twitch-purple hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
              >
                <Plus size={14} /> Create Layout
              </button>
            </>
          ) : (
            <p className="text-twitch-muted text-xs text-center py-2">
              {obsScenes.length === 0 ? 'OBS not connected.' : 'All scenes have layouts.'}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 bg-twitch-mid border border-twitch-border rounded-xl p-5 overflow-auto">
        {!selectedLayout
          ? <div className="flex items-center justify-center h-full text-twitch-muted text-sm">Select or create a layout to edit it.</div>
          : <CanvasEditor
              layout={selectedLayout}
              devices={devices}
              onSetPosition={setPosition}
              onReplacePositions={replacePositions}
              onRemoveDevice={removeDevice}
            />
        }
      </div>
    </div>
  )
}
