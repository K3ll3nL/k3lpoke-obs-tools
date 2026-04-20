import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { app as electronApp } from 'electron'
import { getClipVideoUrl } from './twitch.js'
import { getClipsByStatus, getClipById, getSetting, getCollections, getPlaybackConfig } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const PORT = 3000
const app = express()
const httpServer = createServer(app)
const wss = new WebSocketServer({ server: httpServer })

app.use(cors())
app.use(express.json())

// Overlay path: dev = src/overlay, prod = resources/overlay (via extraResources)
const overlayDir = electronApp.isPackaged
  ? path.join(process.resourcesPath, 'overlay')
  : path.join(__dirname, '../../src/overlay')

app.use('/overlay', express.static(overlayDir))

// Serve built renderer in production so Twitch embed parent=localhost works
if (electronApp.isPackaged) {
  const rendererDir = path.join(__dirname, '../renderer')
  app.use('/', express.static(rendererDir))
}

// Approved clip queue — overlay fetches this on load
app.get('/api/queue', (req, res) => {
  res.json({ clips: getClipsByStatus('approved') })
})

// Playback config + resolved collection clips — overlay fetches on load and on config change
app.get('/api/playback-config', (req, res) => {
  const cfg = getPlaybackConfig()
  const approved = getClipsByStatus('approved')
  const approvedMap = new Map(approved.map(c => [c.id, c]))
  const namedCollections = getCollections().map(col => ({
    id: col.id,
    name: col.name,
    color: col.color,
    clips: col.clipIds.map(id => approvedMap.get(id)).filter(Boolean)
  }))
  res.json({ ...cfg, collections: [{ id: 'main', name: 'Main Queue', clips: approved }, ...namedCollections] })
})

// Signed video URL for a clip — overlay fetches per-clip before playing
app.get('/api/clip-url/:id', async (req, res) => {
  try {
    const url = await getClipVideoUrl(req.params.id)
    res.json({ url })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Twitch OAuth implicit-flow callback page
app.get('/auth/callback', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head><title>Authenticating...</title></head>
<body style="background:#0e0e10;color:#efeff1;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px">
  <h2 style="color:#9146FF">Connecting to Twitch...</h2>
  <p style="color:#adadb8">You can close this window.</p>
</body>
</html>`)
})

// ── WebSocket broadcasting ──────────────────────────────────────────────────

const overlayClients = new Set()
let mainWindowRef = null
let storedOverlayConfig = null

export function setMainWindow(win) { mainWindowRef = win }

wss.on('connection', (ws) => {
  overlayClients.add(ws)
  ws.on('close', () => overlayClients.delete(ws))
  ws.on('error', () => overlayClients.delete(ws))
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'now-playing' && msg.clipId) {
        const clip = getClipById(msg.clipId)
        playerState = { playing: true, currentClip: clip }
        nextClipState = null
        if (mainWindowRef) mainWindowRef.webContents.send('player:now-playing', clip)
        if (mainWindowRef) mainWindowRef.webContents.send('player:next-clip', null)
      }
      if (msg.type === 'next-preloaded') {
        nextClipState = msg.clip ?? null
        if (mainWindowRef) mainWindowRef.webContents.send('player:next-clip', msg.clip ?? null)
      }
    } catch {}
  })
  // Send stored config so overlay gets correct settings immediately on (re)connect
  const cfg = storedOverlayConfig ?? getSetting('overlayConfig')
  if (cfg) ws.send(JSON.stringify({ type: 'config', config: cfg }))
  ws.send(JSON.stringify({ type: 'hello' }))
})

export function broadcastToOverlay(message) {
  const payload = JSON.stringify(message)
  for (const ws of overlayClients) {
    if (ws.readyState === 1) ws.send(payload)
  }
}

// ── Player state ────────────────────────────────────────────────────────────

let playerState = { playing: false, currentClip: null }
let nextClipState = null

export function getPlayerState() { return playerState }
export function getNextClipState() { return nextClipState }
export function broadcastSkipNext() {
  nextClipState = null
  broadcastToOverlay({ type: 'skip-next' })
}

export function playClip(clip) {
  playerState = { playing: true, currentClip: clip }
  broadcastToOverlay({ type: 'play', clip })
}

export function stopPlayer() {
  playerState = { playing: false, currentClip: null }
  broadcastToOverlay({ type: 'stop' })
}

export function sendOverlayConfig(config) {
  storedOverlayConfig = config
  broadcastToOverlay({ type: 'config', config })
}

export function notifyQueueUpdated() {
  broadcastToOverlay({ type: 'queue-updated' })
}

export function broadcastVolumeChange(clipId, volume) {
  broadcastToOverlay({ type: 'volume-update', clipId, volume })
}

export function broadcastPlaybackConfigUpdated() {
  broadcastToOverlay({ type: 'playback-config-updated' })
}

export function broadcastCollectionsUpdated() {
  broadcastToOverlay({ type: 'collections-updated' })
}

// ── Start server ────────────────────────────────────────────────────────────

export function startServer() {
  return new Promise((resolve) => {
    httpServer.listen(PORT, '127.0.0.1', () => resolve(PORT))
  })
}

export function getOverlayUrl() {
  return `http://localhost:${PORT}/overlay/index.html`
}
