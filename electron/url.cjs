'use strict'

const IP_OR_LOCALHOST = /^(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d+)?(?:\/|$)/i
const KNOWN_ENTRY_PATHS = new Set(['', '/', '/music', '/music/', '/rest', '/rest/'])

function normalizeServerUrl(input) {
  let value = String(input || '').trim()
  if (!value) throw new Error('请输入服务器地址')

  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    value = `${IP_OR_LOCALHOST.test(value) ? 'http' : 'https'}://${value}`
  }

  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('服务器地址格式不正确')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('服务器地址仅支持 HTTP 或 HTTPS')
  }
  if (url.username || url.password) throw new Error('服务器地址中不能包含用户名或密码')
  if (url.search || url.hash) throw new Error('服务器地址中不能包含查询参数或锚点')
  if (!KNOWN_ENTRY_PATHS.has(url.pathname)) {
    throw new Error('请填写音云服务器根地址，不要附加其他路径')
  }

  return url.origin
}

function normalizePlayerPath(pathname) {
  const value = String(pathname || '/music').trim()
  if (value === '' || value === '/') return '/'
  if (!value.startsWith('/')) throw new Error('服务器返回了无效的播放器路径')
  return value.replace(/\/+$/, '') || '/'
}

function resolvePlayerUrl(serverUrl, playerPath) {
  const base = normalizeServerUrl(serverUrl)
  const pathname = normalizePlayerPath(playerPath)
  return pathname === '/' ? `${base}/` : `${base}${pathname}`
}

function isSameServerOrigin(targetUrl, serverUrl) {
  try {
    return new URL(targetUrl).origin === normalizeServerUrl(serverUrl)
  } catch {
    return false
  }
}

function readServerVersion(configScript) {
  const match = String(configScript || '').match(/["']?version["']?\s*:\s*["']([^"']+)["']/)
  return match ? match[1] : '未知版本'
}

function readCapabilities(value) {
  const data = value && typeof value === 'object' && value.data && typeof value.data === 'object'
    ? value.data
    : value
  if (!data || data.product !== 'yinyun' || typeof data.apiVersion !== 'string') {
    throw new Error('服务器返回了无效的音云 API v1 能力信息')
  }
  return {
    playerPath: normalizePlayerPath(data.playerPath || '/music'),
    version: data.serverVersion ? `v${String(data.serverVersion).replace(/^v/, '')}` : '未知版本',
    apiVersion: data.apiVersion,
  }
}

module.exports = {
  isSameServerOrigin,
  normalizePlayerPath,
  normalizeServerUrl,
  readCapabilities,
  readServerVersion,
  resolvePlayerUrl,
}
