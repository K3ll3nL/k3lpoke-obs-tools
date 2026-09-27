import OBSWebSocket from 'obs-websocket-js'

const obs = new OBSWebSocket()
let connected = false
let _currentScene = null
let statusCallback = null
let sceneChangedCallback = null
let sceneListChangedCallback = null
let connectedCallback = null
let sceneItemEnableStateCallback = null

// Auto-reconnect state
let retryTimeout = null
let isRetrying = false
let lastConnectParams = null
const RETRY_INTERVAL = 5000 // 5 seconds

export function onStatusChange(cb) { statusCallback = cb }
export function onSceneChanged(cb) { sceneChangedCallback = cb }
export function onSceneListChanged(cb) { sceneListChangedCallback = cb }
export function onOBSConnected(cb) { connectedCallback = cb }
export function onSceneItemEnableStateChanged(cb) { sceneItemEnableStateCallback = cb }

function emit(status) {
  connected = status.connected
  try {
    statusCallback?.(status)
  } catch {
    // Ignore errors if window is destroyed during shutdown
  }
}

// Register disconnect/error handlers once at module level so they survive
// unexpected OBS closes and don't accumulate on repeated reconnects.
obs.on('ConnectionClosed', () => {
  if (connected) emit({ connected: false })
  // Resume retrying if connection was lost and we have saved params
  if (lastConnectParams && !isRetrying) {
    scheduleRetry()
  }
})
obs.on('ConnectionError',  () => {
  if (connected) emit({ connected: false })
  // Resume retrying if connection was lost and we have saved params
  if (lastConnectParams && !isRetrying) {
    scheduleRetry()
  }
})
obs.on('error', () => {})
obs.on('CurrentProgramSceneChanged', ({ sceneName }) => {
  _currentScene = sceneName
  try { sceneChangedCallback?.(sceneName) } catch {}
})
obs.on('SceneListChanged', () => {
  try { sceneListChangedCallback?.() } catch {}
})
obs.on('SceneItemEnableStateChanged', (data) => {
  try { sceneItemEnableStateCallback?.(data) } catch {}
})

function scheduleRetry() {
  if (isRetrying || !lastConnectParams) return
  isRetrying = true
  retryTimeout = setTimeout(() => {
    isRetrying = false
    attemptConnect(lastConnectParams).catch(() => {})
  }, RETRY_INTERVAL)
}

async function attemptConnect(params) {
  try {
    await obs.connect(`ws://${params.host}:${params.port}`, params.password || undefined)
    connected = true
    const sceneRes = await obs.call('GetCurrentProgramScene').catch(() => null)
    const currentScene = sceneRes?.currentProgramSceneName ?? null
    connectedCallback?.(currentScene)
    emit({ connected: true })
    // Clear retry state on successful connection
    isRetrying = false
    if (retryTimeout) clearTimeout(retryTimeout)
    return { connected: true }
  } catch (err) {
    emit({ connected: false })
    // Schedule next retry
    scheduleRetry()
    throw new Error(`OBS connection failed: ${err.message}`)
  }
}

export async function connectOBS({ host = 'localhost', port = 4455, password = '' } = {}) {
  // Save params for auto-retry
  lastConnectParams = { host, port, password }
  return attemptConnect(lastConnectParams)
}

export async function disconnectOBS() {
  try {
    await obs.disconnect()
  } catch (err) {
    // Ignore errors during disconnect (object already destroyed, etc)
  }
  connected = false
  // Stop retry when explicitly disconnecting
  lastConnectParams = null
  if (retryTimeout) clearTimeout(retryTimeout)
  isRetrying = false
  try {
    emit({ connected: false })
  } catch (err) {
    // Ignore errors if event listeners fail
  }
}

export function isConnected() {
  return connected
}

export async function getSceneList() {
  if (!connected) return { scenes: [], currentScene: null }
  try {
    const res = await obs.call('GetSceneList')
    return {
      scenes: (Array.isArray(res?.scenes) ? res.scenes : []).map(s => s.sceneName).reverse(),
      currentScene: res?.currentProgramSceneName ?? null
    }
  } catch {
    return { scenes: [], currentScene: null }
  }
}

export async function switchScene(sceneName) {
  if (!connected) throw new Error('OBS not connected')
  await obs.call('SetCurrentProgramScene', { sceneName })
}

