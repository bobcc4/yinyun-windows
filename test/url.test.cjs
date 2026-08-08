'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  isSameServerOrigin,
  normalizePlayerPath,
  normalizeServerUrl,
  readCapabilities,
  readServerVersion,
  resolvePlayerUrl,
} = require('../electron/url.cjs')

test('normalizes LAN addresses to HTTP', () => {
  assert.equal(normalizeServerUrl('192.168.1.10:9527'), 'http://192.168.1.10:9527')
})

test('normalizes domain names to HTTPS', () => {
  assert.equal(normalizeServerUrl('lx.example.com:16666'), 'https://lx.example.com:16666')
})

test('accepts known player and Subsonic entry suffixes', () => {
  assert.equal(normalizeServerUrl('https://lx.example.com/music'), 'https://lx.example.com')
  assert.equal(normalizeServerUrl('https://lx.example.com/rest/'), 'https://lx.example.com')
})

test('rejects unsupported protocols and reverse proxy subpaths', () => {
  assert.throws(() => normalizeServerUrl('ftp://lx.example.com'), /HTTP/)
  assert.throws(() => normalizeServerUrl('https://lx.example.com/yinyun'), /根地址/)
})

test('resolves configured player paths', () => {
  assert.equal(normalizePlayerPath('/music/'), '/music')
  assert.equal(resolvePlayerUrl('https://lx.example.com', '/music'), 'https://lx.example.com/music')
  assert.equal(resolvePlayerUrl('https://lx.example.com', '/'), 'https://lx.example.com/')
})

test('allows navigation only within the configured server origin', () => {
  assert.equal(isSameServerOrigin('https://lx.example.com/music', 'https://lx.example.com'), true)
  assert.equal(isSameServerOrigin('https://github.com/bobcc4', 'https://lx.example.com'), false)
})

test('reads versions from JavaScript and JSON-style config keys', () => {
  assert.equal(readServerVersion("window.CONFIG = { version: 'v1.1.4' }"), 'v1.1.4')
  assert.equal(readServerVersion('window.CONFIG = { "version": "v1.1.4" }'), 'v1.1.4')
})

test('validates API v1 capabilities', () => {
  assert.deepEqual(readCapabilities({ data: { product: 'yinyun', apiVersion: '1.0.0', serverVersion: '1.2.0', playerPath: '/music' } }), {
    playerPath: '/music',
    version: 'v1.2.0',
    apiVersion: '1.0.0',
  })
  assert.throws(() => readCapabilities({ data: { product: 'other' } }), /API v1/)
})

test('accepts the unified API capability version', () => {
  assert.equal(readCapabilities({ data: { product: 'yinyun', apiVersion: '1.4.0', serverVersion: '1.4.0', playerPath: '/music' } }).apiVersion, '1.4.0')
})
