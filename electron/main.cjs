'use strict'

const path = require('node:path')
const fs = require('node:fs')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  safeStorage,
  shell,
  Tray,
} = require('electron')
const { createApiClient } = require('./api.cjs')
const { createConfigStore } = require('./config.cjs')
const { createSecureJsonStore } = require('./secure-store.cjs')
const { createSnapshotStore } = require('./snapshot-store.cjs')
const { createDownloadParts, getDownloadExtension, getUniqueDownloadPath, trackForDownload } = require('./download.cjs')
const { normalizeServerUrl, readCapabilities } = require('./url.cjs')
const { compareVersions, isReleaseUrl, LATEST_RELEASE_API, parseLatestRelease } = require('./update.cjs')
const { createXiaoaiManager } = require('./xiaoai.cjs')
const { XiaoaiRelay } = require('./xiaoai-relay.cjs')
const { allowXiaoaiRelay } = require('./firewall.cjs')
const ffmpeg = require('@ffmpeg-installer/ffmpeg')
const packageMetadata = require('../package.json')

const REQUEST_TIMEOUT_MS = 12_000
const SNAPSHOT_INTERVAL_MS = 30_000
const APP_REPOSITORY = 'https://github.com/bobcc4/yinyun-windows'
const MIN_SERVER_API_VERSION = '1.4.0'
const APP_VERSION = String(packageMetadata.version || '0.0.0')

app.setName('音云')
if (!app.requestSingleInstanceLock()) {
  dialog.showErrorBox(
    '音云已在运行',
    '检测到另一个音云 Windows 客户端正在运行。请先从系统托盘完全退出旧版，再启动新版。',
  )
  app.quit()
}
app.setVersion(APP_VERSION)

const userDataPath = app.getPath('userData')
const configStore = createConfigStore(userDataPath)
const cryptoProvider = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: value => safeStorage.encryptString(value),
  decrypt: value => safeStorage.decryptString(value),
}
const credentialStore = createSecureJsonStore(path.join(userDataPath, 'account.json'), cryptoProvider)
const xiaoaiStore = createSecureJsonStore(path.join(userDataPath, 'xiaoai-account.json'), cryptoProvider)
const snapshotStore = createSnapshotStore(userDataPath, cryptoProvider)
// Electron net.fetch may return an incomplete Xiaomi account response in the
// main process. The standards-compliant global fetch keeps the QR login flow
// consistent with the tested Node implementation.
const xiaoaiManager = createXiaoaiManager({ fetchImpl: globalThis.fetch, store: xiaoaiStore })
const xiaoaiRelay = new XiaoaiRelay(net.fetch, undefined, undefined, ffmpeg.path)
if (configStore.read().disableAcceleration) app.disableHardwareAcceleration()

let tray = null
let playerWindow = null
let setupWindow = null
let apiClient = null
let currentAccount = null
let snapshotTimer = null
let quitting = false
let connectionState = { status: 'idle', message: '尚未登录' }
let syncState = { status: 'idle', message: '等待登录', local: null, server: null }
let availableUpdate = null

