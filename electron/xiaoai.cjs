'use strict'

const crypto = require('node:crypto')
const QRCode = require('qrcode')

const ACCOUNT_BASE = 'https://account.xiaomi.com'
const MINA_BASE = 'https://api2.mina.mi.com'
const CONVERSATION_BASE = 'https://userprofile.mina.mi.com/device_profile/v2/conversation'
const QR_SID = 'mijia'
const MINA_SID = 'micoapi'
const USER_AGENT_TEMPLATE = 'Android-7.1.1-1.0.0-ONEPLUS A3010-136-%s APP/xiaomi.smarthome APPV/62830'
const MUSIC_API_MODELS = new Set(['X08C', 'X08E', 'X8F', 'X4B', 'LX05', 'OH11', 'OH2', 'OH2P', 'X6A', 'LX04', 'L05B', 'L05C', 'LX06', 'L06A', 'X08A', 'X10A', 'L15A', 'L16A', 'L17A'])
const DEFAULT_AUDIO_ID = '1732418460076477549'
const MUSIC_CP_ID = '355454500'
const DEVICE_RETRY_COUNT = 3
const DEVICE_RETRY_DELAY_MS = 500
const ASK_BY_UBUS_MODELS = new Set(['M01'])

function stripJsonPrefix(value) { return String(value || '').replace('&&&START&&&', '').trim() }
function stringValue(value, key) { const result = value?.[key]; return result == null ? '' : String(result) }
function form(value) { return new URLSearchParams(Object.entries(value).map(([key, item]) => [key, String(item)])).toString() }
function deviceId() { return crypto.randomBytes(16).toString('hex') }
function userAgent(id) { return USER_AGENT_TEMPLATE.replace('%s', id) }
function requestId() { return `app_ios_${crypto.randomBytes(18).toString('hex').slice(0, 30)}` }
function extractNonce(text, parsed) { return text.match(/"nonce"\s*:\s*(\d+)/)?.[1] || stringValue(parsed, 'nonce') }
function clientSign(nonce, ssecurity) { return crypto.createHash('sha1').update(`nonce=${nonce}&${ssecurity}`).digest('base64') }
function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)) }

function splitSetCookie(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  return String(value).split(/,(?=\s*[^;,=]+=[^;,]+)/)
}
function getSetCookies(headers) {
  if (typeof headers?.getSetCookie === 'function') return headers.getSetCookie()
  return splitSetCookie(headers?.get?.('set-cookie'))
}
function cookieValues(headers) {
  const result = {}
  for (const header of getSetCookies(headers)) {
    const pair = String(header).split(';', 1)[0]
    const index = pair.indexOf('=')
    if (index > 0) result[pair.slice(0, index).trim()] = pair.slice(index + 1).trim()
  }
  return result
}
function mergeCookies(target, headers) { Object.assign(target, cookieValues(headers)); return target }
function cookieHeader(values) { return Object.entries(values).filter(([, value]) => value !== '').map(([key, value]) => `${key}=${value}`).join('; ') }

function deviceItems(value) {
  const seen = new Set()
  function walk(candidate, depth = 0) {
    if (depth > 5 || candidate == null) return []
    if (typeof candidate === 'string') {
      try { return walk(JSON.parse(candidate), depth + 1) } catch { return [] }
    }
    if (Array.isArray(candidate)) {
      if (candidate.some(item => item && typeof item === 'object' && (item.deviceID || item.deviceId || item.device_id || item.id))) return candidate
      for (const item of candidate) {
        const result = walk(item, depth + 1)
        if (result.length) return result
      }
      return []
    }
    if (typeof candidate !== 'object' || seen.has(candidate)) return []
    seen.add(candidate)
    for (const key of ['data', 'list', 'devices', 'deviceList', 'device_list', 'items', 'result']) {
      const result = walk(candidate[key], depth + 1)
      if (result.length) return result
    }
    return []
  }
  return walk(value)
}

function mergeDeviceLists(...lists) {
  const result = new Map()
  for (const list of lists) for (const device of list || []) if (device?.id) result.set(device.id, device)
  return [...result.values()]
}

