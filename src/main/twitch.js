import axios from 'axios'
import { shell, BrowserWindow } from 'electron'
import { getSetting, setSetting, setChatBotAccount } from './db.js'

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/authorize'
const TWITCH_API = 'https://api.twitch.tv/helix'
const TWITCH_GQL = 'https://gql.twitch.tv/gql'
const REDIRECT_URI = 'http://localhost:1102/auth/callback'
const SCOPES = 'user:read:email chat:read user:write:chat moderator:manage:announcements moderator:read:followers channel:read:redemptions user:manage:whispers clips:edit'
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

let _pendingAuthResolve = null
let _pendingAuthReject = null
let _pendingBotResolve = null
let _pendingBotReject = null

export function receiveAuthToken(token, state = 'main') {
  if (state === 'bot') {
    if (!_pendingBotResolve) return
    const resolve = _pendingBotResolve
    const reject = _pendingBotReject
    _pendingBotResolve = null
    _pendingBotReject = null
    storeBotToken(token).then(resolve).catch(reject)
    return
  }
  if (!_pendingAuthResolve) return
  const resolve = _pendingAuthResolve
  const reject = _pendingAuthReject
  _pendingAuthResolve = null
  _pendingAuthReject = null
  storeToken(token).then(resolve).catch(reject)
}

export async function startOAuthFlow() {
  if (!clientId) throw new Error('No Client ID configured')

  const url =
    `${TWITCH_AUTH_URL}?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=token` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&force_verify=true`

  return new Promise((resolve, reject) => {
    _pendingAuthResolve = () => resolve(currentUser)
    let win = null

    const timer = setTimeout(() => {
      _pendingAuthResolve = null
      _pendingAuthReject = null
      win?.close()
      reject(new Error('Auth timed out'))
    }, 5 * 60 * 1000)

    _pendingAuthReject = (err) => { clearTimeout(timer); win?.close(); reject(err) }

    win = new BrowserWindow({
      width: 500,
      height: 700,
      title: 'Connect Twitch Account',
      webPreferences: {
        partition: 'main-auth',
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    win.loadURL(url)
    win.on('closed', () => {
      if (_pendingAuthResolve) {
        _pendingAuthResolve = null
        _pendingAuthReject = null
        clearTimeout(timer)
        reject(new Error('Auth window closed'))
      }
    })
    win.webContents.on('did-navigate', (_, navUrl) => {
      if (navUrl.startsWith(REDIRECT_URI)) {
        setTimeout(() => { if (!win.isDestroyed()) win.close() }, 2000)
      }
    })
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

export async function fetchCurrentStream(userLogin) {
  try {
    const data = await apiGet('/streams', { user_login: userLogin })
    const stream = data.data[0] ?? null
    if (!stream) return { isLive: false, gameCategory: null, title: null }
    return { isLive: true, gameCategory: stream.game_name ?? null, title: stream.title ?? null }
  } catch {
    return { isLive: false, gameCategory: null, title: null }
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

export async function searchCategories(query) {
  if (!query || query.length < 2) return []
  const data = await apiGet('/search/categories', { query, first: 20 })
  return (data.data ?? []).map(g => ({
    id: g.id,
    name: g.name,
    box_art_url: g.box_art_url?.replace('{width}', '40').replace('{height}', '53') ?? null,
  }))
}

export async function searchChannels(query) {
  if (!query || query.length < 2) return []
  const data = await apiGet('/search/channels', { query, first: 50 })
  const q = query.toLowerCase()

  const results = data.data.map(ch => ({
    id: ch.id,
    login: ch.broadcaster_login,
    display_name: ch.display_name,
    thumbnail_url: ch.thumbnail_url
  }))

  results.sort((a, b) => {
    const aLogin = a.login.toLowerCase()
    const bLogin = b.login.toLowerCase()
    const aDisplay = a.display_name.toLowerCase()
    const bDisplay = b.display_name.toLowerCase()

    // Exact login match wins
    if (aLogin === q) return -1
    if (bLogin === q) return 1

    // Login starts with query
    if (aLogin.startsWith(q) && !bLogin.startsWith(q)) return -1
    if (bLogin.startsWith(q) && !aLogin.startsWith(q)) return 1

    // Display name starts with query
    if (aDisplay.startsWith(q) && !bDisplay.startsWith(q)) return -1
    if (bDisplay.startsWith(q) && !aDisplay.startsWith(q)) return 1

    return 0
  })

  return results.slice(0, 10)
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

export async function fetchClipDetails(clipIds) {
  const clips = {}
  for (let i = 0; i < clipIds.length; i += 100) {
    const batch = clipIds.slice(i, i + 100)
    const qs = batch.map(id => `id=${encodeURIComponent(id)}`).join('&')
    try {
      const res = await axios.get(`${TWITCH_API}/clips?${qs}&first=100`, { headers: apiHeaders() })
      res.data.data.forEach(c => {
        clips[c.id] = { thumbnail_url: c.thumbnail_url, view_count: c.view_count, created_at: c.created_at }
      })
      if (i + 100 < clipIds.length) await new Promise(r => setTimeout(r, 250))
    } catch {}
  }
  return clips
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

// ── Chat ──────────────────────────────────────────────────────────────────

export async function validateTokenScopes() {
  if (!accessToken) return []
  try {
    const res = await axios.get('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${accessToken}` }
    })
    return res.data.scopes ?? []
  } catch { return [] }
}

const BOT_SCOPES = 'chat:read user:write:chat channel:read:redemptions user:manage:whispers moderator:manage:announcements'

