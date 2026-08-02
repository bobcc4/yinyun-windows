'use strict'

const elements = {
  navItems: [...document.querySelectorAll('.nav-item')],
  views: [...document.querySelectorAll('.view')],
  viewTitle: document.getElementById('view-title'),
  viewDescription: document.getElementById('view-description'),
  form: document.getElementById('login-form'),
  serverUrl: document.getElementById('server-url'),
  username: document.getElementById('username'),
  password: document.getElementById('password'),
  testButton: document.getElementById('test-btn'),
  loginButton: document.getElementById('login-btn'),
  logoutButton: document.getElementById('logout-btn'),
  removeButton: document.getElementById('remove-btn'),
  openPlayerButton: document.getElementById('open-player-btn'),
  backupButton: document.getElementById('backup-btn'),
  restoreButton: document.getElementById('restore-btn'),
  exportButton: document.getElementById('export-btn'),
  importButton: document.getElementById('import-btn'),
  repositoryButton: document.getElementById('repository-btn'),
  minimizeToTray: document.getElementById('minimize-to-tray'),
  launchAtLogin: document.getElementById('launch-at-login'),
  startMinimized: document.getElementById('start-minimized'),
  result: document.getElementById('result'),
  resultTitle: document.getElementById('result-title'),
  resultMessage: document.getElementById('result-message'),
  stateDot: document.getElementById('state-dot'),
  stateLabel: document.getElementById('state-label'),
  stateDetail: document.getElementById('state-detail'),
  version: document.getElementById('app-version'),
  syncTime: document.getElementById('sync-time'),
  syncMessage: document.getElementById('sync-message'),
  syncStatus: document.getElementById('sync-status'),
  statPlaylists: document.getElementById('stat-playlists'),
  statTracks: document.getElementById('stat-tracks'),
  statDislikes: document.getElementById('stat-dislikes'),
  statSources: document.getElementById('stat-sources'),
}

const viewText = {
  account: ['账户连接', '登录 NAS 上的音云同步账户'],
  sync: ['同步与恢复', '管理客户端本地快照和服务端数据恢复'],
  settings: ['客户端设置', '设置托盘、开机启动和窗口行为'],
}

let currentState = null
let repository = ''

function preferences() {
  return {
    minimizeToTray: elements.minimizeToTray.checked,
    launchAtLogin: elements.launchAtLogin.checked,
    startMinimized: elements.startMinimized.checked,
  }
}

function setView(name) {
  for (const item of elements.navItems) item.classList.toggle('active', item.dataset.view === name)
  for (const view of elements.views) view.classList.toggle('active', view.id === `view-${name}`)
  elements.viewTitle.textContent = viewText[name][0]
  elements.viewDescription.textContent = viewText[name][1]
}

function setBusy(busy) {
  for (const element of [
    elements.testButton, elements.loginButton, elements.serverUrl, elements.username, elements.password,
    elements.backupButton, elements.restoreButton, elements.exportButton, elements.importButton,
  ]) element.disabled = busy
}

function showResult(success, title, message = '') {
  elements.result.classList.remove('hidden', 'error')
  if (!success) elements.result.classList.add('error')
  elements.resultTitle.textContent = title
  elements.resultMessage.textContent = message
}

function formatDate(value) {
  if (!value) return '尚未创建'
  try { return new Date(value).toLocaleString('zh-CN', { hour12: false }) } catch { return value }
}

