'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { XiaoaiClient, XiaomiQrLogin, createXiaoaiManager, exchangeServiceToken, normalizeConversationRecord, normalizePlayDetail, parseUbusConversations, splitSetCookie, stripJsonPrefix } = require('../electron/xiaoai.cjs')
const { parseXiaoaiVoiceCommand, normalizeXiaoaiVoiceText } = require('../renderer/xiaoai-voice.js')

function headers(values = {}) {
  return {
    get: name => values[String(name).toLowerCase()] ?? null,
    getSetCookie: () => values['set-cookie'] || [],
  }
}

function response(status, body, values = {}) {
  return { ok: status >= 200 && status < 300, status, headers: headers(values), text: async () => typeof body === 'string' ? body : JSON.stringify(body) }
}

test('normalizes prefixed Xiaomi JSON and combined Set-Cookie headers', () => {
  assert.equal(stripJsonPrefix('&&&START&&& {"code":0}'), '{"code":0}')
  assert.deepEqual(splitSetCookie('serviceToken=one; Path=/, userId=two; Path=/'), [
    'serviceToken=one; Path=/',
    ' userId=two; Path=/',
  ])
})

test('ignores the wake word and recognizes complete XiaoAI controls', () => {
  assert.deepEqual(parseXiaoaiVoiceCommand('小爱同学'), { action: 'ignore', query: '' })
  assert.deepEqual(parseXiaoaiVoiceCommand('小爱同学下一首'), { action: 'next', query: '' })
  assert.deepEqual(parseXiaoaiVoiceCommand('请播放 夜曲'), { action: 'play', query: '夜曲' })
  assert.deepEqual(parseXiaoaiVoiceCommand('暂停播放'), { action: 'pause', query: '' })
  assert.equal(normalizeXiaoaiVoiceText('播放：夜曲！'), '播放夜曲')
})

test('normalizes Xiaomi conversation records and UBus records', () => {
  assert.deepEqual(normalizeConversationRecord({ id: 'r1', time: 123, query: '下一首', answers: [{ type: 'TTS', tts: { text: '好的' } }] }), { id: 'r1', timestamp: 123, query: '下一首', answer: '好的' })
  assert.deepEqual(parseUbusConversations({ data: { info: JSON.stringify({ result: [{ nlp: JSON.stringify({ meta: { timestamp: '123', request_id: 'r2' }, response: { answer: [{ intention: { query: '暂停播放' }, content: { to_speak: '好的' } }] } }) }] }) } }), [{ id: 'r2', timestamp: 123, query: '暂停播放', answer: '好的' }])
})

test('reads Xiaomi conversation records using the selected speaker identity', async () => {
  let request
  const client = new XiaoaiClient(async (url, options) => {
    request = { url, options }
    return response(200, { data: JSON.stringify({ records: [{ id: 'r1', time: 456, query: '小爱同学下一首', answers: [] }] }) })
  }, { userId: 'user', serviceToken: 'token', deviceId: 'client-device' })
  const records = await client.conversations({ id: 'speaker-1', hardware: 'LX05' }, 5)
  assert.equal(new URL(request.url).hostname, 'userprofile.mina.mi.com')
  assert.equal(new URL(request.url).searchParams.get('hardware'), 'LX05')
  assert.equal(new URL(request.url).searchParams.get('limit'), '5')
  assert.match(request.options.headers.Cookie, /deviceId=speaker-1/)
  assert.deepEqual(records, [{ id: 'r1', timestamp: 456, query: '小爱同学下一首', answer: '' }])
})

test('normalizes Xiaomi playback details for remote queue matching', () => {
  assert.deepEqual(normalizePlayDetail({
    play_song_detail: {
      audio_id: 'speaker-audio-id', song_name: '来自天堂的魔鬼', artist_name: '邓紫棋',
      album_name: '新的心跳', position: 12500, duration: 240000,
    },
  }), {
    audioId: 'speaker-audio-id', title: '来自天堂的魔鬼', artist: '邓紫棋', album: '新的心跳',
    position: 12.5, duration: 240, detail: {
      audio_id: 'speaker-audio-id', song_name: '来自天堂的魔鬼', artist_name: '邓紫棋',
      album_name: '新的心跳', position: 12500, duration: 240000,
    },
  })
})

