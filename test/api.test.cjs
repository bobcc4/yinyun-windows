'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createApiClient } = require('../electron/api.cjs')

function response(status, value) {
  return { ok: status >= 200 && status < 300, status, json: async () => value }
}

test('logs in and restores an explicitly confirmed snapshot', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/auth/login')) return response(200, { data: { accessToken: 'access', refreshToken: 'refresh' } })
    if (options.method === 'PUT') return response(200, { data: { revision: 'new' } })
    return response(200, { data: { revision: 'old', empty: true } })
  }
  const client = createApiClient(fetchImpl, 'https://music.example.com')
  await client.login('admin', 'password')
  await client.getSnapshot()
  await client.restoreSnapshot({ schemaVersion: 1, data: {} }, { expectedEmpty: true })

  assert.equal(calls[1].options.headers.Authorization, 'Bearer access')
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    confirm: 'restore',
    snapshot: { schemaVersion: 1, data: {} },
    expectedEmpty: true,
  })
})

test('surfaces API error messages', async () => {
  const client = createApiClient(async () => response(401, {
    error: { code: 'invalid_credentials', message: '用户名或密码错误' },
  }), 'https://music.example.com')
  await assert.rejects(() => client.login('admin', 'bad'), /用户名或密码错误/)
})

test('refreshes an expired access token before restoring', async () => {
  let restoreAttempts = 0
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/auth/login')) return response(200, { data: { accessToken: 'expired', refreshToken: 'refresh' } })
    if (url.endsWith('/auth/refresh')) return response(200, { data: { accessToken: 'renewed', refreshToken: 'next' } })
    if (options.method === 'PUT') {
      restoreAttempts++
      if (restoreAttempts === 1) return response(401, { error: { code: 'unauthorized', message: 'expired' } })
      assert.equal(options.headers.Authorization, 'Bearer renewed')
      return response(200, { data: { revision: 'restored' } })
    }
    throw new Error(`Unexpected request: ${url}`)
  }
  const client = createApiClient(fetchImpl, 'https://music.example.com')
  await client.login('admin', 'password')
  const restored = await client.restoreSnapshot({ schemaVersion: 1, data: {} })
  assert.equal(restored.revision, 'restored')
  assert.equal(restoreAttempts, 2)
})

test('uses authenticated player and playlist API routes', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/auth/login')) return response(200, { data: { accessToken: 'access', refreshToken: 'refresh' } })
    if (url.includes('/search?')) return response(200, { data: { items: [], total: 0 } })
    if (url.endsWith('/tracks/resolve')) return response(200, { data: { url: 'https://media.example/song.flac' } })
    if (url.endsWith('/playlists') && options.method === 'POST') return response(201, { data: { id: 'new-list', name: '新歌单' } })
    if (url.includes('/playlists/new-list/tracks') && options.method === 'POST') return response(200, { data: { added: 1 } })
    if (url.includes('/playlists/new-list/tracks/') && options.method === 'DELETE') return response(204)
    throw new Error(`Unexpected request: ${url}`)
  }
  const client = createApiClient(fetchImpl, 'https://music.example.com')
  await client.login('admin', 'password')
  await client.search('心跳', 'tx')
  await client.resolveTrack({ id: 'tx_song', source: 'tx' }, 'flac')
  await client.createPlaylist('新歌单')
  await client.addTracks('new-list', [{ id: 'tx_song', source: 'tx' }])
  await client.removeTrack('new-list', 'tx_song')

  assert.match(calls[1].url, /\/api\/v1\/search\?.*limit=30/)
  assert.equal(calls[1].options.headers.Authorization, 'Bearer access')
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    track: { id: 'tx_song', source: 'tx' },
    quality: 'flac',
    allowQualityFallback: true,
    allowPlatformSwitch: true,
    allowSourceSwitch: true,
  })
  assert.equal(calls[5].options.method, 'DELETE')
})

test('refreshes expired sessions for player API requests', async () => {
  let attempts = 0
  const client = createApiClient(async (url, options) => {
    if (url.endsWith('/auth/login')) return response(200, { data: { accessToken: 'expired', refreshToken: 'refresh' } })
    if (url.endsWith('/auth/refresh')) return response(200, { data: { accessToken: 'renewed', refreshToken: 'next' } })
    if (url.endsWith('/playlists')) {
      attempts++
      if (attempts === 1) return response(401, { error: { message: 'expired' } })
      assert.equal(options.headers.Authorization, 'Bearer renewed')
      return response(200, { data: [] })
    }
    throw new Error(`Unexpected request: ${url}`)
  }, 'https://music.example.com')
  await client.login('admin', 'password')
  assert.deepEqual(await client.getPlaylists(), [])
  assert.equal(attempts, 2)
})

test('uses leaderboard, entity library, and extended search routes', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/auth/login')) return response(200, { data: { accessToken: 'access', refreshToken: 'refresh' } })
    if (url.includes('/search?')) return response(200, { data: { items: [{ id: 'tx_artist', name: '歌手', source: 'tx' }] } })
    if (url.includes('/leaderboards?')) return response(200, { data: { list: [{ id: 'tx__4', bangid: '4', name: '流行榜' }] } })
    if (url.includes('/leaderboards/4/tracks')) return response(200, { data: { items: [{ id: 'tx_song', name: '歌曲', source: 'tx' }] } })
    if (url.endsWith('/library/artists')) return options.method === 'PUT'
      ? response(200, { data: { items: [{ id: 'tx_artist', name: '歌手', source: 'tx' }] } })
      : response(200, { data: [{ id: 'tx_artist', name: '歌手', source: 'tx' }] })
    if (url.endsWith('/library/albums')) return response(200, { data: [] })
    throw new Error(`Unexpected request: ${url}`)
  }
  const client = createApiClient(fetchImpl, 'https://music.example.com')
  await client.login('admin', 'password')
  await client.searchEntities('歌手', 'singer', 'tx')
  await client.getLeaderboards('tx')
  await client.getLeaderboardTracks('tx', '4')
  await client.getLibrary('artists')
  await client.saveLibrary('artists', [{ id: 'tx_artist', name: '歌手', source: 'tx' }])

  assert.match(calls[1].url, /[?&]type=singer/)
  assert.match(calls[2].url, /\/leaderboards\?source=tx/)
  assert.match(calls[3].url, /\/leaderboards\/4\/tracks\?source=tx/)
  assert.equal(calls[5].options.method, 'PUT')
  assert.deepEqual(JSON.parse(calls[5].options.body), { items: [{ id: 'tx_artist', name: '歌手', source: 'tx' }] })
})
