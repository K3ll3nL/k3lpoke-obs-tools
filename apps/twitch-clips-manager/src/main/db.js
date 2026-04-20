import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let dbPath
let data = { clips: [], channels: [], settings: {} }

export function initDb() {
  dbPath = path.join(app.getPath('userData'), 'clipqueue.json')
  if (fs.existsSync(dbPath)) {
    try { data = JSON.parse(fs.readFileSync(dbPath, 'utf8')) } catch {}
  }
  data.clips    ??= []
  data.channels ??= []
  data.settings ??= {}
}

function save() {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2))
}

// ── Clips ──────────────────────────────────────────────────────────────────

export function upsertClip(clip) {
  if (data.clips.find(c => c.id === clip.id)) return
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
  }
  save()
}

export function bulkSetStatus(ids, status) {
  for (const id of ids) setClipStatus(id, status)
}

export function removeClip(id) {
  data.clips = data.clips.filter(c => c.id !== id)
  save()
}

export function reorderQueue(orderedIds) {
  orderedIds.forEach((id, i) => {
    const clip = data.clips.find(c => c.id === id)
    if (clip) clip.queue_position = i + 1
  })
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