export async function getSourceList() {
  if (!connected) return []
  try {
    const res = await obs.call('GetInputList')
    if (!Array.isArray(res?.inputs)) return []
    return res.inputs.map(i => ({ name: i.inputName, kind: i.inputKind })).filter(s => s.name)
  } catch { return [] }
}

export async function getSceneItemList(sceneName) {
  if (!connected) return []
  try {
    const res = await obs.call('GetSceneItemList', { sceneName })
    if (!Array.isArray(res?.sceneItems)) return []
    return res.sceneItems.map(i => ({
      sceneItemId:      i.sceneItemId,
      sourceName:       i.sourceName,
      sceneItemEnabled: i.sceneItemEnabled
    }))
  } catch { return [] }
}

export async function playVideoInSource(sourceName, filePath) {
  if (!connected) throw new Error('OBS not connected')
  await obs.call('SetInputSettings', {
    inputName: sourceName,
    inputSettings: { local_file: filePath, is_local_file: true }
  })
  await obs.call('TriggerMediaInputAction', {
    inputName: sourceName,
    mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART'
  })
}

export async function setSourceVisibility({ sceneName, sourceName, visible }) {
  if (!connected) throw new Error('OBS not connected')
  const target = sceneName ?? (await obs.call('GetCurrentProgramScene')).currentProgramSceneName
  const res = await obs.call('GetSceneItemList', { sceneName: target })
  const item = res.sceneItems.find(i => i.sourceName === sourceName)
  if (!item) throw new Error(`Source "${sourceName}" not found in scene "${target}"`)
  await obs.call('SetSceneItemEnabled', {
    sceneName: target,
    sceneItemId: item.sceneItemId,
    sceneItemEnabled: visible
  })
}

export function getCurrentScene() {
  return _currentScene
}

// Switches to universalScene, then shows only targetSourceName among all known
// device sources (hides the rest). Non-device sources are left untouched.
export async function showDeviceInScene({ universalScene, targetSourceName, allDeviceSources }) {
  if (!connected) throw new Error('OBS not connected')
  await obs.call('SetCurrentProgramScene', { sceneName: universalScene })
  const res = await obs.call('GetSceneItemList', { sceneName: universalScene })
  for (const item of res.sceneItems) {
    if (!allDeviceSources.includes(item.sourceName)) continue
    const shouldShow = item.sourceName === targetSourceName
    if (item.sceneItemEnabled !== shouldShow) {
      await obs.call('SetSceneItemEnabled', {
        sceneName: universalScene,
        sceneItemId: item.sceneItemId,
        sceneItemEnabled: shouldShow
      })
    }
  }
}

// ── Overlay gain ─────────────────────────────────────────────────────────────
// A <video> can't play above volume 1.0, and the overlay can't use Web Audio
// (breaks reroute_audio). So any boost a clip needs is applied by a Gain filter
// on the overlay's browser source, followed by a Limiter so boosted peaks don't clip.
// We use filters rather than SetInputVolume so the user's mixer fader stays theirs.

const GAIN_FILTER = 'Clip Normalize Gain'
const LIMITER_FILTER = 'Clip Normalize Limiter'
export const MAX_BOOST_DB = 12
const OVERLAY_URL_RE = /:1102\/overlay\//
const SOURCE_CACHE_MS = 30000

let overlaySourceCache = { names: [], at: 0 }
const filtersReady = new Set()
const lastGainDb = new Map()

obs.on('ConnectionClosed', () => {
  overlaySourceCache = { names: [], at: 0 }
  filtersReady.clear()
  lastGainDb.clear()
})

// Browser sources pointing at our overlay, whatever the user named them.
async function findOverlaySources() {
  if (overlaySourceCache.names.length && Date.now() - overlaySourceCache.at < SOURCE_CACHE_MS) return overlaySourceCache.names
  const { inputs } = await obs.call('GetInputList', { inputKind: 'browser_source' })
  const names = []
  for (const i of inputs) {
    try {
      const { inputSettings } = await obs.call('GetInputSettings', { inputName: i.inputName })
      if (OVERLAY_URL_RE.test(inputSettings?.url ?? '')) names.push(i.inputName)
    } catch {}
  }
  overlaySourceCache = { names, at: Date.now() }
  return names
}

