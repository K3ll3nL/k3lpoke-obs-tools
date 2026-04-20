import { contextBridge, ipcRenderer } from 'electron'

function invoke(channel, data) {
  return ipcRenderer.invoke(channel, data)
}

contextBridge.exposeInMainWorld('api', {
  // Twitch
  twitch: {
    getState: () => invoke('twitch:getState'),
    setClientId: (id) => invoke('twitch:setClientId', id),
    login: () => invoke('twitch:login'),
    logout: () => invoke('twitch:logout'),
    fetchClips: (opts) => invoke('twitch:fetchClips', opts),
    fetchAllChannels: () => invoke('twitch:fetchAllChannels'),
    fetchNewClips: () => invoke('twitch:fetchNewClips'),
    onAuthChanged: (cb) => ipcRenderer.on('twitch:auth-changed', (_, d) => cb(d)),
    onNewClips: (cb) => ipcRenderer.on('twitch:new-clips', (_, d) => cb(d))
  },

  // Clips
  clips: {
    getQueue: () => invoke('clips:getQueue'),
    getPending: () => invoke('clips:getPending'),
    getAll: (broadcasterName) => invoke('clips:getAll', { broadcasterName }),
    getNew: (since) => invoke('clips:getNew', { since }),
    setVolume: (id, volume) => invoke('clips:setVolume', { id, volume }),
    setTrim: (id, trimStart, trimEnd) => invoke('clips:setTrim', { id, trimStart, trimEnd }),
    setEnvelope: (id, envelope) => invoke('clips:setEnvelope', { id, envelope }),
    getVideoUrl: (id) => invoke('clips:getVideoUrl', { id }),
    approve: (id) => invoke('clips:approve', { id }),
    deny: (id) => invoke('clips:deny', { id }),
    bulkApprove: (ids) => invoke('clips:bulkApprove', { ids }),
    bulkDeny: (ids) => invoke('clips:bulkDeny', { ids }),
    remove: (id) => invoke('clips:remove', { id }),
    reorder: (ids) => invoke('clips:reorder', { ids })
  },

  // Channels
  channels: {
    list: () => invoke('channels:list'),
    add: (name, isOwn) => invoke('channels:add', { name, isOwn }),
    remove: (name) => invoke('channels:remove', { name })
  },

  // OBS
  obs: {
    connect: (opts) => invoke('obs:connect', opts),
    disconnect: () => invoke('obs:disconnect'),
    getStatus: () => invoke('obs:getStatus'),
    getScenes: () => invoke('obs:getScenes'),
    addBrowserSource: (sceneName) => invoke('obs:addBrowserSource', { sceneName }),
    onStatusChanged: (cb) => ipcRenderer.on('obs:status-changed', (_, d) => cb(d))
  },

  // Player
  player: {
    getState: () => invoke('player:getState'),
    play: (clipId) => invoke('player:play', { clipId }),
    stop: () => invoke('player:stop'),
    onStateChanged: (cb) => ipcRenderer.on('player:state-changed', (_, d) => cb(d)),
    onNowPlaying: (cb) => ipcRenderer.on('player:now-playing', (_, d) => cb(d))
  },

  // Settings
  settings: {
    get: (key) => invoke('settings:get', { key }),
    set: (key, value) => invoke('settings:set', { key, value }),
    getAll: () => invoke('settings:getAll')
  },

  // Overlay
  overlay: {
    getUrl: () => invoke('overlay:getUrl'),
    sendConfig: (config) => invoke('overlay:sendConfig', { config })
  },

  // Marketplace
  marketplace: {
    getSubscribed: () => invoke('marketplace:getSubscribed'),
    subscribe:     (appId) => invoke('marketplace:subscribe', { appId }),
    unsubscribe:   (appId) => invoke('marketplace:unsubscribe', { appId }),
  }
})
