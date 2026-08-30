'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { Readable } = require('node:stream')
const ffmpeg = require('@ffmpeg-installer/ffmpeg')
const { XIAOAI_RELAY_PORT, XiaoaiRelay, findMp3Frame } = require('../electron/xiaoai-relay.cjs')

function mp3Frame(fill = 0x41) {
  const frame = Buffer.alloc(417, fill)
  frame[0] = 0xff
  frame[1] = 0xfb
  frame[2] = 0x90
  frame[3] = 0x64
  return frame
}

function wavTone(durationSeconds = 1, sampleRate = 44100) {
  const sampleCount = durationSeconds * sampleRate
  const data = Buffer.alloc(sampleCount * 2)
  for (let index = 0; index < sampleCount; index++) {
    const sample = Math.round(Math.sin(index * 2 * Math.PI * 440 / sampleRate) * 12000)
    data.writeInt16LE(sample, index * 2)
  }
  const wav = Buffer.alloc(44 + data.length)
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + data.length, 4); wav.write('WAVE', 8)
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
  wav.write('data', 36); wav.writeUInt32LE(data.length, 40); data.copy(wav, 44)
  return wav
}

async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return server.address().port
}

test('relays an audio response and preserves range requests', async () => {
  const calls = []
  const relay = new XiaoaiRelay(async (url, options) => {
    calls.push({ url, options })
    return {
      status: 206,
      headers: {
        get: name => ({ 'content-type': 'audio/mpeg', 'content-length': '4', 'content-range': 'bytes 0-3/4', 'accept-ranges': 'bytes' }[name] || null),
      },
      body: Readable.toWeb(Readable.from([Buffer.from('test')])),
    }
  }, () => '127.0.0.1', 0)
  const source = await relay.start('https://source.example/song.mp3')
  assert.notEqual(new URL(source).port, String(XIAOAI_RELAY_PORT))
  const responsePromise = fetch(source, { headers: { Range: 'bytes=0-3' } })
  await relay.waitUntilStreaming(1_000)
  const response = await responsePromise
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-type'), 'audio/mpeg')
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/4')
  assert.equal(response.headers.get('content-length'), '4')
  assert.equal(await response.text(), 'test')
  assert.equal(calls[0].options.headers.Range, 'bytes=0-3')
  await relay.stop()
})

test('relays each item of a multi-song queue through its own URL', async () => {
  const calls = []
  const relay = new XiaoaiRelay(async (url, options) => {
    calls.push({ url, options })
    return {
      status: 200,
      ok: true,
      headers: { get: name => ({ 'content-type': 'audio/mpeg', 'content-length': '4' }[name] || null) },
      body: Readable.toWeb(Readable.from([Buffer.from(url.endsWith('two.mp3') ? 'two!' : 'one!')])),
    }
  }, () => '127.0.0.1', 0)
  const sources = await relay.start([
    { url: 'https://source.example/one.mp3', id: 'one' },
    { url: 'https://source.example/two.mp3', id: 'two' },
  ])
  assert.ok(Array.isArray(sources))
  assert.equal(sources.length, 2)
  assert.equal(await (await fetch(sources[0])).text(), 'one!')
  assert.equal(await (await fetch(sources[1])).text(), 'two!')
  assert.deepEqual(calls.map(call => call.url), [
    'https://source.example/one.mp3',
    'https://source.example/two.mp3',
  ])
  await relay.stop()
})

test('reports when the speaker never connects to the relay', async () => {
  const relay = new XiaoaiRelay(async () => { throw new Error('not used') }, () => '127.0.0.1', 0)
  await relay.start('https://source.example/song.mp3')
  await assert.rejects(relay.waitUntilStreaming(20), /未连接到 Windows 音频中转/)
  await relay.stop()
})

