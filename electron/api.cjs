'use strict'

const REQUEST_TIMEOUT_MS = 15_000

function unwrapResponse(value) {
  return value && typeof value === 'object' && value.data !== undefined ? value.data : value
}

async function parseJsonResponse(response) {
  if (response.status === 204) return null
  let body
  try {
    body = await response.json()
  } catch {
    throw new Error(`服务器返回了无法解析的响应（HTTP ${response.status}）`)
  }
  if (!response.ok) {
    const message = body && body.error && body.error.message
      ? body.error.message
      : `服务器返回 HTTP ${response.status}`
    const error = new Error(message)
    error.status = response.status
    error.code = body && body.error ? body.error.code : ''
    throw error
  }
  return unwrapResponse(body)
}

function normalizeTrackRequest(track) {
  if (!track || typeof track !== 'object') return track
  const raw = track.raw && typeof track.raw === 'object' ? track.raw : {}
  const first = (...values) => values.find(value => value !== undefined && value !== null && value !== '')
  return {
    ...raw,
    ...track,
    source: first(track.source, raw.source),
    name: first(track.name, raw.name, track.title, raw.title),
    singer: first(track.singer, raw.singer, track.artist, raw.artist),
    albumName: first(track.albumName, raw.albumName, track.album, raw.album),
    interval: first(track.interval, raw.interval, track.duration, raw.duration),
    songmid: first(track.songmid, raw.songmid, raw.songId),
  }
}