test('creates a local QR image from Xiaomi loginUrl', async () => {
  const calls = []
  const fetchImpl = async url => {
    calls.push(url)
    if (calls.length === 1) return response(200, `&&&START&&&${JSON.stringify({ _sign: 'sign', qs: 'query', callback: 'callback' })}`)
    return response(200, { code: 0, lp: 'https://account.xiaomi.com/poll', loginUrl: 'https://account.xiaomi.com/confirm?id=1' })
  }
  const result = await new XiaomiQrLogin(fetchImpl).start()
  assert.equal(result.state, 'waiting')
  assert.match(result.qrcodeUrl, /^data:image\/png;base64,/)
  assert.equal(result.loginUrl, 'https://account.xiaomi.com/confirm?id=1')
})

test('uses the micoapi userId returned during service-token exchange', async () => {
  const calls = []
  const fetchImpl = async url => {
    calls.push(url)
    if (calls.length === 1) return response(200, `&&&START&&&${JSON.stringify({ code: 0, location: 'https://account.xiaomi.com/pass/token', ssecurity: 'security', nonce: 123, userId: 'mico-user' })}`)
    return response(200, '', { 'set-cookie': ['serviceToken=mico-token; Path=/', 'userId=mico-user; Path=/'] })
  }
  const result = await exchangeServiceToken(fetchImpl, { passToken: 'pass', userId: 'qr-user', deviceId: 'device' })
  assert.equal(result.userId, 'mico-user')
  assert.equal(result.serviceToken, 'mico-token')
})

test('keeps the QR session cUserId and accepts nested device-list responses', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('/device_list')) return response(200, { code: 0, data: { devices: [{ device_id: 'speaker-1', nickname: '卧室音箱', modelName: 'LX05', online: true }] } })
    throw new Error(`Unexpected request: ${url}`)
  }
  const client = new XiaoaiClient(fetchImpl, { userId: 'user', serviceToken: 'token', deviceId: 'device', cUserId: 'c-user' })
  const [device] = await client.devices()
  assert.deepEqual(device, { id: 'speaker-1', name: '卧室音箱', alias: '', hardware: 'LX05', model: '', presence: 'online', miotDID: '' })
})

test('normalizes devices and sends real Mina playback controls', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('/device_list')) return response(200, { code: 0, data: [{ deviceID: 'speaker-1', name: '客厅音箱', hardware: 'LX05', presence: 'online' }] })
    if (url.includes('/remote/ubus')) return response(200, { code: 0, data: { code: 0, info: JSON.stringify({ status: 1, volume: 42, play_song_detail: { position: 12000 } }) } })
    throw new Error(`Unexpected request: ${url}`)
  }
  const client = new XiaoaiClient(fetchImpl, { userId: 'user', serviceToken: 'token', deviceId: 'device' })
  const [device] = await client.devices()
  assert.equal(device.name, '客厅音箱')
  await client.play(device, 'https://music.example/song.mp3')
  await client.setVolume(device, 37)
  const status = await client.status(device)
  assert.deepEqual(status, { status: 1, volume: 42, position: 12, audioId: '', title: '', artist: '', album: '', duration: 0, detail: { position: 12000 } })
  const bodies = calls.filter(call => call.url.includes('/remote/ubus')).map(call => new URLSearchParams(call.options.body))
  assert.equal(bodies[0].get('method'), 'player_play_music')
  assert.equal(bodies[1].get('method'), 'player_set_volume')
  assert.deepEqual(JSON.parse(bodies[1].get('message')), { volume: 37 })
})

test('keeps encrypted account data out of the public manager state', () => {
  const stored = { account: { userId: 'private-user', passToken: 'private-pass', serviceToken: 'private-service' }, selectedDeviceId: 'speaker-1', selectedDevice: { id: 'speaker-1', name: '客厅音箱' } }
  const manager = createXiaoaiManager({ fetchImpl: async () => { throw new Error('not used') }, store: { read: () => stored, write: () => {}, remove: () => {} } })
  assert.deepEqual(manager.state(), { loggedIn: true, selectedDeviceId: 'speaker-1', selectedDevice: { id: 'speaker-1', name: '客厅音箱' } })
  assert.equal('passToken' in manager.state(), false)
  assert.equal('userId' in manager.state(), false)
})