function getIcon() {
  return nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'))
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await net.fetch(url, { cache: 'no-store', redirect: 'follow', ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function checkForClientUpdate() {
  try {
    const response = await fetchWithTimeout(LATEST_RELEASE_API)
    if (!response.ok) return
    const release = parseLatestRelease(await response.json())
    if (!release || compareVersions(app.getVersion(), release.version) >= 0) {
      availableUpdate = null
      sendState()
      return
    }
    availableUpdate = release
    sendState()
    if (configStore.read().lastUpdateVersion === release.version) return

    const options = {
      type: 'info',
      title: '音云客户端更新',
      message: `发现新版本 ${release.version}`,
      detail: `当前版本：${app.getVersion()}\n新版本：${release.version}`,
      buttons: ['前往下载', '稍后'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }
    const parent = playerWindow && !playerWindow.isDestroyed()
      ? playerWindow
      : setupWindow && !setupWindow.isDestroyed() ? setupWindow : null
    const result = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
    configStore.write({ lastUpdateVersion: release.version })
    if (result.response === 0) await shell.openExternal(release.url)
  } catch (error) {
    console.warn('[Update] Client update check failed:', error.message)
  }
}

async function discoverServer(input) {
  const serverUrl = normalizeServerUrl(input)
  let response
  try {
    response = await fetchWithTimeout(`${serverUrl}/api/v1/capabilities`)
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('连接超时，请检查服务器地址或网络')
    throw new Error(`无法连接服务器：${error.message}`)
  }
  if (!response.ok) throw new Error(`服务器返回 HTTP ${response.status}`)
  if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    throw new Error('返回内容不是音云接口，请检查反向代理或第三方验证设置')
  }
  const raw = await response.json()
  const capabilities = readCapabilities(raw)
  const data = raw && raw.data ? raw.data : raw
  if (compareVersions(capabilities.apiVersion, MIN_SERVER_API_VERSION) < 0) {
    throw new Error(`服务端 API 版本过低，需要 ${MIN_SERVER_API_VERSION} 或更高版本`)
  }
  if (!data.features || !data.features.accountSync || data.features.accountSync.restore !== true) {
    throw new Error('服务端版本过旧，不支持账户同步恢复')
  }
  return {
    serverUrl,
    version: capabilities.version,
    apiVersion: capabilities.apiVersion,
  }
}

function setConnectionState(status, message, details = {}) {
  connectionState = { status, message, ...details }
  sendState()
  rebuildTrayMenu()
}

function setSyncState(status, message, details = {}) {
  syncState = { status, message, ...details }
  sendState()
}

function sendState() {
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.webContents.send('client:state', getPublicState())
  if (playerWindow && !playerWindow.isDestroyed()) playerWindow.webContents.send('client:state', getPublicState())
}

function snapshotSummary(value) {
  if (!value || !value.snapshot) return null
  return {
    savedAt: value.savedAt,
    revision: value.snapshot.revision,
    empty: value.snapshot.empty,
    stats: value.snapshot.stats,
  }
}

function getPublicState() {
  const config = configStore.read()
  const local = config.serverUrl && config.username ? snapshotStore.read(config.serverUrl, config.username) : null
  return {
    config,
    connection: connectionState,
    sync: { status: syncState.status, message: syncState.message, local: snapshotSummary(local) },
    account: currentAccount ? { username: currentAccount.username, serverUrl: currentAccount.serverUrl } : null,
    appVersion: APP_VERSION,
    availableUpdate,
    repository: APP_REPOSITORY,
    xiaoai: xiaoaiManager.state(),
  }
}

function createPlayerWindow() {
  const config = configStore.read()
  const window = new BrowserWindow({
    title: '音云',
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    icon: getIcon(),
    autoHideMenuBar: true,
    backgroundColor: '#f5f7f6',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.setAudioMuted(false)
  window.on('page-title-updated', event => event.preventDefault())
  window.on('close', event => {
    if (quitting) return
    if (config.minimizeToTray) {
      event.preventDefault()
      window.hide()
      return
    }
    quitting = true
    app.quit()
  })
  window.on('closed', () => { playerWindow = null })
  window.webContents.on('render-process-gone', (_event, details) => {
    if (quitting || details.reason === 'clean-exit') return
    setConnectionState('error', `播放器进程已停止：${details.reason}`)
    showSetupWindow()
  })
  window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3 || quitting) return
    setConnectionState('error', `页面加载失败：${description} (${code})`)
    window.hide()
    showSetupWindow()
  })
  return window
}

async function openPlayerWindow(show = true) {
  if (!currentAccount) {
    showSetupWindow()
    return { success: false, error: '请先登录同步账户' }
  }
  if (playerWindow && !playerWindow.isDestroyed()) {
    if (show) {
      playerWindow.show()
      if (playerWindow.isMinimized()) playerWindow.restore()
      playerWindow.focus()
    }
    return { success: true }
  }
  playerWindow = createPlayerWindow()
  try {
    await playerWindow.loadFile(path.join(__dirname, '..', 'renderer', 'player.html'))
    if (setupWindow && !setupWindow.isDestroyed()) setupWindow.hide()
    if (show) {
      playerWindow.show()
      playerWindow.focus()
    }
    return { success: true }
  } catch (error) {
    playerWindow.destroy()
    setConnectionState('error', error.message)
    showSetupWindow()
    return { success: false, error: error.message }
  }
}

async function pullSnapshot({ preserveRecovery = true } = {}) {
  if (!currentAccount || !apiClient) throw new Error('请先登录同步账户')
  setSyncState('syncing', '正在从服务端读取同步数据')
  const snapshot = await apiClient.getSnapshot()
  const local = snapshotStore.read(currentAccount.serverUrl, currentAccount.username)
  if (snapshot.empty && preserveRecovery && local && local.snapshot && !local.snapshot.empty) {
    setSyncState('recovery', '服务端为空，本地保留了可恢复的数据', { server: snapshot })
    return { snapshot, local, recoveryAvailable: true }
  }
  const saved = snapshotStore.write(currentAccount.serverUrl, currentAccount.username, snapshot)
  setSyncState('ready', '本地同步快照已更新', { server: snapshot, savedAt: saved.savedAt })
  return { snapshot, local: saved, recoveryAvailable: false }
}

async function restoreLocalSnapshot() {
  if (!currentAccount || !apiClient) throw new Error('请先登录同步账户')
  const local = snapshotStore.read(currentAccount.serverUrl, currentAccount.username)
  if (!local || !local.snapshot) throw new Error('当前账户没有本地同步快照')
  const server = await apiClient.getSnapshot()
  const stats = local.snapshot.stats || { playlists: 0, tracks: 0, dislikeRules: 0, sources: 0 }
  const messageOptions = {
    type: 'warning',
    title: '恢复同步数据',
    message: server.empty ? '服务端当前为空，是否使用本地数据恢复？' : '服务端已有数据，是否使用本地数据覆盖？',
    detail: `将恢复 ${stats.playlists || 0} 个歌单、${stats.tracks || 0} 条歌单歌曲记录、${stats.dislikeRules || 0} 条不喜欢规则和 ${stats.sources || 0} 个自有音源。音源恢复后默认禁用。`,
    buttons: ['确认恢复', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  }
  const parent = setupWindow && !setupWindow.isDestroyed()
    ? setupWindow
    : playerWindow && !playerWindow.isDestroyed() ? playerWindow : null
  const result = parent ? await dialog.showMessageBox(parent, messageOptions) : await dialog.showMessageBox(messageOptions)
  if (result.response !== 0) return { success: false, cancelled: true }

  setSyncState('syncing', '正在恢复本地同步数据')
  const restored = await apiClient.restoreSnapshot(local.snapshot, {
    expectedEmpty: server.empty,
    expectedRevision: server.empty ? undefined : server.revision,
  })
  snapshotStore.write(currentAccount.serverUrl, currentAccount.username, restored)
  setSyncState('ready', '本地同步数据已恢复到服务端', { server: restored })
  if (playerWindow && !playerWindow.isDestroyed()) playerWindow.reload()
  return { success: true, snapshot: restored }
}

function startSnapshotTimer() {
  if (snapshotTimer) clearInterval(snapshotTimer)
  snapshotTimer = setInterval(() => {
    if (!currentAccount) return
    void pullSnapshot().catch(error => setSyncState('error', `同步快照更新失败：${error.message}`))
  }, SNAPSHOT_INTERVAL_MS)
}

async function loginToServer(options = {}) {
  const username = String(options.username || '').trim().toLowerCase()
  const password = String(options.password || '')
  if (!username || !password) return { success: false, error: '请输入同步账户用户名和密码' }
  setConnectionState('connecting', '正在验证服务器和同步账户')
  try {
    const discovered = await discoverServer(options.serverUrl)
    const client = createApiClient(net.fetch, discovered.serverUrl)
    await client.login(username, password)
    apiClient = client
    currentAccount = { ...discovered, username }
    credentialStore.write({ serverUrl: discovered.serverUrl, username, password })
    configStore.write({
      serverUrl: discovered.serverUrl,
      username,
      ...(options.preferences || {}),
    })
    setConnectionState('connected', `已登录 ${username}`, discovered)
    const sync = await pullSnapshot()
    startSnapshotTimer()

    if (sync.recoveryAvailable) {
      const stats = sync.local.snapshot.stats || { playlists: 0, tracks: 0, dislikeRules: 0, sources: 0 }
      const recoveryOptions = {
        type: 'question',
        title: '发现本地同步数据',
        message: '新服务端账户当前为空，是否恢复客户端保存的数据？',
        detail: `本地快照包含 ${stats.playlists || 0} 个歌单、${stats.tracks || 0} 条歌单歌曲记录、${stats.dislikeRules || 0} 条不喜欢规则和 ${stats.sources || 0} 个自有音源。`,
        buttons: ['恢复并打开', '暂不恢复，打开空账户', '留在同步中心'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      }
      const choice = setupWindow && !setupWindow.isDestroyed()
        ? await dialog.showMessageBox(setupWindow, recoveryOptions)
        : await dialog.showMessageBox(recoveryOptions)
      if (choice.response === 0) await restoreLocalSnapshot()
      if (choice.response === 2) return { success: true, recoveryAvailable: true, ...discovered }
    }

    if (options.openPlayer !== false) await openPlayerWindow(true)
    return { success: true, recoveryAvailable: sync.recoveryAvailable, ...discovered }
  } catch (error) {
    apiClient = null
    currentAccount = null
    setConnectionState('error', error.message)
    return { success: false, error: error.message }
  }
}

async function clearCurrentLogin({ removeServer = false } = {}) {
  if (snapshotTimer) clearInterval(snapshotTimer)
  snapshotTimer = null
  currentAccount = null
  apiClient = null
  credentialStore.remove()
  if (playerWindow && !playerWindow.isDestroyed()) playerWindow.destroy()
  if (removeServer) configStore.write({ serverUrl: '', username: '' })
  setConnectionState('idle', '尚未登录')
  setSyncState('idle', '等待登录')
}

function rebuildTrayMenu() {
  if (!tray) return
  const config = configStore.read()
  const statusLabel = currentAccount ? `已登录 ${currentAccount.username}` : connectionState.message
  tray.setToolTip(`音云 - ${statusLabel}`)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: '打开播放器', click: () => void openPlayerWindow(true), enabled: !!currentAccount },
    { label: '同步中心', click: showSetupWindow },
    { label: '立即备份同步数据', click: () => void pullSnapshot(), enabled: !!currentAccount },
    { type: 'separator' },
    { label: '退出同步账户', click: () => void clearCurrentLogin(), enabled: !!currentAccount },
    {
      label: '开机自动启动', type: 'checkbox', checked: config.launchAtLogin,
      click: item => savePreferences({ launchAtLogin: item.checked }),
    },
    {
      label: '启动后最小化到托盘', type: 'checkbox', checked: config.startMinimized,
      click: item => savePreferences({ startMinimized: item.checked }),
    },
    {
      label: '关闭窗口时最小化到托盘', type: 'checkbox', checked: config.minimizeToTray,
      click: item => savePreferences({ minimizeToTray: item.checked }),
    },
    { type: 'separator' },
    { label: '项目主页', click: () => void shell.openExternal(APP_REPOSITORY) },
    { label: '完全退出', click: () => { quitting = true; app.quit() } },
  ]))
}

