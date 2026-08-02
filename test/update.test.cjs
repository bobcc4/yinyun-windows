'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { compareVersions, normalizeVersion, parseLatestRelease } = require('../electron/update.cjs')

test('normalizes and compares release versions', () => {
  assert.equal(normalizeVersion('v1.0.0'), '1.0.0')
  assert.equal(compareVersions('0.9.0', 'v1.0.0'), -1)
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1)
  assert.equal(compareVersions('1.2', '1.2.0'), 0)
})

test('accepts only stable releases from the client repository', () => {
  assert.deepEqual(parseLatestRelease({
    tag_name: 'v1.0.0',
    html_url: 'https://github.com/bobcc4/yinyun-windows/releases/tag/v1.0.0',
    draft: false,
    prerelease: false,
  }), { version: '1.0.0', url: 'https://github.com/bobcc4/yinyun-windows/releases/tag/v1.0.0' })
  assert.equal(parseLatestRelease({ tag_name: 'v0.3.0-beta', prerelease: true }), null)
  assert.equal(parseLatestRelease({
    tag_name: 'v9.9.9',
    html_url: 'https://example.com/download',
    draft: false,
    prerelease: false,
  }), null)
})