test('only selects devices returned by the signed-in Xiaomi account', async () => {
  const stored = { account: { userId: 'user', serviceToken: 'token', deviceId: 'device' } }
  let saved
  const manager = createXiaoaiManager({
    fetchImpl: async url => {
      if (url.includes('/device_list')) return response(200, { code: 0, data: [{ deviceID: 'speaker-1', name: '客厅音箱', hardware: 'LX05' }] })
      throw new Error(`Unexpected request: ${url}`)
    },
    store: { read: () => stored, write: value => { saved = value }, remove: () => {} },
  })
  assert.throws(() => manager.selectDevice('forged-device'), /设备不在当前小米账号/)
  await manager.devices()
  assert.equal(manager.selectDevice('speaker-1').selectedDevice.name, '客厅音箱')
  assert.equal(saved.selectedDevice.id, 'speaker-1')
})

test('retries a temporarily empty device list after QR login', async () => {
  const stored = { account: { userId: 'user', serviceToken: 'token', deviceId: 'device' } }
  let calls = 0
  const manager = createXiaoaiManager({
    fetchImpl: async url => {
      if (url.includes('/device_list')) {
        calls++
        return response(200, calls === 1 ? { code: 0, data: [] } : { code: 0, data: [{ deviceID: 'speaker-1', name: '客厅音箱', hardware: 'LX05' }] })
      }
      throw new Error(`Unexpected request: ${url}`)
    },
    store: { read: () => stored, write: () => {}, remove: () => {} },
  })
  const devices = await manager.devices()
  assert.deepEqual(devices.map(device => device.id), ['speaker-1'])
  assert.equal(calls, 2)
})

test('falls back to the alternate Mina playback method when the preferred method is rejected', async () => {
  const methods = []
  const client = new XiaoaiClient(async (url, options) => {
    const body = new URLSearchParams(options.body)
    methods.push(body.get('method'))
    return response(200, { code: 0, data: { code: methods.length === 1 ? 1 : 0 } })
  }, { userId: 'user', serviceToken: 'token', deviceId: 'device' })
  await client.play({ id: 'speaker-1', hardware: 'LX05' }, 'https://music.example/song.mp3')
  assert.deepEqual(methods, ['player_play_music', 'player_play_url'])
})

test('sends a two-item queue with stable track identifiers', async () => {
  let request
  const client = new XiaoaiClient(async (_url, options) => {
    const body = new URLSearchParams(options.body)
    request = { method: body.get('method'), message: JSON.parse(body.get('message')) }
    return response(200, { code: 0, data: { code: 0 } })
  }, { userId: 'user', serviceToken: 'token', deviceId: 'device' })
  await client.playQueue({ id: 'speaker-1', hardware: 'LX05' }, [
    { id: 'track-one', url: 'http://127.0.0.1/one.mp3', title: 'One', artist: 'Artist' },
    { id: 'track-two', url: 'http://127.0.0.1/two.mp3', title: 'Two', artist: 'Artist' },
  ])
  assert.equal(request.method, 'player_play_music')
  const music = JSON.parse(request.message.music)
  assert.equal(music.play_behavior, 'REPLACE_ALL')
  assert.deepEqual(music.payload.audio_items.map(item => item.item_id.audio_id), ['track-one', 'track-two'])
  assert.deepEqual(music.payload.audio_items.map(item => item.stream.url), [
    'http://127.0.0.1/one.mp3',
    'http://127.0.0.1/two.mp3',
  ])
})

test('pause does not turn into stop when Mina reports stale playing state', async () => {
  const methods = []
  const client = new XiaoaiClient(async (_url, options) => {
    const body = new URLSearchParams(options.body)
    methods.push(body.get('method'))
    return response(200, { code: 0, data: { code: 0, info: JSON.stringify({ status: 1, play_song_detail: { position: 0 } }) } })
  }, { userId: 'user', serviceToken: 'token', deviceId: 'device' })
  const result = await client.pause({ id: 'speaker-1', hardware: 'LX06' })
  assert.deepEqual(result, { stopped: false })
  assert.deepEqual(methods, ['player_play_operation'])
})