function savePreferences(preferences = {}) {
  const allowed = {}
  for (const key of ['minimizeToTray', 'startMinimized', 'launchAtLogin', 'disableAcceleration', 'playbackQuality', 'volume', 'downloadDirectory']) {
    if (key === 'playbackQuality' && typeof preferences[key] === 'string') allowed[key] = preferences[key]
    else if (key === 'volume' && typeof preferences[key] === 'number') allowed[key] = preferences[key]
    else if (key === 'downloadDirectory' && typeof preferences[key] === 'string') allowed[key] = preferences[key]
    if (typeof preferences[key] === 'boolean') allowed[key] = preferences[key]
  }
  const config = configStore.write(allowed)
  app.setLoginItemSettings({ openAtLogin: config.launchAtLogin, args: config.launchAtLogin ? ['--hidden'] : [] })
  rebuildTrayMenu()
  return config
}

async function chooseDownloadDirectory() {
  const result = await dialog.showOpenDialog(playerWindow || setupWindow, {
    title: '选择 Windows 本地下载目录',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return { success: false, cancelled: true }
  const directory = path.resolve(result.filePaths[0])
  configStore.write({ downloadDirectory: directory })
  return { success: true, directory }
}

async function downloadTrackLocally(sender, value = {}) {
  if (!apiClient || !currentAccount) throw new Error('请先登录同步账户')
  const inputTrack = value.track || value
  const track = trackForDownload(inputTrack)
  const downloadId = String(value.track?.localTrackId || value.track?.id || track.id || track.songmid || track.hash || Date.now())
  const quality = value.quality || configStore.read().playbackQuality
  let directory = configStore.read().downloadDirectory
  if (!directory) {
    const selected = await chooseDownloadDirectory()
    if (!selected.success) return selected
    directory = selected.directory
  }
  const resolved = await apiClient.resolveTrack(inputTrack, quality)
  const normalized = trackForDownload(resolved.track || track)
  const actualQuality = resolved.quality || quality
  const response = await net.fetch(resolved.url, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`下载地址返回 HTTP ${response.status}`)
  const parts = createDownloadParts(normalized, actualQuality)
  const extension = getDownloadExtension(resolved.url, actualQuality, response.headers.get('content-type'))
  const { directory: targetDirectory, targetPath } = getUniqueDownloadPath(directory, parts, extension, fs.existsSync)
  await fs.promises.mkdir(targetDirectory, { recursive: true })
  const temporaryPath = `${targetPath}.part`
  const total = Number(response.headers.get('content-length')) || 0
  let received = 0
  let lastProgressAt = 0
  const stream = Readable.fromWeb(response.body)
  const output = fs.createWriteStream(temporaryPath)
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length
      const now = Date.now()
      if (now - lastProgressAt >= 250) {
        lastProgressAt = now
        sender.send('player:download-progress', { id: downloadId, status: 'downloading', title: parts.title, artist: parts.artist, album: parts.album, quality: actualQuality, source: resolved.actualSource || track.source, received, total, path: targetPath })
      }
      callback(null, chunk)
    },
  })
  try {
    await pipeline(stream, progress, output)
    await fs.promises.rename(temporaryPath, targetPath)
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true })
    sender.send('player:download-progress', { id: downloadId, status: 'failed', title: parts.title, artist: parts.artist, album: parts.album, quality: actualQuality, source: resolved.actualSource || track.source, received, total, path: targetPath, error: error.message })
    throw error
  }
  sender.send('player:download-progress', { id: downloadId, status: 'completed', title: parts.title, artist: parts.artist, album: parts.album, quality: actualQuality, source: resolved.actualSource || track.source, received, total, path: targetPath })
  return { success: true, path: targetPath, quality: resolved.quality, source: resolved.actualSource }
}

