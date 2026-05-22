import { ipcMain, app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import {
  initTwitch, getTwitchState, setClientId, startOAuthFlow, logout,
  fetchUserByLogin, fetchClips, getClipVideoUrl, checkClipsExist, fetchClipDetails, searchChannels as searchTwitchChannels,
  validateTokenScopes, startBotOAuthFlow, logoutBot as logoutBotAccount,
  sendChatMessage, sendAnnouncement, sendWhisper, validateBotTokenScopes, fetchFollowage as fetchFollowageApi, fetchCurrentStream, searchCategories,
  fetchCustomRewards,
} from './twitch.js'
import { connectOBS, disconnectOBS, isConnected, getSceneList, addBrowserSource, switchScene, getSourceList, getSceneItemList, showDeviceInScene, setSourceVisibility, playVideoInSource, getCurrentScene, checkChatTriggersPlayer, onSceneItemEnableStateChanged } from './obs.js'
import {
  getClipsByStatus, getAllClips, getNewClips, setClipStatus, bulkSetStatus, removeClip, reorderQueue,
  upsertClip, clipExists, getChannels, upsertChannel, removeChannel,
  updateChannelCursor, getSetting, setSetting, getAllSettings, setClipVolume, setClipTrim, setClipEnvelope, updateClipThumbnails,
  getCollections, createCollection, updateCollection, deleteCollection,
  addClipToCollection, removeClipFromCollection, getCollectionClips, getCollectionMemberships,
  getPlaybackConfig, setPlaybackConfig, saveThumbnailCache,
  getShinyDevices, addShinyDevice, updateShinyDevice, removeShinyDevice,
  getShinyLayouts, createShinyLayout, updateShinyLayout,
  setShinyLayoutPosition, replaceShinyLayoutPositions, removeDeviceFromShinyLayout, removeShinyLayout,
  setActiveShinyLayout, getActiveShinyLayout, getShinyLayoutForScene,
  setShinyLayoutPositionScene, resolveDeviceShinyScene,
  getChatTriggers, createChatTrigger, updateChatTrigger, deleteChatTrigger,
  getChatBotAccount
} from './db.js'
import {
  startChatEngine, stopChatEngine, getChatEngineStatus, setEngineWindow,
  runTriggers, matchTrigger, testTriggerMatch, dryRunTrigger, onChatMessage,
  setEngineOpts, startTimerTriggers, stopTimerTriggers, syncTimerTrigger, handleOBSSourceChange,
  startStreamPolling, stopStreamPolling, getStreamState,
} from './chatEngine.js'
import {
  playClip, stopPlayer, getPlayerState, getNextClipState, broadcastSkipNext,
  getOverlayUrl, sendOverlayConfig, notifyQueueUpdated, broadcastVolumeChange,
  setMainWindow, broadcastPlaybackConfigUpdated, broadcastCollectionsUpdated,
  notifyShinyLayoutChanged, getDockUrl
} from './server.js'

export async function runAutoFetch(win) {
  const channels = getChannels()
  let totalAdded = 0
  for (const ch of channels) {
    // Use 5-minute buffer to avoid missing clips near boundary
    const since = ch.last_fetched
      ? new Date(new Date(ch.last_fetched).getTime() - 5 * 60 * 1000).toISOString()
      : null
    let cursor = null
    try {
      do {
        const result = await fetchClips({
          broadcasterId: ch.broadcaster_id,
          cursor,
          limit: 100,
          startedAt: since ?? undefined
        })
        for (const clip of result.clips) {
          const isNew = !clipExists(clip.id)
          upsertClip(clip)
          if (isNew) totalAdded++
        }
        cursor = result.cursor
        updateChannelCursor(ch.name, cursor)
        if (cursor) await new Promise(r => setTimeout(r, 250))
      } while (cursor)
    } catch {
      // skip failed channel, cursor already saved
    }
    try {
      const allIds = getAllClips(ch.name).map(c => c.id)
      if (allIds.length > 0) {
        const existing = await checkClipsExist(allIds)
        for (const id of allIds) { if (!existing.has(id)) removeClip(id) }
      }
    } catch {
      // don't block fetch if validation fails
    }
  }
  if (totalAdded > 0) {
    notifyQueueUpdated()
    win?.webContents.send('twitch:new-clips', { count: totalAdded })
  }
  return totalAdded
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_, ...args) => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
}

