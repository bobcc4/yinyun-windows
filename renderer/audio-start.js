'use strict'

;(function exposeAudioStart(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.yinyunAudioStart = api
})(typeof window === 'undefined' ? globalThis : window, () => {
  const AUDIO_START_TIMEOUT_MS = 10_000

  function audioStartTimeoutError(timeoutMs) {
    const seconds = Math.max(1, Math.round(timeoutMs / 1000))
    const error = new Error(`起播超时，音频地址 ${seconds} 秒内无响应`)
    error.code = 'AUDIO_START_TIMEOUT'
    return error
  }

  function audioStartCancelledError() {
    const error = new Error('起播已被新的播放请求取代')
    error.code = 'AUDIO_START_CANCELLED'
    return error
  }

  /**
   * 管理单个 audio 元素的起播竞态。
   *
   * 关键点：调用方的请求序号校验只能拦住状态回写，拦不住已经挂起的 audio.play()。
   * 因此超时必须主动中止加载，抢占时也必须主动作废旧起播，否则音频数据迟到后会自己出声。
   */
  function createAudioStarter(audio, options = {}) {
    const fallbackTimeout = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : AUDIO_START_TIMEOUT_MS
    const pendingCancels = new Set()

    function abortLoad() {
      try { audio.pause() } catch {}
      try { audio.removeAttribute('src') } catch {}
      try { audio.load() } catch {}
    }

    function cancelPending() {
      for (const cancel of [...pendingCancels]) cancel()
    }

    /** 抢占：让尚未完成的旧起播立刻作废，并停止音频加载 */
    function interrupt() {
      cancelPending()
      abortLoad()
    }

    function play(playOptions = {}) {
      const timeoutMs = Number(playOptions.timeoutMs) > 0 ? Number(playOptions.timeoutMs) : fallbackTimeout
      cancelPending()
      return new Promise((resolve, reject) => {
        let settled = false
        let timer = null
        const settle = (handler) => {
          if (settled) return
          settled = true
          if (timer) clearTimeout(timer)
          pendingCancels.delete(cancel)
          handler()
        }
        const cancel = () => settle(() => reject(audioStartCancelledError()))
        pendingCancels.add(cancel)
        timer = setTimeout(() => {
          if (settled) return
          settled = true
          pendingCancels.delete(cancel)
          abortLoad()
          reject(audioStartTimeoutError(timeoutMs))
        }, timeoutMs)
        if (!audio) {
          settle(() => reject(new Error('音频元素不可用')))
          return
        }
        Promise.resolve()
          .then(() => audio.play())
          .then(() => settle(resolve), error => settle(() => reject(error)))
      })
    }

    return { abortLoad, cancelPending, interrupt, play }
  }

  return { AUDIO_START_TIMEOUT_MS, audioStartCancelledError, audioStartTimeoutError, createAudioStarter }
})
