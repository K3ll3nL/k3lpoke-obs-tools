import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let dbPath
let data = { clips: [], channels: [], settings: {}, collections: [], playbackConfig: null, shinyDevices: [], shinyLayouts: [], shinyActiveLayoutId: null }

// w and h stored as % of canvas width/height (0–100). For a 16:9 canvas, equal w/h % gives 16:9 tiles.
function computeDefaultPositions(deviceIds) {
  const n = deviceIds.length
  if (n === 0) return []
  const MAX_COLS = 4
  const cols = Math.min(n, MAX_COLS)
  const rows = Math.ceil(n / MAX_COLS)
  const wPct = 90 / cols
  const hPct = 80 / rows
  const leftMargin = (100 - cols * wPct) / 2
  const topMargin  = (100 - rows * hPct) / 2
  return deviceIds.map((id, i) => ({
    deviceId: id,
    x: leftMargin + (i % cols + 0.5) * wPct,
    y: topMargin  + (Math.floor(i / cols) + 0.5) * hPct,
    w: wPct,
    h: hPct,
  }))
}

export function initDb() {
  dbPath = path.join(app.getPath('userData'), 'clipqueue.json')
  if (fs.existsSync(dbPath)) {
    try { data = JSON.parse(fs.readFileSync(dbPath, 'utf8')) } catch {}
  }
  data.clips         ??= []
  data.channels      ??= []
  data.settings      ??= {}
  data.collections   ??= []
  data.playbackConfig      ??= { mode: 'single', activeCollectionId: 'main', weightedSets: [] }
  data.shinyDevices        ??= []
  data.shinyLayouts        ??= []
  data.shinyActiveLayoutId ??= null

  // Ensure base layout exists and uses %-based positions
  const base = data.shinyLayouts.find(l => l.id === 'base')
  if (!base) {
    data.shinyLayouts.unshift({ id: 'base', name: 'All Devices', triggerScenes: [], positions: computeDefaultPositions(data.shinyDevices.map(d => d.id)) })
    save()
  } else {
    // Migrate any old pixel-based positions (w >= 10 means px, not %)
    if (base.positions?.some(p => (p.w ?? 0) >= 10)) {
      base.positions = computeDefaultPositions(data.shinyDevices.map(d => d.id))
      save()
    }
  }
  // Migrate pixel positions in custom layouts
  let migrated = false
  for (const layout of data.shinyLayouts) {
    if (layout.id === 'base') continue
    if (layout.positions?.some(p => (p.w ?? 0) >= 10)) {
      layout.positions = layout.positions.map(p => ({ ...p, w: Math.min((p.w ?? 140) / 6, 40), h: Math.min((p.h ?? 78) / 3.375, 40) }))
      migrated = true
    }
  }
  if (migrated) save()

  // Remove clipIds that no longer exist in data.clips
  const knownIds = new Set(data.clips.map(c => c.id))
  let dirty = false
  for (const col of data.collections) {
    const before = col.clipIds.length
    col.clipIds = col.clipIds.filter(id => knownIds.has(id))
    if (col.clipIds.length !== before) dirty = true
  }
  if (dirty) save()
}

function save() {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2))
}

// ── Clips ──────────────────────────────────────────────────────────────────

export function upsertClip(clip) {
  const existing = data.clips.find(c => c.id === clip.id)
  if (existing) {
    if (clip.game_name !== undefined) existing.game_name = clip.game_name
    if (clip.view_count !== undefined) existing.view_count = clip.view_count
    save()
    return
  }
  data.clips.push({ ...clip, status: 'pending', queue_position: null, added_at: new Date().toISOString(), volume: 1.0 })
  save()
}

export function getClipById(id) {
  return data.clips.find(c => c.id === id) ?? null
}

export function setClipVolume(id, volume) {
  const clip = data.clips.find(c => c.id === id)
  if (clip) { clip.volume = Math.max(0, Math.min(2, Number(volume))); save() }
}

export function setClipTrim(id, trimStart, trimEnd) {
  const clip = data.clips.find(c => c.id === id)
  if (clip) {
    clip.trim_start = trimStart != null ? Math.max(0, Number(trimStart)) : null
    clip.trim_end   = trimEnd   != null ? Math.max(0, Number(trimEnd))   : null
    save()
  }
}

export function setClipEnvelope(id, envelope) {
  const clip = data.clips.find(c => c.id === id)
  if (clip) {
    clip.envelope = envelope && envelope.length > 0 ? envelope : null
    save()
  }
}

export function clipExists(id) {
  return !!data.clips.find(c => c.id === id)
}

