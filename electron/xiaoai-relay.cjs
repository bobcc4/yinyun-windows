'use strict'

const http = require('node:http')
const os = require('node:os')
const crypto = require('node:crypto')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const XIAOAI_RELAY_PORT = 39781

function contentRangeTotal(value) {
  const match = /\/(\d+)$/.exec(String(value || '').trim())
  return match ? Number(match[1]) : 0
}

function contentRangeBounds(value) {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(String(value || '').trim())
  if (!match) return null
  return { start: Number(match[1]), end: Number(match[2]), total: match[3] === '*' ? 0 : Number(match[3]) }
}

function requestRange(value) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(value || '').trim())
  if (!match || (!match[1] && !match[2])) return null
  return { start: match[1] ? Number(match[1]) : null, end: match[2] ? Number(match[2]) : null }
}

function rangeLength(start, end) {
  return end >= start ? end - start + 1 : 0
}

async function responseBuffer(response) {
  if (typeof response?.arrayBuffer === 'function') return Buffer.from(await response.arrayBuffer())
  const body = response?.body
  if (!body) return Buffer.alloc(0)
  const chunks = []
  if (typeof body.getReader === 'function') {
    const reader = body.getReader()
    try {
      while (true) {
        const result = await reader.read()
        if (result.done) break
        if (result.value) chunks.push(Buffer.from(result.value))
      }
    } finally {
      try { await reader.releaseLock?.() } catch {}
    }
  } else if (body[Symbol.asyncIterator]) {
    for await (const chunk of body) chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function mp3FrameInfo(buffer, offset) {
  if (offset + 4 > buffer.length || buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) return null
  const versionBits = (buffer[offset + 1] >> 3) & 0x03
  const layer = (buffer[offset + 1] >> 1) & 0x03
  const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f
  const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03
  const padding = (buffer[offset + 2] >> 1) & 0x01
  if (versionBits === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null
  const version = versionBits === 3 ? 1 : 2
  const bitrates = version === 1
    ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
  const sampleRates = versionBits === 3 ? [44100, 48000, 32000] : versionBits === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000]
  const bitrate = bitrates[bitrateIndex] * 1000
  const sampleRate = sampleRates[sampleRateIndex]
  const frameLength = Math.floor((version === 1 ? 144 : 72) * bitrate / sampleRate) + padding
  if (!frameLength) return null
  return { version, bitrate, sampleRate, frameLength }
}

function findMp3Frame(buffer, start = 0) {
  for (let offset = Math.max(0, start); offset + 4 <= buffer.length; offset++) {
    const info = mp3FrameInfo(buffer, offset)
    if (!info || offset + info.frameLength + 4 > buffer.length) continue
    const next = mp3FrameInfo(buffer, offset + info.frameLength)
    if (next) return { offset, ...info }
  }
  return null
}

function parseMp3SeekHeader(buffer, frame) {
  if (!frame) return null
  const mono = (buffer[frame.offset + 3] & 0xc0) === 0xc0
  const sideInfoLength = frame.version === 1 ? (mono ? 17 : 32) : (mono ? 9 : 17)
  const xingOffset = frame.offset + 4 + sideInfoLength
  for (const offset of [xingOffset, frame.offset + 32]) {
    const marker = buffer.toString('ascii', offset, offset + 4)
    if (!['Xing', 'Info', 'VBRI'].includes(marker)) continue
    if (marker === 'VBRI' && offset + 26 <= buffer.length) {
      return {
        kind: 'vbri',
        frames: buffer.readUInt32BE(offset + 14),
        bytes: buffer.readUInt32BE(offset + 10),
        tocOffset: offset + 26,
      }
    }
    if (offset + 8 > buffer.length) continue
    const flags = buffer.readUInt32BE(offset + 4)
    let cursor = offset + 8
    let frames = 0
    let bytes = 0
    let toc = null
    if (flags & 0x01) { if (cursor + 4 > buffer.length) continue; frames = buffer.readUInt32BE(cursor); cursor += 4 }
    if (flags & 0x02) { if (cursor + 4 > buffer.length) continue; bytes = buffer.readUInt32BE(cursor); cursor += 4 }
    if (flags & 0x04) { if (cursor + 4 > buffer.length) continue; toc = buffer.subarray(cursor, cursor + 100); cursor += 100 }
    return { kind: 'xing', frames, bytes, toc }
  }
  return null
}

function estimateMp3Offset(buffer, sourceSize, offsetSeconds, durationSeconds) {
  const first = findMp3Frame(buffer)
  if (!first) return null
  const target = Math.max(0, Math.min(Number(offsetSeconds) || 0, Number(durationSeconds) || 0))
  const fraction = durationSeconds > 0 ? target / durationSeconds : 0
  const header = parseMp3SeekHeader(buffer, first)
  let estimate
  if (header?.toc?.length === 100 && header.bytes > first.offset) {
    const scaled = fraction * 99
    const index = Math.min(99, Math.floor(scaled))
    const next = Math.min(99, index + 1)
    const part = header.toc[index] + (header.toc[next] - header.toc[index]) * (scaled - index)
    estimate = first.offset + Math.floor((header.bytes - first.offset) * part / 256)
  } else if (header?.kind === 'vbri' && header.bytes > first.offset) {
    estimate = first.offset + Math.floor((header.bytes - first.offset) * fraction)
  } else {
    estimate = first.offset + Math.floor(Math.max(0, sourceSize - first.offset) * fraction)
  }
  return Math.max(first.offset, Math.min(Math.max(0, sourceSize - 1), estimate))
}

function localIpv4() {
  const interfaces = os.networkInterfaces()
  const candidates = []
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal || entry.address.startsWith('169.254.')) continue
      candidates.push(entry.address)
    }
  }
  return candidates.find(address => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)) || candidates[0] || ''
}

