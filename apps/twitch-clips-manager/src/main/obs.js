import OBSWebSocket from 'obs-websocket-js'

const obs = new OBSWebSocket()
let connected = false
let statusCallback = null
let sceneChangedCallback = null
let connectedCallback = null

export function onStatusChange(cb) { statusCallback = cb }
export function onSceneChanged(cb) { sceneChangedCallback = cb }
export function onOBSConnected(cb) { connectedCallback = cb }

function emit(status) {
  connected = status.connected
  statusCallback?.(status)
}

// Register disconnect/error handlers once at module level so they survive
// unexpected OBS closes and don't accumulate on repeated reconnects.
obs.on('ConnectionClosed', () => { if (connected) emit({ connected: false }) })
obs.on('ConnectionError',  () => { if (connected) emit({ connected: false }) })
obs.on('error', () => {})
obs.on('CurrentProgramSceneChanged', ({ sceneName }) => sceneChangedCallback?.(sceneName))

export async function connectOBS({ host = 'localhost', port = 4455, password = '' } = {}) {
  try {
    await obs.connect(`ws://${host}:${port}`, password || undefined)
    connected = true
    const sceneRes = await obs.call('GetCurrentProgramScene').catch(() => null)
    const currentScene = sceneRes?.currentProgramSceneName ?? null
    connectedCallback?.(currentScene)
    emit({ connected: true })
    return { connected: true }
  } catch (err) {
    emit({ connected: false })
    throw new Error(`OBS connection failed: ${err.message}`)
  }
}

export async function disconnectOBS() {
  await obs.disconnect()
  connected = false
  emit({ connected: false })
}

export function isConnected() {
  return connected
}

export async function getSceneList() {
  if (!connected) return { scenes: [], currentScene: null }
  const res = await obs.call('GetSceneList')
  return {
    scenes: res.scenes.map(s => s.sceneName).reverse(),
    currentScene: res.currentProgramSceneName
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
    return res.inputs.map(i => ({ name: i.inputName, kind: i.inputKind }))
  } catch { return [] }
}

export async function getSceneItemList(sceneName) {
  if (!connected) return []
  try {
    const res = await obs.call('GetSceneItemList', { sceneName })
    return res.sceneItems.map(i => ({
      sceneItemId:      i.sceneItemId,
      sourceName:       i.sourceName,
      sceneItemEnabled: i.sceneItemEnabled
    }))
  } catch { return [] }
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
