'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { AUDIO_START_TIMEOUT_MS, createAudioStarter } = require('../renderer/audio-start.js')

// 模拟 Chromium 的 audio 元素：play() 直到数据可用才完成，加载被中止时以 AbortError 失败。
function createFakeAudio({ delayMs = 10 } = {}) {
  let playSeq = 0
  const audio = {
    _src: '',
    paused: true,
    playCalls: 0,
    pauseCalls: 0,
    loadCalls: 0,
    soundOut: 0,
    play() {
      const token = ++playSeq
      audio.playCalls += 1
      audio.paused = false
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (token !== playSeq || !audio._src) {
            const error = new Error('The play() request was interrupted by a call to load().')
            error.name = 'AbortError'
            reject(error)
            return
          }
          audio.soundOut += 1
          resolve()
        }, delayMs)
      })
    },
    pause() {
      audio.pauseCalls += 1
      audio.paused = true
      playSeq += 1
    },
    removeAttribute(name) {
      if (name === 'src') audio._src = ''
    },
    load() {
      audio.loadCalls += 1
      audio.paused = true
      playSeq += 1
    },
    getAttribute(name) {
      return name === 'src' && audio._src ? audio._src : null
    },
    get src() { return audio._src },
    set src(value) { audio._src = String(value || ''); playSeq += 1 },
  }
  return audio
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('默认起播超时为 10 秒', () => {
  assert.equal(AUDIO_START_TIMEOUT_MS, 10_000)
})

test('续播起播超时后中止加载，迟到的数据不会再出声', async () => {
  const audio = createFakeAudio({ delayMs: 60 })
  const starter = createAudioStarter(audio, { timeoutMs: 20 })
  audio.src = 'https://cdn.example.com/slow.mp3'

  await assert.rejects(starter.play(), (error) => error.code === 'AUDIO_START_TIMEOUT')

  assert.equal(audio.src, '', '超时后必须清掉 src')
  assert.equal(audio.pauseCalls, 1, '超时后必须暂停挂起的播放')
  assert.equal(audio.loadCalls, 1, '超时后必须重新加载以释放请求')
  assert.equal(audio.paused, true)

  await wait(80)
  assert.equal(audio.soundOut, 0, '数据迟到时不能出现声音')
})

test('切歌抢占立刻作废旧起播，旧请求不会在迟到时出声', async () => {
  const audio = createFakeAudio({ delayMs: 60 })
  const starter = createAudioStarter(audio, { timeoutMs: 1_000 })
  audio.src = 'https://cdn.example.com/old.mp3'
  const oldPlay = starter.play()

  await wait(5)
  starter.interrupt()

  await assert.rejects(oldPlay, (error) => error.code === 'AUDIO_START_CANCELLED')
  assert.equal(audio.src, '', '抢占时必须立刻清掉旧音源')

  audio.src = 'https://cdn.example.com/new.mp3'
  await starter.play()
  assert.equal(audio.src, 'https://cdn.example.com/new.mp3')
  assert.equal(audio.soundOut, 1, '只有新歌起播成功过')
  assert.equal(audio.paused, false)
})

test('旧起播在抢占后迟到完成也不会覆盖新起播的状态', async () => {
  const audio = createFakeAudio({ delayMs: 40 })
  const starter = createAudioStarter(audio, { timeoutMs: 1_000 })
  audio.src = 'https://cdn.example.com/old.mp3'
  const oldPlay = starter.play()

  await wait(5)
  starter.interrupt()
  audio.src = 'https://cdn.example.com/new.mp3'
  const newPlay = starter.play()

  await assert.rejects(oldPlay, (error) => error.code === 'AUDIO_START_CANCELLED')
  await newPlay
  await wait(60)

  assert.equal(audio.src, 'https://cdn.example.com/new.mp3')
  assert.equal(audio.soundOut, 1, '旧给源不得出声')
})

test('被抢占的请求不会把起播错误冒泡成播放失败', async () => {
  const audio = createFakeAudio({ delayMs: 20 })
  const starter = createAudioStarter(audio, { timeoutMs: 1_000 })
  audio.src = 'https://cdn.example.com/a.mp3'
  const first = starter.play()
  const second = starter.play()

  await assert.rejects(first, (error) => error.code === 'AUDIO_START_CANCELLED')
  await second
  assert.equal(audio.soundOut, 1)
})

test('audio.play() 直接失败时把原始错误抛给调用方', async () => {
  const audio = createFakeAudio()
  audio.play = () => Promise.reject(Object.assign(new Error('NotSupportedError'), { name: 'NotSupportedError' }))
  const starter = createAudioStarter(audio, { timeoutMs: 50 })

  await assert.rejects(starter.play(), (error) => error.name === 'NotSupportedError')
})
