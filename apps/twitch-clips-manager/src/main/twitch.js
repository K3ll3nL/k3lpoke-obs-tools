import axios from 'axios'
import { BrowserWindow, shell } from 'electron'
import { getSetting, setSetting } from './db.js'

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/authorize'
const TWITCH_API = 'https://api.twitch.tv/helix'
const TWITCH_GQL = 'https://gql.twitch.tv/gql'
const REDIRECT_URI = 'http://localhost:3000/auth/callback'
const SCOPES = 'user:read:email'
const DEFAULT_CLIENT_ID = '0ue4vlu07adeae3lxj3e7euyuhvmyx'
// Twitch's internal GQL client ID — required for playback token endpoint
const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

let clientId = DEFAULT_CLIENT_ID
let accessToken = null
let currentUser = null

export function initTwitch() {
  clientId = getSetting('twitchClientId') ?? DEFAULT_CLIENT_ID
  accessToken = getSetting('twitchAccessToken')
  currentUser = getSetting('twitchUser')
}

export function getTwitchState() {
  return { clientId, accessToken, user: currentUser }
}

export function setClientId(id) {
  clientId = id
  setSetting('twitchClientId', id)
}

export async function startOAuthFlow() {
  if (!clientId) throw new Error('No Client ID configured')

  const url =
    `${TWITCH_AUTH_URL}?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=token` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&force_verify=false`

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 520,
      height: 680,
      title: 'Connect Twitch Account',
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })

    win.loadURL(url)
    win.setMenuBarVisibility(false)

    const handleNav = async (navUrl) => {
      if (!navUrl.startsWith('http://localhost:3000/auth/callback')) return
      try {
        const hash = await win.webContents.executeJavaScript('location.hash')
        win.close()
        const params = new URLSearchParams(hash.slice(1))
        const token = params.get('access_token')
        if (!token) return reject(new Error('No access token returned'))
        await storeToken(token)
        resolve(currentUser)
      } catch (err) {
        win.close()
        reject(err)
      }
    }

    win.webContents.on('did-navigate', (_, url) => handleNav(url))
    win.webContents.on('will-redirect', (_, url) => handleNav(url))
    win.on('closed', () => reject(new Error('Auth window closed')))
  })
}

async function storeToken(token) {
  accessToken = token
  setSetting('twitchAccessToken', token)
  const user = await fetchCurrentUser()
  currentUser = user
  setSetting('twitchUser', user)
}

export function logout() {
  accessToken = null
  currentUser = null
  setSetting('twitchAccessToken', null)
  setSetting('twitchUser', null)
}

// ── API helpers ────────────────────────────────────────────────────────────

function apiHeaders() {
  if (!clientId || !accessToken) throw new Error('Not authenticated')
  return {
    'Client-Id': clientId,
    Authorization: `Bearer ${accessToken}`
  }
}

async function apiGet(path, params = {}, attempt = 0) {
  try {
    const res = await axios.get(`${TWITCH_API}${path}`, { headers: apiHeaders(), params })
    return res.data
  } catch (err) {
    if (err.response?.status === 429 && attempt < 5) {
      const reset = err.response.headers['ratelimit-reset']
      const waitMs = reset ? Math.max(500, Number(reset) * 1000 - Date.now()) : 1000 * (attempt + 1)
      await new Promise(r => setTimeout(r, waitMs))
      return apiGet(path, params, attempt + 1)
    }
    throw err
  }
}

export async function fetchCurrentUser() {
  const data = await apiGet('/users')
  return data.data[0] ?? null
}

export async function fetchUserByLogin(login) {
  const data = await apiGet('/users', { login })
  return data.data[0] ?? null
}

export async function checkClipsExist(clipIds) {
  const existing = new Set()
  for (let i = 0; i < clipIds.length; i += 100) {
    const batch = clipIds.slice(i, i + 100)
    const qs = batch.map(id => `id=${encodeURIComponent(id)}`).join('&')
    const res = await axios.get(`${TWITCH_API}/clips?${qs}&first=100`, { headers: apiHeaders() })
    res.data.data.forEach(c => existing.add(c.id))
    if (i + 100 < clipIds.length) await new Promise(r => setTimeout(r, 250))
  }
  return existing
}

export async function fetchClips({ broadcasterId, cursor, limit = 20, startedAt } = {}) {
  const params = { broadcaster_id: broadcasterId, first: limit }
  if (cursor) params.after = cursor
  if (startedAt) params.started_at = startedAt
  const data = await apiGet('/clips', params)

  const gameIds = [...new Set(data.data.map(c => c.game_id).filter(Boolean))]
  let gameNames = {}
  if (gameIds.length > 0) {
    try {
      const gamesData = await apiGet('/games', { id: gameIds })
      gamesData.data.forEach(g => { gameNames[g.id] = g.name })
    } catch {}
  }

  return {
    clips: data.data.map(c => normalizeClip(c, gameNames)),
    cursor: data.pagination?.cursor ?? null
  }
}

function normalizeClip(c, gameNames = {}) {
  return {
    id: c.id,
    title: c.title,
    broadcaster_name: c.broadcaster_name,
    broadcaster_id: c.broadcaster_id,
    creator_name: c.creator_name,
    creator_id: c.creator_id,
    created_at: c.created_at,
    thumbnail_url: c.thumbnail_url,
    video_url: thumbnailToVideoUrl(c.thumbnail_url),
    view_count: c.view_count,
    game_id: c.game_id,
    game_name: gameNames[c.game_id] ?? null,
    duration: c.duration
  }
}


function thumbnailToVideoUrl(thumbnailUrl) {
  if (!thumbnailUrl) return null
  return thumbnailUrl.replace(/-preview-\d+x\d+\.jpg$/, '.mp4')
}

export async function getClipVideoUrl(clipId) {
  const res = await axios.post(TWITCH_GQL, {
    operationName: 'VideoAccessToken_Clip',
    variables: { slug: clipId },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: '36b89d2507fce29e5ca551df756d27c1cfe079e2609642b4390aa4c35796eb11'
      }
    }
  }, {
    headers: { 'Client-ID': GQL_CLIENT_ID, 'Content-Type': 'application/json' }
  })

  const clip = res.data?.data?.clip
  if (!clip) throw new Error('Clip not found')

  const token = clip.playbackAccessToken
  const quality = clip.videoQualities?.[0]
  if (!quality) throw new Error('No video qualities returned')

  return `${quality.sourceURL}?sig=${token.signature}&token=${encodeURIComponent(token.value)}`
}