test('maps a seek offset to upstream byte ranges', async () => {
  const calls = []
  const audioSource = Buffer.concat(Array.from({ length: 8 }, (_, index) => mp3Frame(0x41 + index)))
  const relay = new XiaoaiRelay(async (url, options) => {
    calls.push({ url, options })
    const range = options.headers.Range
    if (range === 'bytes=0-0') {
      return {
        status: 206,
        headers: { get: name => ({ 'content-range': `bytes 0-0/${audioSource.length}`, 'content-length': '1' }[name] || null) },
        body: Readable.toWeb(Readable.from([Buffer.from('x')])),
      }
    }
    const requested = /^bytes=(\d+)-(\d+)$/.exec(range || '')
    const start = Number(requested?.[1] || 0)
    const end = Math.min(Number(requested?.[2] || audioSource.length - 1), audioSource.length - 1)
    const length = end - start + 1
    return {
      status: 206,
      headers: {
        get: name => ({
          'content-type': 'audio/mpeg',
          'content-length': String(length),
          'content-range': `bytes ${start}-${end}/${audioSource.length}`,
          'accept-ranges': 'bytes',
        }[name] || null),
      },
      body: Readable.toWeb(Readable.from([audioSource.subarray(start, end + 1)])),
    }
  }, () => '127.0.0.1', 0)

  const source = await relay.start('https://source.example/song.mp3', { offsetSeconds: 50, durationSeconds: 100 })
  const responsePromise = fetch(source, { headers: { Range: 'bytes=10-19' } })
  await relay.waitUntilStreaming(1_000)
  const response = await responsePromise
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 10-19/1668')
  assert.equal(response.headers.get('content-length'), '10')
  assert.equal((await response.arrayBuffer()).byteLength, 10)
  assert.equal(calls[0].options.headers.Range, 'bytes=0-0')
  assert.equal(calls[1].options.headers.Range, 'bytes=0-262143')
  assert.equal(calls[2].options.headers.Range, 'bytes=0-3335')
  assert.equal(calls[3].options.headers.Range, 'bytes=1678-1687')
  await relay.stop()
})

test('returns a partial response for a seek stream even when the speaker omits Range', async () => {
  const audioSource = Buffer.concat(Array.from({ length: 8 }, (_, index) => mp3Frame(0x51 + index)))
  const relay = new XiaoaiRelay(async (_url, options) => {
    const range = options.headers.Range
    const requested = /^bytes=(\d+)-(\d+)?$/.exec(range || '')
    const start = Number(requested?.[1] || 0)
    const end = Math.min(Number(requested?.[2] || audioSource.length - 1), audioSource.length - 1)
    return {
      status: 206,
      headers: {
        get: name => ({
          'content-type': 'audio/mpeg',
          'content-length': String(end - start + 1),
          'content-range': `bytes ${start}-${end}/${audioSource.length}`,
          'accept-ranges': 'bytes',
        }[name] || null),
      },
      body: Readable.toWeb(Readable.from([audioSource.subarray(start, end + 1)])),
    }
  }, () => '127.0.0.1', 0)

  const source = await relay.start('https://source.example/song.mp3', { offsetSeconds: 50, durationSeconds: 100 })
  const responsePromise = fetch(source)
  await relay.waitUntilStreaming(1_000)
  const response = await responsePromise
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 0-1667/1668')
  assert.equal(response.headers.get('content-length'), '1668')
  assert.equal((await response.arrayBuffer()).byteLength, 1668)
  await relay.stop()
})

test('does not fabricate 206 when the upstream ignores a Range request', async () => {
  const audioSource = Buffer.concat(Array.from({ length: 3 }, (_, index) => mp3Frame(0x61 + index)))
  const relay = new XiaoaiRelay(async () => ({
    status: 200,
    ok: true,
    headers: {
      get: name => ({ 'content-type': 'audio/mpeg', 'content-length': String(audioSource.length), 'accept-ranges': 'none' }[name] || null),
    },
    body: Readable.toWeb(Readable.from([audioSource])),
  }), () => '127.0.0.1', 0)

  const source = await relay.start('https://source.example/song.mp3')
  const responsePromise = fetch(source, { headers: { Range: 'bytes=0-10' } })
  await relay.waitUntilStreaming(1_000)
  const response = await responsePromise
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-range'), null)
  assert.equal((await response.arrayBuffer()).byteLength, audioSource.length)
  await relay.stop()
})

test('transcodes a local lossless source to a valid MP3 stream', async () => {
  const wav = wavTone()
  const sourceServer = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': String(wav.length) })
    response.end(wav)
  })
  const sourcePort = await listen(sourceServer)
  const relay = new XiaoaiRelay(fetch, () => '127.0.0.1', 0, ffmpeg.path)
  try {
    const source = await relay.start(`http://127.0.0.1:${sourcePort}/tone.wav`, { transcode: true })
    const responsePromise = fetch(source)
    await relay.waitUntilStreaming(5_000)
    const response = await responsePromise
    const audio = Buffer.from(await response.arrayBuffer())
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'audio/mpeg')
    assert.ok(audio.length > 10_000)
    assert.ok(findMp3Frame(audio), 'expected at least two valid consecutive MP3 frames')
  } finally {
    await relay.stop()
    await new Promise(resolve => sourceServer.close(resolve))
  }
})