async function ensureGainFilters(sourceName) {
  if (filtersReady.has(sourceName)) return
  const { filters } = await obs.call('GetSourceFilterList', { sourceName })
  const has = n => filters.some(f => f.filterName === n)
  // Gain must come before the limiter; both append to the end of the chain.
  if (!has(GAIN_FILTER)) {
    await obs.call('CreateSourceFilter', { sourceName, filterName: GAIN_FILTER, filterKind: 'gain_filter', filterSettings: { db: 0 } })
  }
  if (!has(LIMITER_FILTER)) {
    await obs.call('CreateSourceFilter', { sourceName, filterName: LIMITER_FILTER, filterKind: 'limiter_filter', filterSettings: { threshold: -1, release_time: 60 } })
  }
  filtersReady.add(sourceName)
  lastGainDb.delete(sourceName)
}

/**
 * Sets the boost gain (dB, clamped 0..MAX_BOOST_DB) on every overlay browser source.
 * Returns true only when at least one source was updated — the overlay treats
 * false as "no boost available" and falls back to capping at 1.0.
 */
export async function setOverlayGain(db) {
  if (!connected) return false
  const target = Math.round(Math.max(0, Math.min(MAX_BOOST_DB, db)) * 10) / 10
  let applied = false
  try {
    for (const sourceName of await findOverlaySources()) {
      try {
        await ensureGainFilters(sourceName)
        if (lastGainDb.get(sourceName) !== target) {
          await obs.call('SetSourceFilterSettings', { sourceName, filterName: GAIN_FILTER, filterSettings: { db: target } })
          lastGainDb.set(sourceName, target)
        }
        applied = true
      } catch {
        // Filter removed by the user or source renamed — rebuild next time.
        filtersReady.delete(sourceName)
        overlaySourceCache.at = 0
      }
    }
  } catch {}
  return applied
}

export async function checkBrowserSource(inputName) {
  if (!connected) return { exists: false }
  try {
    const res = await obs.call('GetInputList', { inputKind: 'browser_source' })
    return { exists: res.inputs.some(i => i.inputName === inputName) }
  } catch {
    return { exists: false }
  }
}

export async function addBrowserSource({ sceneName, url, width = 1920, height = 1080, inputName = 'Twitch Clip Queue' } = {}) {
  if (!connected) throw new Error('OBS not connected')

  const sourceName = inputName

  try {
    // Try to create the input; if it already exists OBS returns an error we catch below
    await obs.call('CreateInput', {
      sceneName,
      inputName: sourceName,
      inputKind: 'browser_source',
      inputSettings: {
        url,
        width,
        height,
        reroute_audio: true,
        restart_when_active: false
      }
    })
  } catch (err) {
    if (err.code === 601) {
      // Source already exists — update its settings
      await obs.call('SetInputSettings', {
        inputName: sourceName,
        inputSettings: { url, width, height }
      })
    } else {
      throw err
    }
  }

  return { sourceName }
}

export async function getSceneItemListFull(sceneName) {
  if (!connected) return []
  try {
    const res = await obs.call('GetSceneItemList', { sceneName })
    if (!Array.isArray(res?.sceneItems)) return []
    return res.sceneItems.map(i => ({
      sceneItemId:      i.sceneItemId,
      sourceName:       i.sourceName,
      sourceType:       i.sourceType,
      inputKind:        i.inputKind,
      isGroup:          i.isGroup,
      sceneItemEnabled: i.sceneItemEnabled,
      sceneItemLocked:  i.sceneItemLocked,
      sceneItemIndex:   i.sceneItemIndex,
      transform:        i.sceneItemTransform ?? {}
    }))
  } catch { return [] }
}

export async function createScene(sceneName) {
  if (!connected) throw new Error('OBS not connected')
  await obs.call('CreateScene', { sceneName })
}

export async function removeScene(sceneName) {
  if (!connected) throw new Error('OBS not connected')
  await obs.call('RemoveScene', { sceneName })
}

export async function setSceneItemTransform(sceneName, sceneItemId, sceneItemTransform) {
  if (!connected) throw new Error('OBS not connected')
  await obs.call('SetSceneItemTransform', { sceneName, sceneItemId, sceneItemTransform })
}

export async function createSceneItem(sceneName, sourceName) {
  if (!connected) throw new Error('OBS not connected')
  const res = await obs.call('CreateSceneItem', { sceneName, sourceName, sceneItemEnabled: true })
  return res.sceneItemId
}

