'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { friendlyErrorMessage } = require('../renderer/errors.js')

test('replaces verbose source resolution errors with a useful playback message', () => {
  const error = new Error("Error invoking remote method 'player:resolve-track': Error: No downloadable source found (wy/master: first; tx/master: second)")
  assert.equal(friendlyErrorMessage(error), '当前歌曲没有可用的播放来源')
})

test('strips Electron IPC prefixes and limits generic error length', () => {
  assert.equal(friendlyErrorMessage(new Error("Error invoking remote method 'test': Error: 连接失败")), '连接失败')
  assert.equal(friendlyErrorMessage(new Error('x'.repeat(300))).length, 180)
})