export function getNewClips(since) {
  const clips = since
    ? data.clips.filter(c => new Date(c.created_at) > new Date(since))
    : data.clips
  return [...clips].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export function getAllClips(broadcasterName) {
  let clips = data.clips
  if (broadcasterName) {
    const name = broadcasterName.toLowerCase()
    clips = clips.filter(c => c.broadcaster_name?.toLowerCase() === name)
  }
  return [...clips].sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
}

export function getClipsByStatus(status) {
  return data.clips
    .filter(c => c.status === status)
    .sort((a, b) => {
      if (a.queue_position != null && b.queue_position != null) return a.queue_position - b.queue_position
      return new Date(a.added_at) - new Date(b.added_at)
    })
}

export function setClipStatus(id, status) {
  const clip = data.clips.find(c => c.id === id)
  if (!clip) return
  clip.status = status
  if (status === 'approved') {
    const maxPos = Math.max(0, ...data.clips.filter(c => c.status === 'approved').map(c => c.queue_position ?? 0))
    clip.queue_position = maxPos + 1
  } else {
    clip.queue_position = null
  }
  save()
}

export function bulkSetStatus(ids, status) {
  for (const id of ids) setClipStatus(id, status)
}

export function removeClip(id) {
  data.clips = data.clips.filter(c => c.id !== id)
  for (const col of data.collections) {
    col.clipIds = col.clipIds.filter(cid => cid !== id)
  }
  save()
}

export function reorderQueue(orderedIds) {
  orderedIds.forEach((id, i) => {
    const clip = data.clips.find(c => c.id === id)
    if (clip) clip.queue_position = i + 1
  })
  save()
}

// ── Collections ───────────────────────────────────────────────────────────

export function getCollections() {
  return [...data.collections]
}

export function createCollection({ name, color }) {
  const id = `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const col = { id, name, color: color ?? '#9146ff', clipIds: [] }
  data.collections.push(col)
  save()
  return col
}

export function updateCollection(id, updates) {
  const col = data.collections.find(c => c.id === id)
  if (!col) return null
  if (updates.name  !== undefined) col.name  = updates.name
  if (updates.color !== undefined) col.color = updates.color
  save()
  return { ...col }
}

export function deleteCollection(id) {
  data.collections = data.collections.filter(c => c.id !== id)
  if (data.playbackConfig.activeCollectionId === id) data.playbackConfig.activeCollectionId = 'main'
  data.playbackConfig.weightedSets = (data.playbackConfig.weightedSets || []).filter(s => s.collectionId !== id)
  save()
}

export function addClipToCollection(collectionId, clipId) {
  const col = data.collections.find(c => c.id === collectionId)
  if (!col || col.clipIds.includes(clipId)) return
  col.clipIds.push(clipId)
  save()
}

export function removeClipFromCollection(collectionId, clipId) {
  const col = data.collections.find(c => c.id === collectionId)
  if (!col) return
  col.clipIds = col.clipIds.filter(id => id !== clipId)
  save()
}

export function getCollectionClips(collectionId) {
  const col = data.collections.find(c => c.id === collectionId)
  if (!col) return []
  const approvedMap = new Map(data.clips.filter(c => c.status === 'approved').map(c => [c.id, c]))
  return col.clipIds.map(id => approvedMap.get(id)).filter(Boolean)
}

export function getCollectionMemberships(clipId) {
  return data.collections.filter(c => c.clipIds.includes(clipId)).map(c => c.id)
}

// ── Playback config ────────────────────────────────────────────────────────

export function getPlaybackConfig() {
  return { ...data.playbackConfig }
}

export function setPlaybackConfig(config) {
  data.playbackConfig = { ...data.playbackConfig, ...config }
  save()
}

// ── Channels ───────────────────────────────────────────────────────────────

export function getChannels() {
  return [...data.channels].sort((a, b) => b.is_own - a.is_own || a.name.localeCompare(b.name))
}

export function upsertChannel(channel) {
  const existing = data.channels.find(c => c.name === channel.name)
  if (existing) {
    Object.assign(existing, channel)
  } else {
    data.channels.push({ enabled: 1, last_cursor: null, last_fetched: null, ...channel })
  }
  save()
}

export function removeChannel(name) {
  data.channels = data.channels.filter(c => c.name !== name)
  save()
}

export function updateChannelCursor(name, cursor) {
  const ch = data.channels.find(c => c.name === name)
  if (ch) {
    ch.last_cursor = cursor
    ch.last_fetched = new Date().toISOString()
    save()
  }
}

// ── Settings ──────────────────────────────────────────────────────────────

export function getSetting(key) {
  return data.settings[key] ?? null
}

export function setSetting(key, value) {
  data.settings[key] = value
  save()
}

export function getAllSettings() {
  return { ...data.settings }
}

// ── Shiny Hunt: Devices ───────────────────────────────────────────────────

export function getShinyDevices() { return [...data.shinyDevices] }

export function addShinyDevice({ name, obsSourceName }) {
  const id = `sdev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const device = { id, name, obsSourceName }
  data.shinyDevices.push(device)
  const base = data.shinyLayouts.find(l => l.id === 'base')
  if (base) {
    const allIds = [...base.positions.map(p => p.deviceId), id]
    base.positions = computeDefaultPositions(allIds)
  }
  save()
  return device
}

export function updateShinyDevice(id, changes) {
  const dev = data.shinyDevices.find(d => d.id === id)
  if (!dev) return null
  if (changes.name          !== undefined) dev.name          = changes.name
  if (changes.obsSourceName !== undefined) dev.obsSourceName = changes.obsSourceName
  save()
  return { ...dev }
}

export function removeShinyDevice(id) {
  data.shinyDevices = data.shinyDevices.filter(d => d.id !== id)
  for (const layout of data.shinyLayouts) {
    layout.positions = (layout.positions ?? []).filter(p => p.deviceId !== id)
  }
  save()
}

// ── Shiny Hunt: Layouts ───────────────────────────────────────────────────
// Each layout has a triggerScenes[] — the dock auto-selects the layout whose
// triggerScenes includes the current OBS scene.

export function getShinyLayouts() { return [...data.shinyLayouts] }

export function createShinyLayout({ name, triggerScenes }) {
  const id = `slayout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const layout = { id, name, triggerScenes: triggerScenes ?? [], positions: [] }
  data.shinyLayouts.push(layout)
  save()
  return layout
}

export function updateShinyLayout(id, changes) {
  const layout = data.shinyLayouts.find(l => l.id === id)
  if (!layout) return null
  if (changes.name          !== undefined) layout.name          = changes.name
  if (changes.triggerScenes !== undefined) layout.triggerScenes = changes.triggerScenes
  save()
  return { ...layout }
}

// x and y are 0–100 (percentage of canvas). Upserts the device's position.
export function setShinyLayoutPosition(layoutId, deviceId, x, y, w, h) {
  const layout = data.shinyLayouts.find(l => l.id === layoutId)
  if (!layout) return null
  layout.positions ??= []
  const existing = layout.positions.find(p => p.deviceId === deviceId)
  if (existing) {
    existing.x = x; existing.y = y
    if (w !== undefined) existing.w = w
    if (h !== undefined) existing.h = h
  }
  else layout.positions.push({ deviceId, x, y, w: w ?? 45, h: h ?? 45 })
  save()
  return { ...layout, positions: [...layout.positions] }
}

export function removeDeviceFromShinyLayout(layoutId, deviceId) {
  const layout = data.shinyLayouts.find(l => l.id === layoutId)
  if (!layout) return null
  layout.positions = (layout.positions ?? []).filter(p => p.deviceId !== deviceId)
  save()
  return { ...layout, positions: [...layout.positions] }
}

export function replaceShinyLayoutPositions(layoutId, positions) {
  const layout = data.shinyLayouts.find(l => l.id === layoutId)
  if (!layout) return null
  layout.positions = positions
  save()
  return { ...layout, positions: [...layout.positions] }
}

export function removeShinyLayout(id) {
  if (id === 'base') return
  data.shinyLayouts = data.shinyLayouts.filter(l => l.id !== id)
  if (data.shinyActiveLayoutId === id) data.shinyActiveLayoutId = null
  save()
}

export function setActiveShinyLayout(id) {
  data.shinyActiveLayoutId = id
  save()
}

export function getActiveShinyLayoutId() { return data.shinyActiveLayoutId }

function resolveLayout(layout) {
  const devMap = new Map(data.shinyDevices.map(d => [d.id, d]))
  return {
    ...layout,
    positions: (layout.positions ?? []).map(p => ({ ...p, device: devMap.get(p.deviceId) ?? null }))
  }
}

// Returns the layout whose triggerScenes includes sceneName, falling back to
// the active layout, falling back to null.
export function getShinyLayoutForScene(sceneName) {
  if (sceneName) {
    const match = data.shinyLayouts.find(l => l.triggerScenes?.includes(sceneName))
    if (match) return resolveLayout(match)
  }
  if (data.shinyActiveLayoutId) {
    const active = data.shinyLayouts.find(l => l.id === data.shinyActiveLayoutId)
    if (active) return resolveLayout(active)
  }
  const base = data.shinyLayouts.find(l => l.id === 'base')
  return base ? resolveLayout(base) : null
}

export function getActiveShinyLayout() {
  return getShinyLayoutForScene(null)
}
