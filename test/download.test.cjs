'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const {
  createDownloadParts,
  getDownloadExtension,
  getUniqueDownloadPath,
  sanitizeFilePart,
} = require('../electron/download.cjs')

test('sanitizes Windows file name components', () => {
  assert.equal(sanitizeFilePart('A<B>:C?. ', 'unknown'), 'A_B__C_')
  assert.equal(sanitizeFilePart('   ', 'unknown'), 'unknown')
})

test('chooses an extension from URL, content type, then quality', () => {
  assert.equal(getDownloadExtension('https://media.example/song.mp3?token=x', 'flac', 'audio/flac'), '.mp3')
  assert.equal(getDownloadExtension('https://media.example/stream', 'flac', 'audio/mpeg'), '.mp3')
  assert.equal(getDownloadExtension('https://media.example/stream', '320k', ''), '.mp3')
  assert.equal(getDownloadExtension('https://media.example/stream', 'hires', ''), '.flac')
})

test('builds a stable artist and album download hierarchy', () => {
  const parts = createDownloadParts({ name: '夜曲', singer: '周杰伦', albumName: '十一月的萧邦' }, 'flac')
  const first = path.join('D:\\Music', '周杰伦', '十一月的萧邦', '夜曲 - 周杰伦 - flac - 十一月的萧邦.flac')
  const result = getUniqueDownloadPath('D:\\Music', parts, '.flac', value => value === first)
  assert.equal(result.targetPath, path.join('D:\\Music', '周杰伦', '十一月的萧邦', '夜曲 - 周杰伦 - flac - 十一月的萧邦 (2).flac'))
})