function renderState(state) {
  currentState = state
  const connected = Boolean(state.account)
  const connection = state.connection || { status: 'idle', message: '尚未登录' }
  elements.stateDot.className = `state-dot ${connection.status || 'idle'}`
  elements.stateLabel.textContent = connection.message || '尚未登录'
  elements.stateDetail.textContent = connected ? state.account.serverUrl : '等待连接音云服务器'
  elements.openPlayerButton.classList.toggle('hidden', !connected)
  elements.logoutButton.classList.toggle('hidden', !connected)
  elements.removeButton.classList.toggle('hidden', !state.config.serverUrl)
  elements.loginButton.textContent = connected ? '重新登录并打开' : '登录并打开播放器'

  if (state.config.serverUrl && document.activeElement !== elements.serverUrl) elements.serverUrl.value = state.config.serverUrl
  if (state.config.username && document.activeElement !== elements.username) elements.username.value = state.config.username
  elements.minimizeToTray.checked = state.config.minimizeToTray
  elements.launchAtLogin.checked = state.config.launchAtLogin
  elements.startMinimized.checked = state.config.startMinimized

  const sync = state.sync || {}
  const local = sync.local
  const stats = local && local.stats ? local.stats : { playlists: 0, tracks: 0, dislikeRules: 0, sources: 0 }
  elements.syncTime.textContent = local ? formatDate(local.savedAt) : '尚未创建'
  elements.syncMessage.textContent = sync.message || '登录后，客户端会定期保存服务端同步数据。'
  elements.syncStatus.className = `status-badge ${sync.status || 'idle'}`
  elements.syncStatus.textContent = ({
    idle: '等待登录', syncing: '同步中', ready: '已备份', recovery: '可恢复', error: '同步异常',
  })[sync.status] || '等待登录'
  elements.statPlaylists.textContent = stats.playlists || 0
  elements.statTracks.textContent = stats.tracks || 0
  elements.statDislikes.textContent = stats.dislikeRules || 0
  elements.statSources.textContent = stats.sources || 0

  for (const element of [elements.backupButton, elements.restoreButton, elements.exportButton, elements.importButton]) {
    element.disabled = !connected
  }
  elements.restoreButton.disabled = !connected || !local
  elements.exportButton.disabled = !connected || !local
}

async function runAction(action, successTitle) {
  setBusy(true)
  try {
    const result = await action()
    if (result && result.cancelled) return result
    showResult(true, successTitle)
    renderState(await window.yinyunClient.getState())
    return result
  } catch (error) {
    showResult(false, '操作失败', error.message || String(error))
    return null
  } finally {
    setBusy(false)
  }
}

for (const item of elements.navItems) item.addEventListener('click', () => setView(item.dataset.view))

elements.testButton.addEventListener('click', async () => {
  setBusy(true)
  try {
    const result = await window.yinyunClient.testServer(elements.serverUrl.value)
    if (!result.success) return showResult(false, '服务器检测失败', result.error)
    elements.serverUrl.value = result.serverUrl
    showResult(true, '服务器可用', `${result.version} · API ${result.apiVersion}`)
  } finally {
    setBusy(false)
  }
})

elements.form.addEventListener('submit', async event => {
  event.preventDefault()
  setBusy(true)
  try {
    const result = await window.yinyunClient.login({
      serverUrl: elements.serverUrl.value,
      username: elements.username.value,
      password: elements.password.value,
      preferences: preferences(),
    })
    if (!result.success) return showResult(false, '登录失败', result.error)
    elements.password.value = ''
    showResult(true, '同步账户已登录', result.recoveryAvailable ? '本机保留了可恢复的同步数据。' : '播放器正在打开。')
    renderState(await window.yinyunClient.getState())
  } finally {
    setBusy(false)
  }
})

elements.openPlayerButton.addEventListener('click', () => void runAction(() => window.yinyunClient.openPlayer(), '播放器已打开'))
elements.backupButton.addEventListener('click', () => void runAction(() => window.yinyunClient.backup(), '本地同步快照已更新'))
elements.restoreButton.addEventListener('click', () => void runAction(() => window.yinyunClient.restore(), '同步数据已恢复到服务端'))
elements.exportButton.addEventListener('click', () => void runAction(() => window.yinyunClient.exportBackup(), '同步备份已导出'))
elements.importButton.addEventListener('click', () => void runAction(() => window.yinyunClient.importBackup(), '同步备份已导入'))

elements.logoutButton.addEventListener('click', async () => {
  await runAction(() => window.yinyunClient.logout(), '已退出同步账户')
  elements.password.value = ''
})

elements.removeButton.addEventListener('click', async () => {
  if (!window.confirm('移除服务器和登录凭据？本机同步快照会保留。')) return
  await runAction(() => window.yinyunClient.removeServer(), '服务器连接已移除')
  elements.serverUrl.value = ''
  elements.username.value = ''
  elements.password.value = ''
})

for (const checkbox of [elements.minimizeToTray, elements.launchAtLogin, elements.startMinimized]) {
  checkbox.addEventListener('change', () => void window.yinyunClient.savePreferences(preferences()))
}

elements.repositoryButton.addEventListener('click', () => window.yinyunClient.openExternal(repository))
window.yinyunClient.onState(renderState)

void window.yinyunClient.getState().then(state => {
  repository = state.repository
  elements.version.textContent = `客户端 v${state.appVersion}`
  renderState(state)
})
