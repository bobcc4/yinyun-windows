'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { readLyricsContent, trackForLyrics } = require('../renderer/lyrics.js')

test('reads string and structured lyric API responses', () => {
  assert.equal(readLyricsContent({ content: '[00:01.00]歌词' }), '[00:01.00]歌词')
  assert.equal(readLyricsContent({ content: { lyric: '[00:02.00]对象歌词', tlyric: '' } }), '[00:02.00]对象歌词')
  assert.equal(readLyricsContent({ lrc: '[00:03.00]兼容歌词' }), '[00:03.00]兼容歌词')
})

test('restores original platform metadata for local lyric lookup', () => {
  assert.deepEqual(trackForLyrics({
    id: 'encoded-local-id', title: '心跳', artist: '王力宏', quality: 'master',
    raw: { id: '001Fk0YJ2hiNgC', songmid: '001Fk0YJ2hiNgC', source: 'tx' },
  }), {
    id: '001Fk0YJ2hiNgC', songmid: '001Fk0YJ2hiNgC', source: 'tx',
    name: '心跳', singer: '王力宏', albumName: undefined, quality: 'master',
  })
})