function createSetupWindow() {
  const window = new BrowserWindow({
    title: '音云 - 同步中心',
    width: 980,
    height: 720,
    minWidth: 820,
    minHeight: 640,
    icon: getIcon(),
    autoHideMenuBar: true,
    backgroundColor: '#f4f7f5',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  window.loadFile(path.join(__dirname, '..', 'renderer', 'setup.html'))
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.on('closed', () => { setupWindow = null })
  return window
}

function showSetupWindow() {
  if (!setupWindow || setupWindow.isDestroyed()) {
    setupWindow = createSetupWindow()
    setupWindow.once('ready-to-show', () => {
      if (!setupWindow || setupWindow.isDestroyed()) return
      setupWindow.show()
      setupWindow.focus()
    })
    return
  }
  setupWindow.show()
  setupWindow.focus()
}

function registerIpc() {
  ipcMain.handle('client:get-state', () => getPublicState())
  ipcMain.handle('client:test-server', async (_event, serverUrl) => {
    try { return { success: true, ...(await discoverServer(serverUrl)) } } catch (error) { return { success: false, error: error.message } }
  })
  ipcMain.handle('client:login', (_event, options) => loginToServer({ ...options, openPlayer: true }))
  ipcMain.handle('client:open-player', () => openPlayerWindow(true))
  ipcMain.handle('client:open-sync-center', () => { showSetupWindow(); return { success: true } })
  const requireApi = () => {
    if (!apiClient || !currentAccount) throw new Error('登录状态已失效，请重新登录')
    return apiClient
  }
  ipcMain.handle('player:search', (_event, options = {}) => requireApi().search(
    String(options.query || '').trim(), options.source || 'tx', options.page || 1, options.limit || 30,
  ))
  ipcMain.handle('player:search-entities', (_event, options = {}) => requireApi().searchEntities(
    String(options.query || '').trim(), options.type, options.source || 'tx', options.page || 1, options.limit || 30,
  ))
  ipcMain.handle('player:resolve-track', (_event, options = {}) => requireApi().resolveTrack(
    options.track, options.quality || configStore.read().playbackQuality, { preferOnline: options.preferOnline === true },
  ))
  ipcMain.handle('player:get-lyrics', (_event, track) => requireApi().getLyrics(track))
  ipcMain.handle('player:get-playlists', () => requireApi().getPlaylists())
  ipcMain.handle('player:get-playlist', (_event, id) => requireApi().getPlaylist(id))
  ipcMain.handle('player:create-playlist', (_event, name) => requireApi().createPlaylist(name))
  ipcMain.handle('player:rename-playlist', (_event, value) => requireApi().renamePlaylist(value.id, value.name))
  ipcMain.handle('player:delete-playlist', (_event, id) => requireApi().deletePlaylist(id))
  ipcMain.handle('player:add-to-playlist', (_event, value) => requireApi().addTracks(value.id, [value.track]))
  ipcMain.handle('player:remove-from-playlist', (_event, value) => requireApi().removeTrack(value.id, value.trackId))
  ipcMain.handle('player:get-leaderboards', (_event, source) => requireApi().getLeaderboards(source || 'tx'))
  ipcMain.handle('player:get-leaderboard-tracks', (_event, options = {}) => requireApi().getLeaderboardTracks(options.source || 'tx', options.boardId, options.page || 1))
  ipcMain.handle('player:get-library', (_event, type) => requireApi().getLibrary(type))
  ipcMain.handle('player:get-library-tracks', (_event, options = {}) => requireApi().getLibraryTracks(options.page || 1, options.limit || 500, String(options.query || '').trim()))
  ipcMain.handle('player:save-library', (_event, value) => requireApi().saveLibrary(value.type, value.items))
  ipcMain.handle('player:get-entity-detail', (_event, value = {}) => requireApi().getEntityDetail(
    value.kind, value.id, value.source || 'tx', { name: value.name, artist: value.artist },
  ))
  ipcMain.handle('player:choose-download-directory', chooseDownloadDirectory)
  ipcMain.handle('player:download-track', (event, value) => downloadTrackLocally(event.sender, value))
  ipcMain.handle('xiaoai:get-state', () => xiaoaiManager.state())
  ipcMain.handle('xiaoai:start-login', () => xiaoaiManager.startLogin())
  ipcMain.handle('xiaoai:poll-login', () => xiaoaiManager.pollLogin())
  ipcMain.handle('xiaoai:get-devices', () => xiaoaiManager.devices())
  ipcMain.handle('xiaoai:select-device', (_event, deviceId) => xiaoaiManager.selectDevice(String(deviceId || '')))
  ipcMain.handle('xiaoai:play', async (_event, url, options = {}) => {
    // Stop the previous device session before replacing its relay stream.
    if (xiaoaiRelay.isRunning()) {
      try { await xiaoaiManager.stop() } catch {}
    }
    const requestedSources = Array.isArray(options.sources) && options.sources.length
      ? options.sources.slice(0, 1)
      : Array.isArray(url) ? url.slice(0, 1) : [{ url: String(url || '') }]
    const relayResult = await xiaoaiRelay.start(requestedSources, {
      offsetSeconds: Math.max(0, Number(options.offsetSeconds) || 0),
      durationSeconds: Math.max(0, Number(options.durationSeconds) || 0),
      transcode: options.transcode === true,
    })
    const relayUrls = Array.isArray(relayResult) ? relayResult : [relayResult]
    const playableSources = relayUrls.map((relayUrl, index) => ({ ...requestedSources[index], url: relayUrl }))
    try {
      await xiaoaiManager.play(playableSources[0].url)
      try {
        await xiaoaiRelay.waitUntilStreaming()
      } catch (error) {
        const parent = playerWindow && !playerWindow.isDestroyed() ? playerWindow : null
        const options = {
          type: 'warning',
          title: '允许小爱音箱访问',
          message: 'Windows 防火墙阻止了小爱音箱连接',
          detail: '音云需要开放 TCP 39781 端口，仅允许同一局域网内的设备访问。确认后 Windows 会显示一次管理员授权窗口。',
          buttons: ['授权并重试', '取消'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        }
        const choice = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
        if (choice.response !== 0) throw error
        await allowXiaoaiRelay()
        await xiaoaiManager.play(playableSources[0].url)
        await xiaoaiRelay.waitUntilStreaming(12_000)
      }
      return { relayUrls }
    } catch (error) {
      await xiaoaiRelay.stop()
      throw error
    }
  })
  ipcMain.handle('xiaoai:pause', () => xiaoaiManager.pause())
  ipcMain.handle('xiaoai:resume', () => xiaoaiManager.resume())
  ipcMain.handle('xiaoai:stop', async () => {
    try { return await xiaoaiManager.stop() }
    finally { await xiaoaiRelay.stop() }
  })
  ipcMain.handle('xiaoai:set-volume', (_event, volume) => xiaoaiManager.setVolume(Number(volume)))
  ipcMain.handle('xiaoai:get-status', async () => ({ ...(await xiaoaiManager.status()), relayConnected: xiaoaiRelay.hasActiveStream() }))
  ipcMain.handle('xiaoai:get-conversations', (_event, limit) => xiaoaiManager.conversations(limit))
  ipcMain.handle('xiaoai:logout', async () => { await xiaoaiRelay.stop(); return xiaoaiManager.logout() })
  ipcMain.handle('client:backup', async () => ({ success: true, ...(await pullSnapshot()) }))
  ipcMain.handle('client:restore', () => restoreLocalSnapshot())
  ipcMain.handle('client:export', async () => {
    if (!currentAccount) throw new Error('请先登录同步账户')
    const local = snapshotStore.read(currentAccount.serverUrl, currentAccount.username)
    if (!local) throw new Error('没有可以导出的本地同步快照')
    const selected = await dialog.showSaveDialog(setupWindow, {
      title: '导出音云同步备份',
      defaultPath: `音云-${currentAccount.username}-同步备份.yinyun-sync.json`,
      filters: [{ name: '音云同步备份', extensions: ['json'] }],
    })
    if (selected.canceled || !selected.filePath) return { success: false, cancelled: true }
    snapshotStore.exportFile(selected.filePath, local)
    return { success: true, filePath: selected.filePath }
  })
  ipcMain.handle('client:import', async () => {
    if (!currentAccount) throw new Error('请先登录同步账户')
    const selected = await dialog.showOpenDialog(setupWindow, {
      title: '导入音云同步备份',
      properties: ['openFile'],
      filters: [{ name: '音云同步备份', extensions: ['json'] }],
    })
    if (selected.canceled || !selected.filePaths[0]) return { success: false, cancelled: true }
    const imported = snapshotStore.importFile(selected.filePaths[0])
    if (String(imported.username || '').toLowerCase() !== currentAccount.username) {
      throw new Error(`备份属于用户 ${imported.username || '未知'}，不能导入当前账户`)
    }
    snapshotStore.write(currentAccount.serverUrl, currentAccount.username, imported.snapshot)
    setSyncState('recovery', '同步备份已导入，可选择恢复到服务端')
    return { success: true }
  })
  ipcMain.handle('client:save-preferences', (_event, preferences) => savePreferences(preferences))
  ipcMain.handle('client:logout', async () => { await clearCurrentLogin(); return { success: true } })
  ipcMain.handle('client:remove-server', async () => { await clearCurrentLogin({ removeServer: true }); return { success: true } })
  ipcMain.handle('client:open-external', (_event, url) => { if (url === APP_REPOSITORY || isReleaseUrl(url)) return shell.openExternal(url) })
}

app.on('second-instance', () => {
  if (currentAccount) void openPlayerWindow(true)
  else showSetupWindow()
})

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('io.github.bobcc4.yinyun.windows')
  registerIpc()
  tray = new Tray(getIcon())
  tray.on('click', () => {
    if (playerWindow && playerWindow.isVisible()) playerWindow.hide()
    else if (currentAccount) void openPlayerWindow(true)
    else showSetupWindow()
  })
  rebuildTrayMenu()
  savePreferences({})

  const saved = credentialStore.read()
  if (saved && saved.serverUrl && saved.username && saved.password) {
    const result = await loginToServer({ ...saved, openPlayer: !process.argv.includes('--hidden') })
    if (!result.success) showSetupWindow()
  } else {
    showSetupWindow()
  }
  setTimeout(() => void checkForClientUpdate(), 1_000)
})

app.on('activate', () => { if (currentAccount) void openPlayerWindow(true); else showSetupWindow() })
app.on('before-quit', () => { quitting = true; void xiaoaiRelay.stop() })
app.on('window-all-closed', () => { })