export async function registerIpcHandlers(mainWindow) {
  setMainWindow(mainWindow)
  // ── Twitch ────────────────────────────────────────────────────────────────
  handle('twitch:getState', () => {
    const state = getTwitchState()
    if (state.user) {
      upsertChannel({
        name: state.user.login,
        display_name: state.user.display_name,
        broadcaster_id: state.user.id,
        is_own: 1
      })
    }
    return state
  })

  handle('twitch:setClientId', (id) => setClientId(id))

  handle('twitch:login', async () => {
    const user = await startOAuthFlow()
    if (user) {
      upsertChannel({
        name: user.login,
        display_name: user.display_name,
        broadcaster_id: user.id,
        is_own: 1
      })
    }
    mainWindow.webContents.send('twitch:auth-changed', { user })
    return user
  })

  handle('twitch:logout', () => {
    logout()
    mainWindow.webContents.send('twitch:auth-changed', { user: null })
  })

  handle('twitch:fetchAllChannels', async () => {
    const channels = getChannels()
    const results = []
    for (const ch of channels) {
      // Resume from saved cursor so an interrupted fetch picks up where it left off
      let cursor = ch.last_cursor ?? null
      let added = 0
      try {
        do {
          const result = await fetchClips({ broadcasterId: ch.broadcaster_id, cursor, limit: 100 })
          for (const clip of result.clips) {
            const isNew = !clipExists(clip.id)
            upsertClip(clip)
            if (isNew) added++
          }
          cursor = result.cursor
          // Persist cursor after every page — if interrupted, next run resumes here
          updateChannelCursor(ch.name, cursor)
          if (cursor) await new Promise(r => setTimeout(r, 250))
        } while (cursor)
        results.push({ channel: ch.name, added })
      } catch (e) {
        // Cursor is already saved — next fetch will resume from the last successful page
        results.push({ channel: ch.name, added, error: e.message })
      }
      try {
        const allIds = getAllClips(ch.name).map(c => c.id)
        if (allIds.length > 0) {
          const existing = await checkClipsExist(allIds)
          for (const id of allIds) { if (!existing.has(id)) removeClip(id) }
        }
      } catch {
        // don't block fetch if validation fails
      }
    }
    notifyQueueUpdated()
    return results
  })

  handle('twitch:fetchClips', async ({ channelName, cursor, limit }) => {
    const channels = getChannels()
    const ch = channels.find(c => c.name.toLowerCase() === channelName.toLowerCase())
    let broadcasterId = ch?.broadcaster_id

    if (!broadcasterId) {
      const user = await fetchUserByLogin(channelName)
      if (!user) throw new Error(`Channel not found: ${channelName}`)
      broadcasterId = user.id
    }

    const result = await fetchClips({ broadcasterId, cursor, limit })

    // Persist new clips; update game_name/view_count for existing ones
    for (const clip of result.clips) {
      upsertClip(clip)
    }

    if (result.cursor) updateChannelCursor(channelName, result.cursor)
    return result
  })

  // ── Clips ─────────────────────────────────────────────────────────────────
  handle('clips:getQueue', () => getClipsByStatus('approved'))
  handle('clips:getPending', () => getClipsByStatus('pending'))
  handle('clips:getAll', ({ broadcasterName } = {}) => getAllClips(broadcasterName))
  handle('clips:getNew', ({ since } = {}) => getNewClips(since))
  handle('clips:fetchMissingThumbnails', async ({ clipIds }) => {
    const details = await fetchClipDetails(clipIds)
    updateClipThumbnails(details)
    return Object.keys(details)
  })
  handle('clips:refreshThumbnail', async ({ id }) => {
    const details = await fetchClipDetails([id])
    if (details[id]?.thumbnail_url) {
      updateClipThumbnails(details, true)
      return details[id].thumbnail_url
    }
    return null
  })

  handle('clips:saveThumbnail', ({ id, dataUrl }) => saveThumbnailCache(id, dataUrl))

  handle('clips:approve', ({ id }) => { setClipStatus(id, 'approved'); notifyQueueUpdated() })
  handle('clips:deny', ({ id }) => setClipStatus(id, 'denied'))
  handle('clips:bulkApprove', ({ ids }) => { bulkSetStatus(ids, 'approved'); notifyQueueUpdated() })
  handle('clips:bulkDeny', ({ ids }) => bulkSetStatus(ids, 'denied'))
  handle('clips:remove', ({ id }) => { removeClip(id); notifyQueueUpdated() })
  handle('clips:setVolume', ({ id, volume }) => { setClipVolume(id, volume); broadcastVolumeChange(id, volume) })
  handle('clips:setTrim', ({ id, trimStart, trimEnd }) => { setClipTrim(id, trimStart, trimEnd); notifyQueueUpdated() })
  handle('clips:setEnvelope', ({ id, envelope }) => { setClipEnvelope(id, envelope); notifyQueueUpdated() })
  handle('clips:setStatus', ({ id, status }) => { setClipStatus(id, status); notifyQueueUpdated() })
  handle('clips:bulkSetStatus', ({ ids, status }) => { bulkSetStatus(ids, status); notifyQueueUpdated() })
  handle('clips:reorder', ({ ids }) => { reorderQueue(ids); notifyQueueUpdated() })

  // ── Channels ──────────────────────────────────────────────────────────────
  handle('channels:list', () => getChannels())

  handle('channels:add', async ({ name, isOwn }) => {
    const state = getTwitchState()
    if (!state.accessToken) throw new Error('Not authenticated with Twitch')
    const user = await fetchUserByLogin(name)
    if (!user) throw new Error(`Channel "${name}" not found on Twitch`)
    upsertChannel({
      name: user.login,
      display_name: user.display_name,
      broadcaster_id: user.id,
      is_own: isOwn ? 1 : 0
    })
    return { name: user.login, display_name: user.display_name }
  })

  handle('channels:remove', ({ name }) => removeChannel(name))

  handle('channels:search', async ({ query }) => {
    const state = getTwitchState()
    if (!state.accessToken) throw new Error('Not authenticated with Twitch')
    return searchTwitchChannels(query)
  })

  handle('twitch:searchCategories', async ({ query }) => {
    const state = getTwitchState()
    if (!state.accessToken) throw new Error('Not authenticated with Twitch')
    return searchCategories(query)
  })

  // ── OBS ───────────────────────────────────────────────────────────────────
  handle('obs:connect', async ({ host, port, password }) => {
    const result = await connectOBS({ host, port, password })
    if (result.connected) {
      setSetting('obsHost', host)
      setSetting('obsPort', port)
      setSetting('obsPassword', password ?? '')
    }
    mainWindow.webContents.send('obs:status-changed', result)
    return result
  })

  handle('obs:disconnect', async () => {
    await disconnectOBS()
    mainWindow.webContents.send('obs:status-changed', { connected: false })
  })

  handle('obs:getStatus', () => ({ connected: isConnected() }))
  handle('obs:getScenes', () => getSceneList())

  handle('obs:addBrowserSource', async ({ sceneName, url, inputName } = {}) => {
    const finalUrl = url ?? getOverlayUrl()
    return addBrowserSource({ sceneName, url: finalUrl, inputName: inputName ?? 'Twitch Clip Queue' })
  })

  handle('obs:checkChatTriggersPlayer', async (sceneName) => {
    return checkChatTriggersPlayer(sceneName)
  })

  handle('obs:setSourceVisibility', async ({ sceneName, sourceName, visible }) => {
    return setSourceVisibility({ sceneName, sourceName, visible })
  })

  // ── App utilities ─────────────────────────────────────────────────────────
  handle('app:openFile', async ({ filters } = {}) => {
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters ?? []
    })
    return r.canceled ? null : r.filePaths[0]
  })

  // ── Player ────────────────────────────────────────────────────────────────
  handle('player:getState', () => getPlayerState())
  handle('player:getNextClip', () => getNextClipState())
  handle('player:skipNext', () => { broadcastSkipNext(); return null })

  handle('player:play', ({ clipId }) => {
    const queue = getClipsByStatus('approved')
    const clip = queue.find(c => c.id === clipId) ?? queue[0]
    if (!clip) throw new Error('No clips in queue')
    playClip(clip)
    mainWindow.webContents.send('player:state-changed', getPlayerState())
    return getPlayerState()
  })

  handle('player:stop', () => {
    stopPlayer()
    mainWindow.webContents.send('player:state-changed', getPlayerState())
  })

  // ── Settings ──────────────────────────────────────────────────────────────
  handle('settings:get', ({ key }) => getSetting(key))
  handle('settings:set', ({ key, value }) => setSetting(key, value))
  handle('settings:getAll', () => getAllSettings())

  handle('overlay:getUrl', () => getOverlayUrl())
  handle('overlay:sendConfig', ({ config }) => sendOverlayConfig(config))

  handle('clips:getVideoUrl', ({ id }) => getClipVideoUrl(id))

  handle('twitch:fetchNewClips', async () => runAutoFetch(mainWindow))

  // ── Marketplace ───────────────────────────────────────────────────────────

  // ── Collections ───────────────────────────────────────────────────────────
  handle('collections:list', () => {
    const cols = getCollections()
    const approvedIds = new Set(getClipsByStatus('approved').map(c => c.id))
    return cols.map(c => ({ ...c, clipCount: c.clipIds.filter(id => approvedIds.has(id)).length }))
  })

  handle('collections:create', ({ name, color }) => createCollection({ name, color }))

  handle('collections:update', ({ id, name, color }) => updateCollection(id, { name, color }))

  handle('collections:delete', ({ id }) => {
    deleteCollection(id)
    broadcastPlaybackConfigUpdated()
  })

  handle('collections:addClip', ({ collectionId, clipId }) => {
    addClipToCollection(collectionId, clipId)
    broadcastCollectionsUpdated()
  })

  handle('collections:removeClip', ({ collectionId, clipId }) => {
    removeClipFromCollection(collectionId, clipId)
    broadcastCollectionsUpdated()
  })

  handle('collections:getClips', ({ collectionId }) => getCollectionClips(collectionId))

  handle('collections:getMemberships', ({ clipId }) => getCollectionMemberships(clipId))

  // ── Playback config ───────────────────────────────────────────────────────
  handle('playback:getConfig', () => getPlaybackConfig())

  handle('playback:setConfig', (config) => {
    setPlaybackConfig(config)
    broadcastPlaybackConfigUpdated()
  })

  // ── Marketplace ───────────────────────────────────────────────────────────

  handle('marketplace:getSubscribed', () => {
    const saved = getSetting('subscribedApps')
    return Array.isArray(saved) ? saved : []
  })

  handle('marketplace:subscribe', ({ appId }) => {
    const current = getSetting('subscribedApps') ?? []
    if (!current.includes(appId)) setSetting('subscribedApps', [...current, appId])
  })

  handle('marketplace:unsubscribe', ({ appId }) => {
    const current = getSetting('subscribedApps') ?? []
    setSetting('subscribedApps', current.filter(id => id !== appId))
  })

  // ── Shiny Hunt ────────────────────────────────────────────────────────────

  handle('shiny:getDockUrl',       ()                    => getDockUrl())
  handle('shiny:getSourceList',    async ()              => getSourceList())
  handle('shiny:getSceneItemList', async ({ sceneName }) => getSceneItemList(sceneName))

  handle('shiny:showDevice', async ({ deviceId }) => {
    const device     = getShinyDevices().find(d => d.id === deviceId)
    const shinyScene = resolveDeviceShinyScene(deviceId, null)
    if (!device || !shinyScene) throw new Error('Device or shiny scene not configured')
    const allDeviceSources = getShinyDevices().map(d => d.obsSourceName).filter(Boolean)
    await showDeviceInScene({ universalScene: shinyScene, targetSourceName: device.obsSourceName, allDeviceSources })
  })

  handle('shiny:devices:list',   ()                => getShinyDevices())
  handle('shiny:devices:add',    (data)            => addShinyDevice(data))
  handle('shiny:devices:update', ({ id, changes }) => updateShinyDevice(id, changes))
  handle('shiny:devices:remove', ({ id })          => { removeShinyDevice(id); notifyShinyLayoutChanged() })

  handle('shiny:layouts:list',             ()                          => getShinyLayouts())
  handle('shiny:layouts:create',           (data)                      => createShinyLayout(data))
  handle('shiny:layouts:update',           ({ id, changes })           => { const r = updateShinyLayout(id, changes); notifyShinyLayoutChanged(); return r })
  handle('shiny:layouts:setPosition',      ({ id, deviceId, x, y, w, h }) => { const r = setShinyLayoutPosition(id, deviceId, x, y, w, h); notifyShinyLayoutChanged(); return r })
  handle('shiny:layouts:replacePositions', ({ id, positions })             => { const r = replaceShinyLayoutPositions(id, positions); notifyShinyLayoutChanged(); return r })
  handle('shiny:layouts:removeDevice',     ({ id, deviceId })          => { const r = removeDeviceFromShinyLayout(id, deviceId); notifyShinyLayoutChanged(); return r })
  handle('shiny:layouts:remove',           ({ id })                    => { removeShinyLayout(id); notifyShinyLayoutChanged() })
  handle('shiny:layouts:setActive',        ({ id })                    => { setActiveShinyLayout(id); notifyShinyLayoutChanged() })
  handle('shiny:layouts:getActive',        ()                          => getActiveShinyLayout())
  handle('shiny:layouts:getForScene',      ({ sceneName })             => getShinyLayoutForScene(sceneName))
  handle('shiny:layouts:setPositionScene', ({ id, deviceId, shinyScene }) => { const r = setShinyLayoutPositionScene(id, deviceId, shinyScene); notifyShinyLayoutChanged(); return r })

  // ── Chat Triggers ─────────────────────────────────────────────────────────

  setEngineWindow(mainWindow)

  // Set engine opts for timer/OBS triggers (use getters so state is always fresh)
  setEngineOpts({
    sendChatMessage,
    sendAnnouncement,
    sendWhisper,
    mainUser: () => getTwitchState().user,
    botAccount: () => getChatBotAccount(),
    botUsername: () => getChatBotAccount()?.user?.login?.toLowerCase() ?? null,
    obsGetSceneItemList: getSceneItemList,
    getChatTriggers,
    fetchStream: (login) => fetchCurrentStream(login),
    updateTrigger: (id, changes) => updateChatTrigger(id, changes),
  })

  // Wire up incoming chat messages → trigger runner
  onChatMessage(async (msg) => {
    const state = getTwitchState()
    const triggers = getChatTriggers().filter(t => t.enabled)
    const bot = getChatBotAccount()
    const sceneBlacklist = getSetting('sceneBlacklist') ?? {}
    await runTriggers(msg, triggers, {
      sendChatMessage,
      sendAnnouncement,
      sendWhisper,
      fetchFollowage: fetchFollowageApi,
      fetchUserByLogin,
      mainUser: state.user,
      botAccount: bot,
      obsGetSceneItemList: getSceneItemList,
      obsSetSourceVisibility: setSourceVisibility,
      obsPlayVideoInSource: playVideoInSource,
      getCurrentScene,
      globalSceneBlacklist: sceneBlacklist,
    })
  })

  // Wire up OBS source state changes → OBS source triggers
  onSceneItemEnableStateChanged((data) => handleOBSSourceChange(data))

  handle('chatTriggers:list', () => getChatTriggers())
  handle('chatTriggers:create', (trigger) => {
    const created = createChatTrigger(trigger)
    syncTimerTrigger(created)
    return created
  })
  handle('chatTriggers:update', ({ id, changes }) => {
    // When toggling a trigger in auto mode, record a manual override instead of just writing enabled.
    // Only apply when enabled is actually changing to avoid full-saves from the editor creating spurious overrides.
    if ('enabled' in changes) {
      const existing = getChatTriggers().find(t => t.id === id)
      if (existing?.activation?.mode === 'auto' && changes.enabled !== existing.enabled) {
        const activation = { ...existing.activation, currentOverride: changes.enabled }
        const updated = updateChatTrigger(id, { ...changes, activation })
        if (updated) syncTimerTrigger(updated)
        return updated
      }
    }
    const updated = updateChatTrigger(id, changes)
    if (updated) syncTimerTrigger(updated)
    return updated
  })
  handle('chatTriggers:delete', ({ id }) => {
    syncTimerTrigger({ id, type: 'timer', enabled: false })
    return deleteChatTrigger(id)
  })

  handle('chatTriggers:getStatus', () => getChatEngineStatus())

  handle('chatTriggers:start', () => {
    const state = getTwitchState()
    if (!state.user || !state.accessToken) throw new Error('Not authenticated with Twitch')
    const bot = getChatBotAccount()
    startChatEngine(state.user.login, state.accessToken, state.user.login, state.user.id, bot?.user?.id ?? null, bot?.token ?? null)
    startTimerTriggers(getChatTriggers().filter(t => t.enabled))
    startStreamPolling()
    return getChatEngineStatus()
  })

  handle('chatTriggers:stop', () => {
    stopTimerTriggers()
    stopStreamPolling()
    stopChatEngine()
    return getChatEngineStatus()
  })

  handle('stream:getState', () => getStreamState())

  handle('chatTriggers:getScopes', () => validateTokenScopes())
  handle('chatTriggers:getBotScopes', () => validateBotTokenScopes(getChatBotAccount()?.token))

  handle('chatTriggers:reauth', async () => {
    const user = await startOAuthFlow()
    if (user) {
      upsertChannel({ name: user.login, display_name: user.display_name, broadcaster_id: user.id, is_own: 1 })
      mainWindow.webContents.send('twitch:auth-changed', { user })
    }
    return user
  })

  handle('chatTriggers:getBotAccount', () => {
    const bot = getChatBotAccount()
    return bot ? { login: bot.user?.login, displayName: bot.user?.display_name, avatar: bot.user?.profile_image_url } : null
  })

  handle('chatTriggers:loginBot', async () => {
    const bot = await startBotOAuthFlow()
    return { login: bot.user?.login, displayName: bot.user?.display_name, avatar: bot.user?.profile_image_url }
  })

  handle('chatTriggers:logoutBot', async () => {
    await logoutBotAccount()
    return null
  })

  handle('chatTriggers:getCustomRewards', async () => {
    const state = getTwitchState()
    if (!state.user?.id) return []
    const mainRewards = (await fetchCustomRewards(state.user.id, state.accessToken))
      .map(r => ({ ...r, channelLogin: state.user.login }))
    const bot = getChatBotAccount()
    const botRewards = bot?.user?.id && bot?.token
      ? (await fetchCustomRewards(bot.user.id, bot.token)).map(r => ({ ...r, channelLogin: bot.user.login }))
      : []
    return [...mainRewards, ...botRewards]
  })

  handle('chatTriggers:testTrigger', ({ trigger, text, username }) => {
    return dryRunTrigger(trigger, text, username)
  })

  handle('chatTriggers:testMessage', ({ text, username }) => {
    const triggers = getChatTriggers()
    const fakeMsg = {
      username: username?.toLowerCase() ?? 'testuser',
      displayName: username ?? 'testuser',
      userId: '0',
      text,
      badges: {},
      isMod: false,
      isSubscriber: false,
      isVip: false,
      isBroadcaster: false,
    }
    return triggers.map(t => ({ id: t.id, name: t.name, matches: !!matchTrigger({ ...t, enabled: true }, fakeMsg) }))
  })

  // Auto-start engine if it was previously running
  if (getSetting('chatEngineAutoStart')) {
    const state = getTwitchState()
    if (state.user && state.accessToken) {
      const bot = getChatBotAccount()
      startChatEngine(state.user.login, state.accessToken, state.user.login, state.user.id, bot?.user?.id ?? null, bot?.token ?? null)
      startTimerTriggers(getChatTriggers().filter(t => t.enabled))
    }
  }

  // ── Updates ────────────────────────────────────────────────────────────────

  handle('app:getUpdateState', () => {
    const updateInfo = autoUpdater.updateInfo
    return {
      hasUpdate: !!updateInfo,
      version: updateInfo?.version,
      currentVersion: app.getVersion()
    }
  })

  handle('app:installUpdate', () => {
    autoUpdater.quitAndInstall()
  })
}