function createApiClient(fetchImpl, serverUrl) {
  let session = null

  function normalizeMediaTrack(track) {
    if (!track || typeof track !== 'object') return track
    const artworkUrl = typeof track.artworkUrl === 'string' && track.artworkUrl.startsWith('/')
      ? new URL(track.artworkUrl, `${serverUrl}/`).href
      : track.artworkUrl
    return { ...track, artworkUrl }
  }

  async function request(pathname, options = {}) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS)
    try {
      const headers = { Accept: 'application/json', ...(options.headers || {}) }
      if (options.body !== undefined) headers['Content-Type'] = 'application/json'
      if (options.auth !== false && session && session.accessToken) {
        headers.Authorization = `Bearer ${session.accessToken}`
      }
      const response = await fetchImpl(`${serverUrl}${pathname}`, {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal,
      })
      return await parseJsonResponse(response)
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('连接服务器超时')
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  async function authenticatedRequest(pathname, options = {}) {
    try {
      return await request(pathname, options)
    } catch (error) {
      if (error.status !== 401 || !session || !session.refreshToken) throw error
      session = await request('/api/v1/auth/refresh', {
        method: 'POST',
        auth: false,
        body: { refreshToken: session.refreshToken },
      })
      return request(pathname, options)
    }
  }

  return {
    get session() { return session },
    setSession(value) { session = value },
    async login(username, password) {
      session = await request('/api/v1/auth/login', {
        method: 'POST',
        auth: false,
        body: { username, password },
      })
      return session
    },
    async refresh() {
      if (!session || !session.refreshToken) throw new Error('没有可用的刷新令牌')
      session = await request('/api/v1/auth/refresh', {
        method: 'POST',
        auth: false,
        body: { refreshToken: session.refreshToken },
      })
      return session
    },
    async getSnapshot() {
      return authenticatedRequest('/api/v1/sync/snapshot')
    },
    async restoreSnapshot(snapshot, options = {}) {
      return authenticatedRequest('/api/v1/sync/snapshot', {
        method: 'PUT',
        body: {
          confirm: 'restore',
          snapshot,
          expectedEmpty: options.expectedEmpty === true,
          expectedRevision: options.expectedRevision || undefined,
        },
      })
    },
    search(query, source = 'tx', page = 1, limit = 30) {
      const params = new URLSearchParams({ query, source, page: String(page), limit: String(limit) })
      return authenticatedRequest(`/api/v1/search?${params}`)
    },
    searchEntities(query, type, source = 'tx', page = 1, limit = 30) {
      const params = new URLSearchParams({ query, type, source, page: String(page), limit: String(limit) })
      return authenticatedRequest(`/api/v1/search?${params}`)
    },
    resolveTrack(track, quality = 'flac') {
      const localTrackId = track && (track.localTrackId || (track.streamPath && track.id))
      if (localTrackId) {
        return authenticatedRequest(`/api/v1/library/tracks/${encodeURIComponent(localTrackId)}/stream-token`, {
          method: 'POST',
        }).then(media => ({
          url: new URL(media.path, `${serverUrl}/`).href,
          track,
          quality: track.quality || quality,
          actualSource: track.source || track.downloadSource || 'local',
          local: true,
        }))
      }
      return authenticatedRequest('/api/v1/tracks/resolve', {
        method: 'POST',
        timeoutMs: 45_000,
        body: {
          track: normalizeTrackRequest(track),
          quality,
          allowQualityFallback: true,
          allowPlatformSwitch: true,
          allowSourceSwitch: true,
        },
      })
    },
    getLyrics(track) {
      return authenticatedRequest('/api/v1/lyrics', { method: 'POST', body: { track }, timeoutMs: 30_000 })
    },
    getPlaylists() {
      return authenticatedRequest('/api/v1/playlists')
    },
    getPlaylist(id) {
      return authenticatedRequest(`/api/v1/playlists/${encodeURIComponent(id)}`).then(value => ({
        ...value,
        items: Array.isArray(value?.items) ? value.items.map(normalizeMediaTrack) : [],
      }))
    },
    createPlaylist(name) {
      return authenticatedRequest('/api/v1/playlists', { method: 'POST', body: { name } })
    },
    renamePlaylist(id, name) {
      return authenticatedRequest(`/api/v1/playlists/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: { name },
      })
    },
    deletePlaylist(id) {
      return authenticatedRequest(`/api/v1/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    addTracks(id, tracks) {
      return authenticatedRequest(`/api/v1/playlists/${encodeURIComponent(id)}/tracks`, {
        method: 'POST', body: { tracks },
      })
    },
    removeTrack(id, trackId) {
      return authenticatedRequest(`/api/v1/playlists/${encodeURIComponent(id)}/tracks/${encodeURIComponent(trackId)}`, {
        method: 'DELETE',
      })
    },
    getLeaderboards(source = 'tx') {
      return authenticatedRequest(`/api/v1/leaderboards?source=${encodeURIComponent(source)}`)
    },
    getLeaderboardTracks(source, boardId, page = 1) {
      return authenticatedRequest(`/api/v1/leaderboards/${encodeURIComponent(boardId)}/tracks?source=${encodeURIComponent(source)}&page=${page}`)
    },
    getLibrary(type) {
      return authenticatedRequest(`/api/v1/library/${type}`)
    },
    getLibraryTracks(page = 1, limit = 500, query = '') {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (query) params.set('query', query)
      return authenticatedRequest(`/api/v1/library/tracks?${params}`).then(value => ({
        ...value,
        items: Array.isArray(value?.items) ? value.items.map(normalizeMediaTrack) : [],
      }))
    },
    saveLibrary(type, items) {
      return authenticatedRequest(`/api/v1/library/${type}`, { method: 'PUT', body: { items } })
    },
    getEntityDetail(kind, id, source = 'tx', context = {}) {
      const collection = kind === 'singer' ? 'artists' : 'albums'
      const params = new URLSearchParams({ source })
      if (context.name) params.set('name', context.name)
      if (context.artist) params.set('artist', context.artist)
      return authenticatedRequest(`/api/v1/${collection}/${encodeURIComponent(id)}?${params}`)
    },
  }
}

module.exports = { createApiClient, normalizeTrackRequest, parseJsonResponse, unwrapResponse }