function normalizeDevice(item) {
  if (!item || typeof item !== 'object') return null
  const id = item.deviceID ?? item.deviceId ?? item.device_id ?? item.id
  if (!id) return null
  return {
    id: String(id),
    name: String(item.name || item.alias || item.nickname || '小爱音箱'),
    alias: String(item.alias || ''),
    hardware: String(item.hardware || item.modelName || ''),
    model: String(item.model || ''),
    presence: String(item.presence || (item.online ? 'online' : '')),
    miotDID: String(item.miotDID || item.miotDid || item.miot_did || ''),
  }
}

function parseObject(value) {
  if (!value || typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function textValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    if (Array.isArray(value)) {
      const text = value.map(item => textValue(item?.name, item?.title, item)).filter(Boolean).join(', ')
      if (text) return text
    }
    if (value && typeof value === 'object') {
      const text = textValue(value.name, value.title, value.value, value.text)
      if (text) return text
    }
  }
  return ''
}

function normalizePlayDetail(info = {}) {
  const raw = parseObject(info.play_song_detail)
  const detail = raw && typeof raw === 'object' ? raw : {}
  const nested = parseObject(detail.song || detail.song_info || detail.songInfo || detail.music) || {}
  const source = nested && typeof nested === 'object' ? { ...info, ...detail, ...nested } : { ...info, ...detail }
  const position = Number(source.position ?? detail.position ?? 0)
  const duration = Number(source.duration ?? source.duration_ms ?? detail.duration ?? 0)
  return {
    audioId: textValue(source.audio_id, source.audioId, source.song_id, source.songId, source.id),
    title: textValue(source.title, source.song_name, source.songName, source.name),
    artist: textValue(source.artist, source.artist_name, source.artistName, source.singer),
    album: textValue(source.album, source.album_name, source.albumName),
    position: Number.isFinite(position) ? Math.max(0, position / 1000) : 0,
    duration: Number.isFinite(duration) ? Math.max(0, duration / 1000) : 0,
    detail,
  }
}

function normalizeConversationRecord(record = {}) {
  const timestamp = Number(record.time ?? record.timestamp_ms ?? record.timestamp ?? 0)
  const answers = Array.isArray(record.answers) ? record.answers : []
  const answer = answers.find(item => item?.type === 'TTS') || answers[0] || {}
  return {
    id: String(record.id || record.request_id || `${timestamp}:${record.query || ''}`),
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
    query: textValue(record.query, record.question),
    answer: textValue(answer?.tts?.text, answer?.content, record.answer),
  }
}

function parseUbusConversations(value) {
  const info = parseObject(value?.data?.info)
  const result = Array.isArray(info?.result) ? info.result : []
  const records = []
  for (const item of result) {
    const nlp = parseObject(item?.nlp)
    const timestamp = Number(nlp?.meta?.timestamp || 0)
    for (const answer of nlp?.response?.answer || []) {
      const query = textValue(answer?.intention?.query, answer?.question)
      if (!query) continue
      records.push({
        id: String(nlp?.meta?.request_id || `${timestamp}:${query}`),
        timestamp: Number.isFinite(timestamp) ? timestamp : 0,
        query,
        answer: textValue(answer?.content?.to_speak, answer?.content),
      })
    }
  }
  return records
}

async function fetchText(fetchImpl, url, options = {}, timeoutMs = 35_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { redirect: 'manual', cache: 'no-store', ...options, signal: controller.signal })
    return { response, text: await response.text() }
  } finally { clearTimeout(timer) }
}

async function followRedirects(fetchImpl, inputUrl, options, cookies, maxRedirects = 10) {
  let url = inputUrl
  for (let index = 0; index <= maxRedirects; index++) {
    const headers = { ...(options.headers || {}) }
    const saved = cookieHeader(cookies)
    if (saved) headers.Cookie = headers.Cookie ? `${headers.Cookie}; ${saved}` : saved
    const result = await fetchText(fetchImpl, url, { ...options, method: index ? 'GET' : options.method, body: index ? undefined : options.body, headers })
    mergeCookies(cookies, result.response.headers)
    if (result.response.status < 300 || result.response.status >= 400) return result
    const location = result.response.headers.get('location')
    if (!location) return result
    url = new URL(location, url).href
  }
  throw new Error('小米登录重定向次数过多')
}

