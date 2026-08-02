'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createConfigStore, DEFAULT_CONFIG, normalizeConfig } = require('../electron/config.cjs')

test('rejects invalid and unknown configuration values', () => {
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG)
  assert.deepEqual(normalizeConfig({
    serverUrl: 42,
    minimizeToTray: 'false',
    unknown: true,
  }), DEFAULT_CONFIG)
})

test('persists supported client configuration', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yinyun-config-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const store = createConfigStore(directory)

  assert.deepEqual(store.read(), DEFAULT_CONFIG)
  const written = store.write({
    serverUrl: 'https://music.example.com',
    username: 'Admin',
    launchAtLogin: true,
    playbackQuality: 'master',
    volume: 0.45,
    lastUpdateVersion: '0.2.1',
    unknown: 'discarded',
  })

  assert.equal(written.serverUrl, 'https://music.example.com')
  assert.equal(written.username, 'admin')
  assert.equal(written.launchAtLogin, true)
  assert.equal(written.lastUpdateVersion, '0.2.1')
  assert.equal(written.playbackQuality, 'master')
  assert.equal(written.volume, 0.45)
  assert.equal('unknown' in written, false)
  assert.deepEqual(store.read(), written)
})
