'use strict'

;(function exposeLyrics(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.yinyunLyrics = api
})(typeof window === 'undefined' ? globalThis : window, () => {
  function readLyricsContent(value) {
    if (typeof value === 'string') return value
    if (!value || typeof value !== 'object') return ''
    if (typeof value.content === 'string') return value.content
    if (value.content && typeof value.content === 'object') {
      const nested = value.content.lyric || value.content.lrc || value.content.lxlyric || value.content.klyric
      if (typeof nested === 'string') return nested
    }
    const direct = value.lyric || value.lrc || value.lxlyric || value.klyric
    return typeof direct === 'string' ? direct : ''
  }

  function trackForLyrics(value) {
    const raw = value?.raw && typeof value.raw === 'object' ? value.raw : value || {}
    return {
      ...raw,
      id: raw.id || raw.songmid || value?.catalogId || value?.id,
      songmid: raw.songmid || raw.id || value?.catalogId,
      name: raw.name || value?.title,
      singer: raw.singer || value?.artist,
      albumName: raw.albumName || raw.album || value?.album,
      source: raw.source || value?.source,
      quality: value?.quality || raw.quality,
    }
  }

  return { readLyricsContent, trackForLyrics }
})