class XiaomiQrLogin {
  constructor(fetchImpl) { this.fetch = fetchImpl; this.reset() }
  reset() { this.cookies = {}; this.id = deviceId(); this.pollUrl = ''; this.pollCount = 0 }

  async start() {
    this.reset()
    const headers = { 'User-Agent': userAgent(this.id), Cookie: `sdkVersion=3.8.6; deviceId=${this.id}` }
    const first = await followRedirects(this.fetch, `${ACCOUNT_BASE}/pass/serviceLogin?sid=${QR_SID}&_json=true`, { method: 'GET', headers }, this.cookies, 0)
    const login = JSON.parse(stripJsonPrefix(first.text))
    const params = new URLSearchParams({ _qrsize: '240', qs: stringValue(login, 'qs'), sid: QR_SID, _sign: stringValue(login, '_sign'), callback: stringValue(login, 'callback'), _json: 'true', _dc: String(Date.now()) })
    if (!params.get('qs') || !params.get('_sign') || !params.get('callback')) throw new Error('小米登录未返回二维码参数')
    const second = await followRedirects(this.fetch, `${ACCOUNT_BASE}/longPolling/loginUrl?${params}`, { method: 'GET', headers: { 'User-Agent': userAgent(this.id) } }, this.cookies, 0)
    const qr = JSON.parse(stripJsonPrefix(second.text))
    if (Number(qr.code || 0) !== 0 || !qr.lp) throw new Error(`获取小米登录二维码失败${qr.desc ? `：${qr.desc}` : ''}`)
    this.pollUrl = qr.lp
    const loginUrl = stringValue(qr, 'loginUrl')
    const qrcodeUrl = loginUrl
      ? await QRCode.toDataURL(loginUrl, { width: 240, margin: 1, errorCorrectionLevel: 'M' })
      : stringValue(qr, 'qr')
    if (!qrcodeUrl) throw new Error('小米登录未返回可用的二维码内容')
    return { state: 'waiting', qrcodeUrl, loginUrl }
  }

  async poll() {
    if (!this.pollUrl) throw new Error('请先获取小米登录二维码')
    if (++this.pollCount > 30) return { state: 'expired', message: '二维码已过期，请重新获取' }
    let result
    try { result = await followRedirects(this.fetch, this.pollUrl, { method: 'GET', headers: { 'User-Agent': userAgent(this.id) } }, this.cookies, 0) }
    catch (error) { if (error.name === 'AbortError') return { state: 'waiting' }; throw error }
    if (result.response.status === 403) return { state: 'expired', message: '二维码已过期，请重新获取' }
    let value
    try { value = JSON.parse(stripJsonPrefix(result.text)) } catch { return { state: 'waiting' } }
    if (Number(value.code || 0) !== 0) return { state: 'expired', message: value.desc || '二维码已失效' }
    const passToken = stringValue(value, 'passToken')
    const userId = stringValue(value, 'userId')
    if (!passToken || !userId) return { state: 'waiting' }
    const cUserId = stringValue(value, 'cUserId') || this.cookies.cUserId || ''
    const token = await exchangeServiceToken(this.fetch, { passToken, userId, cUserId, deviceId: this.id })
    return { state: 'confirmed', account: { passToken, userId, cUserId, deviceId: this.id, ...token } }
  }
}

async function exchangeServiceToken(fetchImpl, account) {
  const cookies = { passToken: account.passToken, userId: account.userId, deviceId: account.deviceId || deviceId(), sdkVersion: '3.8.6' }
  if (account.cUserId) cookies.cUserId = account.cUserId
  const result = await followRedirects(fetchImpl, `${ACCOUNT_BASE}/pass/serviceLogin?sid=${MINA_SID}&_json=true`, { method: 'GET', headers: { 'User-Agent': userAgent(cookies.deviceId), Cookie: cookieHeader(cookies) } }, cookies, 0)
  const login = JSON.parse(stripJsonPrefix(result.text))
  if (Number(login.code || 0) !== 0 || !login.location) throw new Error(`小米服务令牌交换失败${login.desc ? `：${login.desc}` : ''}`)
  const ssecurity = stringValue(login, 'ssecurity')
  const nonce = extractNonce(result.text, login)
  const location = new URL(login.location)
  location.searchParams.set('_userIdNeedEncrypt', 'true')
  location.searchParams.set('clientSign', clientSign(nonce, ssecurity))
  const final = await followRedirects(fetchImpl, location.href, { method: 'GET', headers: { 'User-Agent': userAgent(cookies.deviceId) } }, cookies, 10)
  mergeCookies(cookies, final.response.headers)
  if (!cookies.serviceToken) throw new Error('小米登录成功，但未获取到音箱服务令牌')
    return {
    serviceToken: cookies.serviceToken,
    ssecurity: cookies.ssecurity || ssecurity,
    userId: cookies.userId || stringValue(login, 'userId') || account.userId,
    cUserId: cookies.cUserId || account.cUserId || '',
    deviceId: cookies.deviceId,
    updatedAt: Date.now(),
  }
}

