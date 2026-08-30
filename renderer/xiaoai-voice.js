'use strict'

;(function exposeXiaoaiVoice(global) {
  function normalize(value) {
    return String(value || '').normalize('NFKC').trim().replace(/[，。！？、,.!?；;：:]/g, '').replace(/\s+/g, '')
  }

  function parseXiaoaiVoiceCommand(value) {
    const query = normalize(value).replace(/^小爱(?:同学)?/, '')
    if (!query || /^(?:小爱同学|小爱|你好小爱|嗨小爱)$/.test(query)) return { action: 'ignore', query: '' }
    if (/(?:下一首|下首|下一个|切到下一首|换一首|换首歌|切歌)/.test(query)) return { action: 'next', query: '' }
    if (/(?:上一首|上首|上一个|切到上一首)/.test(query)) return { action: 'previous', query: '' }
    if (/(?:暂停播放|暂停一下|先暂停|停一下|暂停)$/.test(query)) return { action: 'pause', query: '' }
    if (/(?:继续播放|接着播放|恢复播放|继续听|接着听|开始播放)$/.test(query)) return { action: 'resume', query: '' }
    if (/(?:停止播放|结束播放|关闭音乐|停止音乐|停止)$/.test(query)) return { action: 'stop', query: '' }

    const play = /^(?:请|帮我|我要|我想|给我)*(?:播放|放一下|放一首|放首|听一下|听一首|听首|来一首|来首)(.+)$/.exec(query)
    if (!play) return { action: 'ignore', query: '' }
    const target = play[1].replace(/^(?:歌曲|一首歌|一首|一下)/, '').replace(/(?:这首歌|这首|这首歌曲)$/, '')
    return target ? { action: 'play', query: target } : { action: 'ignore', query: '' }
  }

  function conversationKey(record) {
    return String(record?.id || `${Number(record?.timestamp) || 0}:${normalize(record?.query)}`)
  }

  const value = { conversationKey, normalizeXiaoaiVoiceText: normalize, parseXiaoaiVoiceCommand }
  if (typeof module !== 'undefined' && module.exports) module.exports = value
  global.yinyunXiaoaiVoice = value
})(typeof window === 'undefined' ? globalThis : window)
