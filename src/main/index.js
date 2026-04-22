import { app, BrowserWindow, shell, session } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { autoUpdater } from 'electron-updater'
import { initDb, getSetting, getShinyLayoutForScene } from './db.js'
import { initTwitch } from './twitch.js'
import { startServer, broadcastToOverlay, broadcastToDock, setShinyCurrentScene, closeServer } from './server.js'
import { registerIpcHandlers, runAutoFetch } from './ipc.js'
import { onStatusChange, onSceneChanged, onSceneListChanged, onOBSConnected, connectOBS, getSceneList, disconnectOBS } from './obs.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

// Set userData path to use package name, not repo folder name
app.setPath('userData', path.join(app.getPath('appData'), 'k3lpoke-obs-tools'))

let mainWindow
let autoFetchInterval

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'K3lPoke OBS Tools',
    backgroundColor: '#0e0e10',
    webPreferences: {
      preload: path.resolve(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false  // allows Twitch embed iframes from localhost/file origins
    }
  })

  mainWindow.setMenuBarVisibility(false)

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadURL(`http://localhost:1102`)
  }

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return mainWindow
}

app.whenReady().then(async () => {
  // Allow Twitch CDN video/image requests from any origin (desktop app, no CORS needed)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*']
      }
    })
  })

  try {
    initDb()
    initTwitch()
    await startServer().catch((err) => console.error('Server failed to start:', err))

    const win = await createWindow()
    registerIpcHandlers(win)

    // Setup auto-updater
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
    autoUpdater.on('update-available', () => {
      win.webContents.send('app:update-available')
    })
    autoUpdater.on('update-downloaded', () => {
      win.webContents.send('app:update-ready')
    })

    onStatusChange((status) => {
      win.webContents.send('obs:status-changed', status)
    })

    onOBSConnected((sceneName) => {
      if (sceneName) {
        setShinyCurrentScene(sceneName)
        broadcastToDock({ type: 'scene-changed', sceneName, layout: getShinyLayoutForScene(sceneName) })
        win.webContents.send('obs:scene-changed', sceneName)
      }
    })

    onSceneChanged((sceneName) => {
      setShinyCurrentScene(sceneName)
      broadcastToDock({ type: 'scene-changed', sceneName, layout: getShinyLayoutForScene(sceneName) })
      win.webContents.send('obs:scene-changed', sceneName)
    })

    onSceneListChanged(async () => {
      const sceneRes = await getSceneList()
      win.webContents.send('obs:scene-list-changed', sceneRes)
    })

    // Hourly incremental clip fetch for all channels
    autoFetchInterval = setInterval(() => runAutoFetch(win), 60 * 60 * 1000)

    // Auto-reconnect OBS using saved credentials
    const obsHost = getSetting('obsHost')
    const obsPort = getSetting('obsPort')
    if (obsHost) {
      connectOBS({
        host: obsHost,
        port: obsPort ?? 4455,
        password: getSetting('obsPassword') ?? ''
      }).catch(() => {}) // silently skip if OBS isn't running
    }
  } catch (err) {
    console.error('Startup error:', err)
  }
})

app.on('before-quit', async () => {
  if (autoFetchInterval) clearInterval(autoFetchInterval)
  broadcastToOverlay({ type: 'stop' })
  await disconnectOBS().catch(() => {})
  await closeServer().catch(() => {})
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