class XiaoaiClient {
  constructor(fetchImpl, account, onRefresh) { this.fetch = fetchImpl; this.account = account; this.onRefresh = onRefresh; this.queues = new Map() }
  apiCookies() {
    return [
      `userId=${this.account.userId}`,
      `serviceToken=${this.account.serviceToken}`,
      'channel=MI_APP_STORE',
      this.account.cUserId ? `cUserId=${this.account.cUserId}` : '',
      this.account.deviceId ? `deviceId=${this.account.deviceId}` : '',
      'sdkVersion=3.8.6',
    ].filter(Boolean).join('; ')
  }
  async request(url, options = {}, retry = true) {
    const result = await fetchText(this.fetch, url, { ...options, headers: { 'User-Agent': userAgent(this.account.deviceId), Cookie: this.apiCookies(), ...(options.headers || {}) } })
    if (result.response.status === 401 && retry && this.onRefresh) { this.account = await this.onRefresh(); return this.request(url, options, false) }
    if (!result.response.ok) throw new Error(`小米设备接口返回 HTTP ${result.response.status}`)
    let value
    try { value = JSON.parse(result.text) } catch { throw new Error('小米设备接口返回了无效数据') }
    return value
  }
  async devices() {
    const value = await this.request(`${MINA_BASE}/admin/v2/device_list?master=1`)
    const code = value.code == null ? 0 : Number(value.code)
    if (!Number.isFinite(code) || code !== 0) throw new Error(value.message || value.msg || `读取小爱设备失败（code=${value.code}）`)
    return deviceItems(value).map(normalizeDevice).filter(Boolean)
  }
  async ubus(device, method, message = {}, label = method, path = 'mediaplayer') {
    const previous = this.queues.get(device.id) || Promise.resolve()
    let release
    const current = new Promise(resolve => { release = resolve })
    const tail = previous.catch(() => {}).then(() => current)
    this.queues.set(device.id, tail)
    await previous.catch(() => {})
    try {
      const body = form({ deviceId: device.id, method, path, message: JSON.stringify(message), requestId: requestId() })
      const value = await this.request(`${MINA_BASE}/remote/ubus`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
      if (Number(value.code || 0) !== 0) throw new Error(value.message || `${label}失败`)
      const nestedCode = Number(value.data?.code ?? 0)
      if (nestedCode !== 0) throw new Error(`设备拒绝执行${label}（code=${nestedCode}）`)
      return value
    } finally {
      release()
      if (this.queues.get(device.id) === tail) this.queues.delete(device.id)
    }
  }
  async play(device, url) {
    if (!/^https?:\/\//i.test(url)) throw new Error('小爱音箱只能访问 HTTP 或 HTTPS 音频地址')
    const playMusic = async () => {
      const music = { payload: { audio_type: '', audio_items: [{ item_id: { audio_id: DEFAULT_AUDIO_ID, cp: { album_id: '-1', episode_index: 0, id: MUSIC_CP_ID, name: 'xiaowei' } }, stream: { url } }], list_params: { listId: '-1', loadmore_offset: 0, origin: 'xiaowei', type: 'MUSIC' } }, play_behavior: 'REPLACE_ALL' }
      await this.ubus(device, 'player_play_music', { startaudioid: DEFAULT_AUDIO_ID, music: JSON.stringify(music) }, '播放')
    }
    const playUrl = () => this.ubus(device, 'player_play_url', { url, type: 2, media: 'app_ios' }, '播放')
    const preferred = MUSIC_API_MODELS.has(device.hardware) ? playMusic : playUrl
    const fallback = MUSIC_API_MODELS.has(device.hardware) ? playUrl : playMusic
    try { await preferred() } catch (firstError) {
      try { await fallback() } catch (secondError) {
        throw new Error(`小爱音箱拒绝两种播放方式：${firstError.message}；${secondError.message}`)
      }
    }
    return true
  }
  operation(device, action) { return this.ubus(device, 'player_play_operation', { action, media: 'app_ios' }, action === 'pause' ? '暂停' : action === 'play' ? '继续播放' : '停止') }
  async pause(device) {
    await this.operation(device, 'pause')
    return { stopped: false }
  }
  resume(device) { return this.operation(device, 'play') }
  async stop(device) { try { await this.operation(device, 'pause') } catch {}; await this.operation(device, 'stop'); return true }
  async setVolume(device, volume) { await this.ubus(device, 'player_set_volume', { volume: Math.max(0, Math.min(100, Math.round(volume))) }, '设置音量'); return true }
  async status(device) {
    const value = await this.ubus(device, 'player_get_play_status', {}, '读取播放状态')
    let info = {}
    try { info = typeof value.data?.info === 'string' ? JSON.parse(value.data.info) : value.data?.info || {} } catch {}
    const detail = normalizePlayDetail(info)
    return { status: Number.isFinite(Number(info.status)) ? Number(info.status) : -1, volume: Number.isFinite(Number(info.volume)) ? Number(info.volume) : -1, position: detail.position, audioId: detail.audioId, title: detail.title, artist: detail.artist, album: detail.album, duration: detail.duration, detail: detail.detail }
  }
  async conversations(device, limit = 3) {
    if (ASK_BY_UBUS_MODELS.has(device.hardware)) {
      const value = await this.ubus(device, 'nlp_result_get', {}, '读取语音指令', 'mibrain')
      return parseUbusConversations(value)
    }
    const url = new URL(CONVERSATION_BASE)
    url.searchParams.set('source', 'dialogu')
    url.searchParams.set('hardware', device.hardware)
    url.searchParams.set('timestamp', String(Date.now()))
    url.searchParams.set('limit', String(Math.max(1, Math.min(10, Number(limit) || 3))))
    const value = await this.request(url.href, { headers: { Cookie: `${this.apiCookies()}; deviceId=${device.id}` } })
    const data = parseObject(value?.data)
    return (Array.isArray(data?.records) ? data.records : [])
      .map(normalizeConversationRecord)
      .filter(item => item.query && item.timestamp > 0)
  }

  // Send the current item and the next item as one XiaoAI queue. This keeps
  // voice "next" inside the Yinyun queue instead of falling back to XiaoAI's
  // catalog and its preview version.
  async playQueue(device, sources) {
    const inputSources = Array.isArray(sources) ? sources : [sources]
    const items = inputSources.map((item, index) => {
      const value = typeof item === 'string' ? { url: item } : item || {}
      const url = String(value.url || '')
      if (!/^https?:\/\//i.test(url)) throw new Error('Invalid XiaoAI audio URL')
      return {
        ...value,
        url,
        audioId: String(value.audioId || value.id || `yinyun-${Date.now()}-${index}-${crypto.randomBytes(4).toString('hex')}`),
      }
    })
    if (!items.length) throw new Error('XiaoAI playback queue is empty')
    const playMusic = () => {
      const music = {
        payload: {
          audio_type: '',
          audio_items: items.map(item => ({
            item_id: { audio_id: item.audioId, cp: { album_id: '-1', episode_index: 0, id: MUSIC_CP_ID, name: 'xiaowei' } },
            stream: { url: item.url },
            ...(item.title ? { song_name: String(item.title) } : {}),
            ...(item.artist ? { artist_name: String(item.artist) } : {}),
            ...(item.album ? { album_name: String(item.album) } : {}),
          })),
          list_params: { listId: '-1', loadmore_offset: 0, origin: 'xiaowei', type: 'MUSIC' },
        },
        play_behavior: 'REPLACE_ALL',
      }
      return this.ubus(device, 'player_play_music', { startaudioid: items[0].audioId, music: JSON.stringify(music) }, 'playback')
    }
    const playUrl = () => this.ubus(device, 'player_play_url', { url: items[0].url, type: 2, media: 'app_ios' }, 'playback')
    const preferred = items.length > 1 || MUSIC_API_MODELS.has(device.hardware) ? playMusic : playUrl
    const fallback = MUSIC_API_MODELS.has(device.hardware) ? playUrl : playMusic
    try { await preferred() } catch (firstError) {
      if (items.length > 1 && preferred === playMusic) throw firstError
      try { await fallback() } catch (secondError) {
        throw new Error(`XiaoAI playback rejected: ${firstError.message}; ${secondError.message}`)
      }
    }
    return true
  }
}

function createXiaoaiManager({ fetchImpl, store }) {
  let qr = null
  let client = null
  let knownDevices = new Map()
  let state
  function load() { if (state === undefined) state = store.read() || null; return state }
  function publicState() { load(); return { loggedIn: Boolean(state?.account?.serviceToken), selectedDeviceId: state?.selectedDeviceId || '', selectedDevice: state?.selectedDevice || null } }
  function save(patch) { state = { ...(state || {}), ...patch }; store.write(state); return publicState() }
  async function refresh() {
    load()
    if (!state?.account?.passToken) throw new Error('小米登录已失效，请重新扫码')
    const token = await exchangeServiceToken(fetchImpl, state.account)
    const account = { ...state.account, ...token }; save({ account }); return account
  }
  function requireClient() {
    load()
    if (!state?.account?.serviceToken) throw new Error('请先扫码登录小米账号')
    if (!client) client = new XiaoaiClient(fetchImpl, state.account, refresh)
    return client
  }
  function selected() { load(); if (!state?.selectedDevice?.id) throw new Error('请先选择小爱音箱'); return state.selectedDevice }
  return {
    state: publicState,
    async startLogin() { qr = new XiaomiQrLogin(fetchImpl); return qr.start() },
    async pollLogin() {
      if (!qr) throw new Error('请先获取小米登录二维码')
      const result = await qr.poll()
      if (result.state === 'confirmed') { save({ account: result.account, selectedDeviceId: '', selectedDevice: null }); client = null; qr = null }
      return { state: result.state, message: result.message, xiaoai: publicState() }
    },
    async devices() {
      let devices = []
      let lastError = null
      for (let attempt = 0; attempt < DEVICE_RETRY_COUNT; attempt++) {
        try {
          const currentClient = requireClient()
          devices = await currentClient.devices()
          if (devices.length) break
        } catch (error) {
          lastError = error
        }
        if (attempt + 1 >= DEVICE_RETRY_COUNT) break
        if (state?.account?.passToken) {
          try {
            const account = await refresh()
            client = new XiaoaiClient(fetchImpl, account, refresh)
          } catch (error) {
            lastError = error
          }
        }
        await delay(DEVICE_RETRY_DELAY_MS)
      }
      if (lastError && !devices.length) throw lastError
      knownDevices = new Map(devices.map(device => [device.id, device]))
      return devices
    },
    selectDevice(deviceId) {
      const device = knownDevices.get(String(deviceId || ''))
      if (!device) throw new Error('设备不在当前小米账号的设备列表中，请刷新后重试')
      return save({ selectedDeviceId: device.id, selectedDevice: device })
    },
    async play(url) { return requireClient().play(selected(), url) },
    async playQueue(sources) { return requireClient().playQueue(selected(), sources) },
    async pause() { return requireClient().pause(selected()) },
    async resume() { return requireClient().resume(selected()) },
    async stop() { return requireClient().stop(selected()) },
    async setVolume(volume) { return requireClient().setVolume(selected(), volume) },
    async status() { return requireClient().status(selected()) },
    async conversations(limit) { return requireClient().conversations(selected(), limit) },
    logout() { state = null; client = null; qr = null; knownDevices.clear(); store.remove(); return publicState() },
  }
}

module.exports = { XiaomiQrLogin, XiaoaiClient, createXiaoaiManager, exchangeServiceToken, normalizeConversationRecord, normalizePlayDetail, parseUbusConversations, stripJsonPrefix, splitSetCookie }
