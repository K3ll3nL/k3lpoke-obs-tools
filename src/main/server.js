import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import cors from 'cors'
import path from 'path'
import axios from 'axios'
import { fileURLToPath } from 'url'
import { app as electronApp } from 'electron'
import { getClipVideoUrl, receiveAuthToken, fetchCurrentStream, getTwitchState } from './twitch.js'
import { getClipsByStatus, getClipById, getSetting, getCollections, getPlaybackConfig, getShinyLayoutForScene, getShinyDevices, resolveDeviceShinyScene } from './db.js'
import { showDeviceInScene } from './obs.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const PORT = 1102
const app = express()
const httpServer = createServer(app)
httpServer.setMaxListeners(0) // Unlimited; many WebSocket connections add error listeners
const wss = new WebSocketServer({ server: httpServer })

app.use(cors())
app.use(express.json())

// Overlay path: dev = src/overlay, prod = resources/overlay (via extraResources)
const overlayDir = electronApp.isPackaged
  ? path.join(process.resourcesPath, 'overlay')
  : path.join(__dirname, '../../src/overlay')

app.use('/overlay', express.static(overlayDir))

const dockDir = electronApp.isPackaged
  ? path.join(process.resourcesPath, 'dock')
  : path.join(__dirname, '../../src/dock')
app.use('/dock', express.static(dockDir))

const playerDir = electronApp.isPackaged
  ? path.join(process.resourcesPath, 'player')
  : path.join(__dirname, '../../src/player')
app.use('/player', express.static(playerDir))

app.get('/api/shiny/state', (req, res) => {
  res.json({ layout: getShinyLayoutForScene(shinyCurrentScene), currentScene: shinyCurrentScene, currentDeviceId: shinyCurrentDeviceId })
})

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

app.get('/api/current-game', async (req, res) => {
  try {
    const { user } = getTwitchState()
    if (!user?.login) return res.json({ game: null })
    const { gameCategory } = await fetchCurrentStream(user.login)
    res.json({ game: gameCategory })
  } catch {
    res.json({ game: null })
  }
})

app.get('/api/current-stream', async (req, res) => {
  try {
    const { user } = getTwitchState()
    if (!user?.login) return res.json({ game: null, title: null })
    const { gameCategory, title } = await fetchCurrentStream(user.login)
    res.json({ game: gameCategory ?? null, title: title ?? null })
  } catch {
    res.json({ game: null, title: null })
  }
})

// Thumbnail proxy — fetches from Twitch CDN and serves locally
app.get('/api/thumbnail/:id', async (req, res) => {
  try {
    const clip = getClipById(req.params.id)
    if (!clip || !clip.thumbnail_url) {
      return res.status(404).json({ error: 'Thumbnail not found' })
    }
    const response = await axios.get(clip.thumbnail_url, { responseType: 'arraybuffer', timeout: 5000 })
    res.type('image/jpeg').send(response.data)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch thumbnail' })
  }
})

// Twitch OAuth implicit-flow callback page — extracts hash token and POSTs it to /auth/token
app.get('/auth/callback', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head><title>Authenticating...</title></head>
<body style="background:#0e0e10;color:#efeff1;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px">
  <h2 id="msg" style="color:#9146FF">Connecting to Twitch...</h2>
  <p style="color:#adadb8">You can close this window.</p>
  <script>
    const hashParams = new URLSearchParams(location.hash.slice(1));
    const token = hashParams.get('access_token');
    const state = hashParams.get('state') || 'main';
    if (token) {
      fetch('/auth/token?access_token=' + encodeURIComponent(token) + '&state=' + encodeURIComponent(state))
        .then(() => { document.getElementById('msg').textContent = state === 'bot' ? 'Bot account connected! You can close this window.' : 'Connected! You can close this window.' })
        .catch(() => { document.getElementById('msg').textContent = 'Error — please try again.' })
    } else {
      document.getElementById('msg').textContent = 'No token received — please try again.'
    }
  </script>
</body>
</html>`)
})

app.get('/auth/token', (req, res) => {
  const token = req.query.access_token
  const state = req.query.state ?? 'main'
  res.json({ ok: !!token })
  if (token) receiveAuthToken(token, state)
})

// ── WebSocket broadcasting ──────────────────────────────────────────────────

const overlayClients = new Set()
const dockClients    = new Set()
let mainWindowRef = null
let storedOverlayConfig = null
let shinyCurrentScene    = null
let shinyCurrentDeviceId = null

export function setMainWindow(win) { mainWindowRef = win }
export function setShinyCurrentScene(sceneName) { shinyCurrentScene = sceneName }

export function broadcastToDock(message) {
  const payload = JSON.stringify(message)
  for (const ws of dockClients) {
    if (ws.readyState === 1) ws.send(payload)
  }
}

export function notifyShinyLayoutChanged() {
  broadcastToDock({ type: 'layout-changed', layout: getShinyLayoutForScene(shinyCurrentScene) })
}

wss.on('connection', (ws, req) => {
  // Dock clients connect to /dock; everything else is the overlay
  if (req.url === '/dock') {
    dockClients.add(ws)
    ws.on('close', () => dockClients.delete(ws))
    ws.on('error', () => dockClients.delete(ws))
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'show-device' && msg.deviceId) {
          const device = getShinyDevices().find(d => d.id === msg.deviceId)
          const shinyScene = resolveDeviceShinyScene(msg.deviceId, shinyCurrentScene)
          if (device && shinyScene) {
            const allSources = getShinyDevices().map(d => d.obsSourceName).filter(Boolean)
            showDeviceInScene({ universalScene: shinyScene, targetSourceName: device.obsSourceName, allDeviceSources: allSources })
              .then(() => {
                shinyCurrentDeviceId = msg.deviceId
                broadcastToDock({ type: 'device-shown', deviceId: msg.deviceId })
              })
              .catch(e => console.error('show-device failed:', e))
          }
        }
      } catch {}
    })
    ws.send(JSON.stringify({ type: 'hello', layout: getShinyLayoutForScene(shinyCurrentScene), currentScene: shinyCurrentScene, currentDeviceId: shinyCurrentDeviceId }))
    return
  }

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
  return new Promise((resolve, reject) => {
    httpServer.on('error', reject)
    httpServer.listen(PORT, '127.0.0.1', () => resolve(PORT))
  })
}

export function closeServer() {
  wss.clients.forEach(ws => ws.close())
  return new Promise(resolve => httpServer.close(resolve))
}

export function getOverlayUrl() {
  return `http://localhost:${PORT}/overlay/index.html`
}

export function getDockUrl() {
  return `http://localhost:${PORT}/dock/index.html`
}

export function getPlayerUrl() {
  return `http://localhost:${PORT}/player/index.html`
}