export async function removeSceneItem(sceneName, sceneItemId) {
  if (!connected) throw new Error('OBS not connected')
  await obs.call('RemoveSceneItem', { sceneName, sceneItemId })
}

export async function duplicateSceneItem(sceneName, sceneItemId, destinationSceneName) {
  if (!connected) throw new Error('OBS not connected')
  const res = await obs.call('DuplicateSceneItem', { sceneName, sceneItemId, destinationSceneName })
  return res.sceneItemId
}

export async function setSceneItemIndex(sceneName, sceneItemId, sceneItemIndex) {
  if (!connected) throw new Error('OBS not connected')
  await obs.call('SetSceneItemIndex', { sceneName, sceneItemId, sceneItemIndex })
}

export async function getInputSettings(inputName) {
  if (!connected) throw new Error('OBS not connected')
  const res = await obs.call('GetInputSettings', { inputName })
  return { settings: res.inputSettings, kind: res.inputKind }
}

export async function setInputSettingsObs(inputName, inputSettings) {
  if (!connected) throw new Error('OBS not connected')
  await obs.call('SetInputSettings', { inputName, inputSettings })
}

export async function removeInput(inputName) {
  if (!connected) throw new Error('OBS not connected')
  await obs.call('RemoveInput', { inputName })
}

export async function getSceneCollectionList() {
  if (!connected) throw new Error('OBS not connected')
  return obs.call('GetSceneCollectionList')
}

export async function setCurrentSceneCollection(name) {
  if (!connected) throw new Error('OBS not connected')
  await obs.call('SetCurrentSceneCollection', { sceneCollectionName: name })
}

export async function createSceneCollection(name) {
  if (!connected) throw new Error('OBS not connected')
  await obs.call('CreateSceneCollection', { sceneCollectionName: name })
}

export async function getGroupSceneItemList(groupName) {
  if (!connected) return []
  try {
    const res = await obs.call('GetGroupSceneItemList', { sceneName: groupName })
    if (!Array.isArray(res?.sceneItems)) return []
    return res.sceneItems.map(i => i.sourceName).filter(Boolean)
  } catch { return [] }
}

export async function removeInputFull(inputName) {
  if (!connected) throw new Error('OBS not connected')
  // Remove all scene items referencing this input (including inside groups) before deleting
  try {
    const scenesRes = await obs.call('GetSceneList')
    for (const scene of scenesRes.scenes ?? []) {
      let items
      try { items = (await obs.call('GetSceneItemList', { sceneName: scene.sceneName })).sceneItems ?? [] }
      catch { continue }
      for (const item of items) {
        if (item.sourceName === inputName) {
          try { await obs.call('RemoveSceneItem', { sceneName: scene.sceneName, sceneItemId: item.sceneItemId }) } catch {}
        }
        if (item.isGroup) {
          let groupItems
          try { groupItems = (await obs.call('GetGroupSceneItemList', { sceneName: item.sourceName })).sceneItems ?? [] }
          catch { continue }
          for (const gi of groupItems) {
            if (gi.sourceName === inputName) {
              try { await obs.call('RemoveSceneItem', { sceneName: item.sourceName, sceneItemId: gi.sceneItemId }) } catch {}
            }
          }
        }
      }
    }
  } catch {}
  // Workaround for OBS 32.0.3+ bug: RemoveInput returns success but audio sources aren't
  // destroyed because the audio mixer holds a reference. Releasing audio first forces cleanup.
  try { await obs.call('SetInputMute', { inputName, inputMuted: true }) } catch {}
  try { await obs.call('SetInputAudioMonitorType', { inputName, monitorType: 'OBS_MONITORING_TYPE_NONE' }) } catch {}
  try { await obs.call('SetInputAudioTracks', { inputName, inputAudioTracks: { '1': false, '2': false, '3': false, '4': false, '5': false, '6': false } }) } catch {}
  await obs.call('RemoveInput', { inputName })
}

export async function checkChatTriggersPlayer(sceneName) {
  if (!connected) return { exists: false }
  try {
    const items = await getSceneItemList(sceneName)
    const hasPlayer = items.some(item => {
      // Check if source name suggests it's the player, or we'd need to check the actual URL
      return item.sourceName.toLowerCase().includes('chat') && item.sourceName.toLowerCase().includes('player')
    })
    return { exists: hasPlayer }
  } catch {
    return { exists: false }
  }
}
