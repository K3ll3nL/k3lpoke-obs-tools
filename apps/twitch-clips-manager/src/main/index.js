import { app, BrowserWindow, shell, session } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { autoUpdater } from 'electron-updater'
import { initDb, getSetting, getShinyLayoutForScene } from './db.js'
import { initTwitch } from './twitch.js'
import { startServer, broadcastToOverlay, broadcastToDock, setShinyCurrentScene } from './server.js'
import { registerIpcHandlers, runAutoFetch } from './ipc.js'
import { onStatusChange, onSceneChanged, onOBSConnected, connectOBS } from './obs.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

let mainWindow

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Twitch Clip Queue',
    backgroundColor: '#0e0e10',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false  // allows Twitch embed iframes from localhost/file origins
    }
  })

  mainWindow.setMenuBarVisibility(false)

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    // Serve from localhost so Twitch embed iframes work (parent=localhost)
    mainWindow.loadURL('http://localhost:3000')
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
    await startServer()

    const win = await createWindow()
    registerIpcHandlers(win)

    // Setup auto-updater
    autoUpdater.checkForUpdatesAndNotify()
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

    // Hourly incremental clip fetch for all channels
    setInterval(() => runAutoFetch(win), 60 * 60 * 1000)

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

app.on('before-quit', () => {
  broadcastToOverlay({ type: 'stop' })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
