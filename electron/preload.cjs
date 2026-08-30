'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('yinyunClient', {
  getState: () => ipcRenderer.invoke('client:get-state'),
  testServer: serverUrl => ipcRenderer.invoke('client:test-server', serverUrl),
  login: options => ipcRenderer.invoke('client:login', options),
  openPlayer: () => ipcRenderer.invoke('client:open-player'),
  openSyncCenter: () => ipcRenderer.invoke('client:open-sync-center'),
  search: options => ipcRenderer.invoke('player:search', options),
  searchEntities: options => ipcRenderer.invoke('player:search-entities', options),
  resolveTrack: options => ipcRenderer.invoke('player:resolve-track', options),
  getLyrics: track => ipcRenderer.invoke('player:get-lyrics', track),
  getPlaylists: () => ipcRenderer.invoke('player:get-playlists'),
  getPlaylist: id => ipcRenderer.invoke('player:get-playlist', id),
  createPlaylist: name => ipcRenderer.invoke('player:create-playlist', name),
  renamePlaylist: (id, name) => ipcRenderer.invoke('player:rename-playlist', { id, name }),
  deletePlaylist: id => ipcRenderer.invoke('player:delete-playlist', id),
  addToPlaylist: (id, track) => ipcRenderer.invoke('player:add-to-playlist', { id, track }),
  removeFromPlaylist: (id, trackId) => ipcRenderer.invoke('player:remove-from-playlist', { id, trackId }),
  getLeaderboards: source => ipcRenderer.invoke('player:get-leaderboards', source),
  getLeaderboardTracks: options => ipcRenderer.invoke('player:get-leaderboard-tracks', options),
  getLibrary: type => ipcRenderer.invoke('player:get-library', type),
  getLibraryTracks: options => ipcRenderer.invoke('player:get-library-tracks', options),
  saveLibrary: (type, items) => ipcRenderer.invoke('player:save-library', { type, items }),
  getEntityDetail: options => ipcRenderer.invoke('player:get-entity-detail', options),
  chooseDownloadDirectory: () => ipcRenderer.invoke('player:choose-download-directory'),
  downloadTrack: (track, quality) => ipcRenderer.invoke('player:download-track', { track, quality }),
  getXiaoaiState: () => ipcRenderer.invoke('xiaoai:get-state'),
  startXiaoaiLogin: () => ipcRenderer.invoke('xiaoai:start-login'),
  pollXiaoaiLogin: () => ipcRenderer.invoke('xiaoai:poll-login'),
  getXiaoaiDevices: () => ipcRenderer.invoke('xiaoai:get-devices'),
  selectXiaoaiDevice: deviceId => ipcRenderer.invoke('xiaoai:select-device', deviceId),
  xiaoaiPlay: (url, options) => ipcRenderer.invoke('xiaoai:play', url, options),
  xiaoaiPause: () => ipcRenderer.invoke('xiaoai:pause'),
  xiaoaiResume: () => ipcRenderer.invoke('xiaoai:resume'),
  xiaoaiStop: () => ipcRenderer.invoke('xiaoai:stop'),
  setXiaoaiVolume: volume => ipcRenderer.invoke('xiaoai:set-volume', volume),
  getXiaoaiStatus: () => ipcRenderer.invoke('xiaoai:get-status'),
  getXiaoaiConversations: limit => ipcRenderer.invoke('xiaoai:get-conversations', limit),
  logoutXiaoai: () => ipcRenderer.invoke('xiaoai:logout'),
  onDownloadProgress: callback => {
    const handler = (_event, value) => callback(value)
    ipcRenderer.on('player:download-progress', handler)
    return () => ipcRenderer.removeListener('player:download-progress', handler)
  },
  backup: () => ipcRenderer.invoke('client:backup'),
  restore: () => ipcRenderer.invoke('client:restore'),
  exportBackup: () => ipcRenderer.invoke('client:export'),
  importBackup: () => ipcRenderer.invoke('client:import'),
  savePreferences: preferences => ipcRenderer.invoke('client:save-preferences', preferences),
  logout: () => ipcRenderer.invoke('client:logout'),
  removeServer: () => ipcRenderer.invoke('client:remove-server'),
  openExternal: url => ipcRenderer.invoke('client:open-external', url),
  onState: callback => {
    const handler = (_event, value) => callback(value)
    ipcRenderer.on('client:state', handler)
    return () => ipcRenderer.removeListener('client:state', handler)
  },
})