class XiaoaiRelay {
  constructor(fetchImpl, hostResolver = localIpv4, listenPort = XIAOAI_RELAY_PORT, ffmpegPath = '') {
    this.fetch = fetchImpl
    this.hostResolver = hostResolver
    this.listenPort = listenPort
    this.ffmpegPath = String(ffmpegPath || '').replace('app.asar\\', 'app.asar.unpacked\\')
    this.server = null
    this.sourceUrl = ''
    this.sources = []
    this.token = ''
    this.port = 0
    this.host = ''
    this.activeControllers = new Set()
    this.activeTranscoders = new Set()
    this.streamReady = null
    this.resolveStreamReady = null
    this.sourceSize = 0
    this.sourceOffset = 0
    this.sourceFormat = ''
    this.transcode = false
  }

  async probeSourceSize(source = this.sources[0]) {
    const response = await this.fetch(source.url, {
      redirect: 'follow',
      cache: 'no-store',
      headers: { Range: 'bytes=0-0', Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.1' },
    })
    try {
      if (!response.ok && response.status !== 206) return 0
      return contentRangeTotal(response.headers.get('content-range')) || Number(response.headers.get('content-length')) || 0
    } finally {
      try { await response.body?.cancel?.() } catch {}
    }
  }

  async locateSourceOffset(source, offsetSeconds, durationSeconds) {
    const response = await this.fetch(source.url, {
      redirect: 'follow',
      cache: 'no-store',
      headers: { Range: 'bytes=0-262143', Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.1' },
    })
    try {
      if (!response.ok && response.status !== 206) throw new Error(`音频源返回 HTTP ${response.status}`)
      const contentType = String(response.headers.get('content-type') || '').toLowerCase()
      const contentRange = contentRangeBounds(response.headers.get('content-range'))
      const sourceSize = contentRange?.total || source.size || Number(response.headers.get('content-length')) || 0
      const bytes = await responseBuffer(response)
      this.sourceSize = sourceSize
      this.sourceFormat = contentType.includes('mpeg') || /\.mp3(?:\?|$)/i.test(source.url) ? 'mp3' : ''
      if (this.sourceFormat !== 'mp3') throw new Error('小爱定位播放仅支持 MP3 音频源，请选择可转为 MP3 的音质')
      const offset = estimateMp3Offset(bytes, sourceSize, offsetSeconds, durationSeconds)
      if (offset === null) throw new Error('未找到有效的 MP3 音频帧，无法定位播放')
      const windowStart = Math.max(0, offset - 4096)
      const windowEnd = Math.min(sourceSize - 1, offset + 65_535)
      const frameResponse = await this.fetch(source.url, {
        redirect: 'follow',
        cache: 'no-store',
        headers: { Range: `bytes=${windowStart}-${windowEnd}`, Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.1' },
      })
      try {
        if (!frameResponse.ok && frameResponse.status !== 206) throw new Error(`音频源返回 HTTP ${frameResponse.status}`)
        const frameRange = contentRangeBounds(frameResponse.headers.get('content-range'))
        const actualStart = frameRange?.start ?? (frameResponse.status === 200 ? 0 : windowStart)
        const frameBytes = await responseBuffer(frameResponse)
        const frame = findMp3Frame(frameBytes, Math.max(0, offset - actualStart)) || findMp3Frame(frameBytes, Math.max(0, offset - actualStart - 4096))
        if (!frame) throw new Error('未找到有效的 MP3 音频帧，无法定位播放')
        return actualStart + frame.offset
      } finally {
        try { await frameResponse.body?.cancel?.() } catch {}
      }
    } finally {
      try { await response.body?.cancel?.() } catch {}
    }
  }

  async start(sourceUrl, options = {}) {
    const inputSources = Array.isArray(sourceUrl) ? sourceUrl : [{ url: sourceUrl }]
    const sources = inputSources.map((item, index) => {
      const value = typeof item === 'string' ? { url: item } : item || {}
      const url = String(value.url || '')
      if (!/^https?:\/\//i.test(url)) throw new Error('小爱投放地址无效')
      return {
        ...value,
        url,
        transcode: value.transcode === true || (!Object.hasOwn(value, 'transcode') && options.transcode === true),
        offsetSeconds: index === 0 ? Math.max(0, Number(options.offsetSeconds) || 0) : 0,
        offset: 0,
        size: 0,
      }
    })
    await this.stop()
    this.sources = sources
    this.sourceUrl = sources[0].url
    this.transcode = sources[0].transcode
    const offsetSeconds = sources[0].offsetSeconds
    const durationSeconds = Math.max(0, Number(options.durationSeconds) || 0)
    if (this.transcode) {
      if (!this.ffmpegPath || !fs.existsSync(this.ffmpegPath)) throw new Error('Windows MP3 转码组件不可用，请重新安装完整客户端')
      sources[0].offset = 0
      this.sourceFormat = 'mp3'
    } else if (offsetSeconds > 0) {
      if (!durationSeconds) throw new Error('\u5f53\u524d\u6b4c\u66f2\u7f3a\u5c11\u65f6\u957f\u4fe1\u606f\uff0c\u65e0\u6cd5\u5728\u5c0f\u7231\u97f3\u7bb1\u4e2d\u62d6\u52a8\u64ad\u653e')
      sources[0].size = await this.probeSourceSize(sources[0])
      if (!sources[0].size) throw new Error('\u5f53\u524d\u97f3\u9891\u6e90\u4e0d\u652f\u6301\u5b9a\u4f4d\u64ad\u653e')
      sources[0].offset = await this.locateSourceOffset(sources[0], offsetSeconds, durationSeconds)
    }
    this.token = crypto.randomBytes(24).toString('hex')
    this.host = this.hostResolver()
    if (!this.host) throw new Error('未找到可供小爱音箱访问的局域网地址')
    this.streamReady = new Promise(resolve => { this.resolveStreamReady = resolve })

    this.server = http.createServer((request, response) => {
      const match = new RegExp(`^/audio/${this.token}(?:/(\\d+))?$`).exec(request.url || '')
      const index = match ? Number(match[1] || 0) : -1
      void this.handle(request, response, index)
    })
    await new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.listenPort, '0.0.0.0', resolve)
    })
    this.port = this.server.address().port
    const relayUrls = this.sources.map((_, index) => `http://${this.host}:${this.port}/audio/${this.token}${index ? `/${index}` : ''}`)
    return relayUrls.length === 1 ? relayUrls[0] : relayUrls
  }

  async waitUntilStreaming(timeoutMs = 10_000) {
    if (!this.streamReady) throw new Error('小爱音频中转尚未启动')
    let timer
    try {
      return await Promise.race([
        this.streamReady,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('小爱音箱未连接到 Windows 音频中转，请检查 Windows 防火墙及音箱与电脑是否在同一局域网')), timeoutMs)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  isRunning() {
    return Boolean(this.server)
  }

  hasActiveStream() {
    return this.activeControllers.size > 0 || this.activeTranscoders.size > 0
  }

  async handle(request, response, sourceIndex = 0) {
    const source = this.sources[sourceIndex]
    if (!source || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404)
      response.end()
      return
    }
    if (source.transcode) {
      this.handleTranscode(request, response, source)
      return
    }

    const requestedRange = requestRange(request.headers.range)
    const virtualSize = source.size ? Math.max(0, source.size - source.offset) : 0
    let virtualStart = requestedRange?.start ?? 0
    let virtualEnd = requestedRange?.end ?? (virtualSize ? virtualSize - 1 : null)
    if (requestedRange?.start === null && virtualSize) {
      const suffixLength = Math.min(virtualSize, requestedRange.end)
      virtualStart = virtualSize - suffixLength
      virtualEnd = virtualSize - 1
    }
    if (virtualSize && virtualStart >= virtualSize) {
      response.writeHead(416, { 'Content-Range': `bytes */${virtualSize}` })
      response.end()
      return
    }
    const headers = { Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.1' }
    const upstreamStart = source.offset + virtualStart
    if (requestedRange || source.offset) {
      const upstreamEnd = virtualEnd === null ? '' : String(source.offset + virtualEnd)
      headers.Range = `bytes=${upstreamStart}-${upstreamEnd}`
    }
    const controller = new AbortController()
    this.activeControllers.add(controller)
    response.once('close', () => { if (!response.writableEnded) controller.abort() })
    let upstream
    try {
      upstream = await this.fetch(source.url, { redirect: 'follow', cache: 'no-store', headers, signal: controller.signal })
      if (!upstream.ok && upstream.status !== 206) throw new Error(`上游音频返回 HTTP ${upstream.status}`)
      if (source.offset && upstream.status !== 206) throw new Error('\u5f53\u524d\u97f3\u9891\u6e90\u4e0d\u652f\u6301\u5b9a\u4f4d\u64ad\u653e')
      const upstreamRange = contentRangeBounds(upstream.headers.get('content-range'))
      const sourceSize = upstreamRange?.total || source.size || contentRangeTotal(upstream.headers.get('content-range'))
      if (sourceSize) source.size = sourceSize
      const totalVirtualSize = sourceSize ? Math.max(0, sourceSize - source.offset) : 0
      const actualStart = upstreamRange?.start ?? upstreamStart
      const actualEnd = upstreamRange?.end ?? (actualStart + Number(upstream.headers.get('content-length') || 0) - 1)
      const isPartialUpstream = upstream.status === 206 && Boolean(upstreamRange)
      const responseStart = Math.max(0, actualStart - source.offset)
      const responseEnd = totalVirtualSize
        ? Math.min(totalVirtualSize - 1, actualEnd - source.offset)
        : actualEnd - source.offset
      const bodyLength = isPartialUpstream
        ? rangeLength(responseStart, responseEnd)
        : (Number(upstream.headers.get('content-length')) || totalVirtualSize || 0)
      const responseHeaders = {
        'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
      }
      if (bodyLength) responseHeaders['content-length'] = String(bodyLength)
      for (const name of ['last-modified']) {
        const value = upstream.headers.get(name)
        if (value) responseHeaders[name] = value
      }
      const shouldReturnPartial = isPartialUpstream && (Boolean(requestedRange) || source.offset > 0)
      if (shouldReturnPartial && totalVirtualSize && responseEnd >= responseStart) {
        responseHeaders['content-range'] = `bytes ${responseStart}-${responseEnd}/${totalVirtualSize}`
      }
      response.writeHead(shouldReturnPartial ? 206 : 200, responseHeaders)
      if (request.method !== 'HEAD') {
        this.resolveStreamReady?.(true)
        this.resolveStreamReady = null
      }
      if (request.method === 'HEAD' || !upstream.body) {
        await upstream.body?.cancel?.()
        response.end()
        return
      }
      await pipeline(Readable.fromWeb(upstream.body), response)
    } catch (error) {
      if (error.name === 'AbortError') return
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end(`音频中转失败：${error.message}`)
    } finally {
      this.activeControllers.delete(controller)
    }
  }

  handleTranscode(request, response, source) {
    const headers = {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Accept-Ranges': 'none',
      'Connection': 'close',
    }
    response.writeHead(200, headers)
    if (request.method === 'HEAD') {
      response.end()
      return
    }

    const args = ['-hide_banner', '-loglevel', 'error']
    if (source.offsetSeconds > 0) args.push('-ss', String(source.offsetSeconds))
    args.push(
      '-i', source.url,
      '-vn', '-map_metadata', '-1',
      '-acodec', 'libmp3lame', '-b:a', '320k',
      '-f', 'mp3', 'pipe:1',
    )
    const process = spawn(this.ffmpegPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    this.activeTranscoders.add(process)
    let stderr = ''
    let producedAudio = false
    process.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-4096) })
    process.stdout.once('data', () => {
      producedAudio = true
      this.resolveStreamReady?.(true)
      this.resolveStreamReady = null
    })
    process.once('error', error => {
      this.activeTranscoders.delete(process)
      if (!response.destroyed) response.destroy(new Error(`MP3 转码启动失败：${error.message}`))
    })
    process.once('close', code => {
      this.activeTranscoders.delete(process)
      if (response.destroyed || response.writableEnded) return
      if (code === 0) response.end()
      else response.destroy(new Error(`MP3 转码失败${stderr.trim() ? `：${stderr.trim()}` : ''}`))
      if (!producedAudio) {
        this.resolveStreamReady = null
      }
    })
    response.once('close', () => {
      if (process.exitCode === null) process.kill()
    })
    process.stdout.pipe(response)
  }

  async stop() {
    const server = this.server
    this.server = null
    this.sourceUrl = ''
    this.sources = []
    this.token = ''
    this.port = 0
    this.streamReady = null
    this.resolveStreamReady = null
    this.sourceSize = 0
    this.sourceOffset = 0
    this.sourceFormat = ''
    this.transcode = false
    for (const controller of this.activeControllers) controller.abort()
    this.activeControllers.clear()
    for (const process of this.activeTranscoders) process.kill()
    this.activeTranscoders.clear()
    if (!server) return
    await new Promise(resolve => {
      server.close(() => resolve())
      server.closeAllConnections?.()
    })
  }
}

module.exports = { XIAOAI_RELAY_PORT, XiaoaiRelay, estimateMp3Offset, findMp3Frame, localIpv4, mp3FrameInfo, parseMp3SeekHeader, responseBuffer }
