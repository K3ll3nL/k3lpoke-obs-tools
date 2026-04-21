import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let dbPath
let data = { clips: [], channels: [], settings: {}, collections: [], playbackConfig: null }

export function initDb() {
  dbPath = path.join(app.getPath('userData'), 'clipqueue.json')
  if (fs.existsSync(dbPath)) {
    try { data = JSON.parse(fs.readFileSync(dbPath, 'utf8')) } catch {}
  }
  data.clips         ??= []
  data.channels      ??= []
  data.settings      ??= {}
  data.collections   ??= []
  data.playbackConfig ??= { mode: 'single', activeCollectionId: 'main', weightedSets: [] }

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