export async function startBotOAuthFlow() {
  if (!clientId) throw new Error('No Client ID configured')
  const url =
    `${TWITCH_AUTH_URL}?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=token` +
    `&scope=${encodeURIComponent(BOT_SCOPES)}` +
    `&state=bot` +
    `&force_verify=true`

  return new Promise((resolve, reject) => {
    _pendingBotResolve = resolve
    let win = null
    const timer = setTimeout(() => {
      _pendingBotResolve = null
      _pendingBotReject = null
      win?.close()
      reject(new Error('Bot auth timed out'))
    }, 5 * 60 * 1000)
    _pendingBotReject = (err) => { clearTimeout(timer); win?.close(); reject(err) }

    // Use an isolated window with no saved credentials to prevent autofill
    win = new BrowserWindow({
      width: 500,
      height: 700,
      title: 'Connect Bot Account',
      webPreferences: {
        partition: 'bot-auth',
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    win.loadURL(url)
    win.on('closed', () => {
      if (_pendingBotResolve) {
        _pendingBotResolve = null
        _pendingBotReject = null
        clearTimeout(timer)
        reject(new Error('Auth window closed'))
      }
    })
    // Close the window ~2s after the callback page loads (token extracted by then)
    win.webContents.on('did-navigate', (_, navUrl) => {
      if (navUrl.startsWith(REDIRECT_URI)) {
        setTimeout(() => { if (!win.isDestroyed()) win.close() }, 2000)
      }
    })
  })
}

async function storeBotToken(token) {
  const res = await axios.get(`${TWITCH_API}/users`, {
    headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}` }
  })
  const user = res.data.data[0] ?? null
  const botAccount = { token, user }
  setChatBotAccount(botAccount)
  return botAccount
}

export async function validateBotTokenScopes(botToken) {
  if (!botToken) return []
  try {
    const res = await axios.get('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${botToken}` }
    })
    return res.data.scopes ?? []
  } catch { return [] }
}

export function logoutBot() {
  setChatBotAccount(null)
}

export async function sendChatMessage(broadcasterId, senderId, text, senderToken) {
  await axios.post(`${TWITCH_API}/chat/messages`, {
    broadcaster_id: broadcasterId,
    sender_id: senderId,
    message: text.slice(0, 500)
  }, {
    headers: { 'Client-Id': clientId, Authorization: `Bearer ${senderToken ?? accessToken}` }
  })
}

export async function sendAnnouncement(broadcasterId, moderatorId, text, color = 'primary', token) {
  await axios.post(
    `${TWITCH_API}/chat/announcements?broadcaster_id=${broadcasterId}&moderator_id=${moderatorId}`,
    { message: text.slice(0, 500), color },
    { headers: { 'Client-Id': clientId, Authorization: `Bearer ${token ?? accessToken}` } }
  )
}

export async function sendWhisper(fromUserId, toUserId, message, token) {
  await axios.post(
    `${TWITCH_API}/whispers?from_user_id=${fromUserId}&to_user_id=${toUserId}`,
    { message: message.slice(0, 500) },
    { headers: { 'Client-Id': clientId, Authorization: `Bearer ${token ?? accessToken}` } }
  )
}

export async function fetchFollowage(userId, broadcasterId) {
  try {
    const res = await apiGet('/channels/followers', { broadcaster_id: broadcasterId, user_id: userId })
    const follow = res.data?.[0]
    if (!follow) return null
    const ms = Date.now() - new Date(follow.followed_at).getTime()
    const days = Math.floor(ms / 86400000)
    const years = Math.floor(days / 365)
    const months = Math.floor(days / 30)
    if (years > 0) return `${years} year${years > 1 ? 's' : ''}`
    if (months > 0) return `${months} month${months > 1 ? 's' : ''}`
    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`
    return 'less than a day'
  } catch { return null }
}

export async function fetchCustomRewards(broadcasterId, token) {
  try {
    const useToken = token ?? accessToken
    const res = await axios.get(`${TWITCH_API}/channel_points/custom_rewards`, {
      params: { broadcaster_id: broadcasterId, only_manageable_rewards: false },
      headers: { 'Client-Id': clientId, Authorization: `Bearer ${useToken}` },
    })
    return (res.data?.data ?? []).map(r => ({ id: r.id, title: r.title, cost: r.cost, isEnabled: r.is_enabled }))
  } catch { return [] }
}

export async function createEventSubSubscription(sessionId, broadcasterId, token) {
  try {
    await axios.post(
      `${TWITCH_API}/eventsub/subscriptions`,
      {
        type: 'channel.channel_points_custom_reward_redemption.add',
        version: '1',
        condition: { broadcaster_user_id: broadcasterId },
        transport: { method: 'websocket', session_id: sessionId },
      },
      { headers: { 'Client-Id': clientId, Authorization: `Bearer ${token ?? accessToken}` } }
    )
    return true
  } catch { return false }
}

// Deletes clips from the broadcaster's channel. Requires clips:edit scope.
// Returns { deleted: string[], failed: string[] }
export async function deleteClipsOnTwitch(clipIds) {
  const failed = []
  for (let i = 0; i < clipIds.length; i += 100) {
    const batch = clipIds.slice(i, i + 100)
    const qs = batch.map(id => `id=${encodeURIComponent(id)}`).join('&')
    try {
      await axios.delete(`${TWITCH_API}/clips?${qs}`, { headers: apiHeaders() })
    } catch {
      failed.push(...batch)
    }
    if (i + 100 < clipIds.length) await new Promise(r => setTimeout(r, 250))
  }
  return { deleted: clipIds.filter(id => !failed.includes(id)), failed }
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
