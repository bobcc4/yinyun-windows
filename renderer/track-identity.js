'use strict'

;(function exposeTrackIdentity(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.yinyunTrackIdentity = api
})(typeof window === 'undefined' ? globalThis : window, () => {
  function rawTrack(value) { return value?.raw || value || {} }

  function trackId(value) {
    const track = rawTrack(value)
    const source = String(track.source || value?.source || '')
    const candidates = [track.id, value?.id, track.songmid, track.hash]
    const existing = candidates.find(item => typeof item === 'string' && source && item.startsWith(`${source}_`))
    if (existing) return existing
    const platformId = candidates.find(item => item !== undefined && item !== null && String(item))
    return platformId && source ? `${source}_${platformId}` : String(platformId || `${source}:${track.name || value?.title || ''}:${track.singer || value?.artist || ''}`)
  }

  function trackIdentityAliases(value) {
    const track = rawTrack(value)
    const source = String(track.source || value?.source || '').trim().toLowerCase()
    const meta = track.meta || {}
    const aliases = new Set()
    const candidates = [
      value?.id, track.id, track.songmid, track.songId, track.hash, track.strMediaMid,
      track.copyrightId, meta.songId, meta.songmid, meta.hash, meta.strMediaMid, meta.copyrightId,
    ]
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null || String(candidate).trim() === '') continue
      const id = String(candidate).trim()
      aliases.add(id)
      if (!source) continue
      const prefix = `${source}_`
      if (id.startsWith(prefix)) {
        const plainId = id.slice(prefix.length)
        if (plainId) aliases.add(plainId)
      } else {
        aliases.add(`${prefix}${id}`)
      }
    }
    return aliases
  }

  function createFavoriteIndex(items) {
    const index = new Map()
    for (const item of Array.isArray(items) ? items : []) {
      const canonicalId = String(item?.id || rawTrack(item).id || trackId(item))
      for (const alias of trackIdentityAliases(item)) index.set(alias, canonicalId)
    }
    return index
  }

  function favoriteTrackId(value, index) {
    for (const alias of trackIdentityAliases(value)) {
      const canonicalId = index.get(alias)
      if (canonicalId) return canonicalId
    }
    return null
  }

  return { createFavoriteIndex, favoriteTrackId, rawTrack, trackId, trackIdentityAliases }
})
