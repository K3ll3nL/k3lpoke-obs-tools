import OBSWebSocket from 'obs-websocket-js'

const obs = new OBSWebSocket()
let connected = false
let statusCallback = null

export function onStatusChange(cb) {
  statusCallback = cb
}

function emit(status) {
  connected = status.connected
  statusCallback?.(status)
}

// Register disconnect/error handlers once at module level so they survive
// unexpected OBS closes and don't accumulate on repeated reconnects.
obs.on('ConnectionClosed', () => { if (connected) emit({ connected: false }) })
obs.on('ConnectionError',  () => { if (connected) emit({ connected: false }) })
obs.on('error', () => {})  // prevent unhandled EventEmitter error crash

export async function connectOBS({ host = 'localhost', port = 4455, password = '' } = {}) {
  try {
    await obs.connect(`ws://${host}:${port}`, password || undefined)
    connected = true
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
    scenes: res.scenes.map(s => s.sceneName),
    currentScene: res.currentProgramSceneName
  }
}

export async function addBrowserSource({ sceneName, url, width = 1920, height = 1080 } = {}) {
  if (!connected) throw new Error('OBS not connected')

  const sourceName = 'Twitch Clip Queue'

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
