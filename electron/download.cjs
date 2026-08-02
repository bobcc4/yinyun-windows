'use strict'

const path = require('node:path')

function sanitizeFilePart(value, fallback) {
  const cleaned = String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  return cleaned || fallback
}

function trackForDownload(value) {
  return value?.raw || value || {}
}

function getDownloadExtension(url, quality, contentType = '') {
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase()
    if (['.flac', '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav'].includes(extension)) return extension
  } catch {}

  const mime = String(contentType).toLowerCase().split(';', 1)[0].trim()
  const extensions = {
    'audio/flac': '.flac',
    'audio/x-flac': '.flac',
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a',
    'audio/aac': '.aac',
    'audio/ogg': '.ogg',
    'audio/opus': '.opus',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
  }
  if (extensions[mime]) return extensions[mime]
  return ['128k', '320k'].includes(quality) ? '.mp3' : '.flac'
}

function createDownloadParts(track, quality) {
  const normalized = trackForDownload(track)
  return {
    artist: sanitizeFilePart(normalized.singer || normalized.artist, '未知歌手'),
    album: sanitizeFilePart(normalized.albumName || normalized.album, '未知专辑'),
    title: sanitizeFilePart(normalized.name || normalized.title, '未知歌曲'),
    quality: sanitizeFilePart(quality, 'flac'),
  }
}

function getUniqueDownloadPath(root, parts, extension, exists) {
  const directory = path.join(root, parts.artist, parts.album)
  const baseName = `${parts.title} - ${parts.artist} - ${parts.quality} - ${parts.album}`
  let targetPath = path.join(directory, `${baseName}${extension}`)
  let index = 2
  while (exists(targetPath)) targetPath = path.join(directory, `${baseName} (${index++})${extension}`)
  return { directory, targetPath }
}

module.exports = {
  createDownloadParts,
  getDownloadExtension,
  getUniqueDownloadPath,
  sanitizeFilePart,
  trackForDownload,
}
