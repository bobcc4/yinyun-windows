'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createSnapshotStore, getSnapshotKey } = require('../electron/snapshot-store.cjs')

const cryptoProvider = {
  available: () => true,
  encrypt: value => Buffer.from(`encrypted:${value}`, 'utf8'),
  decrypt: value => value.toString('utf8').replace(/^encrypted:/, ''),
}

test('stores snapshots by normalized server and user identity', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yinyun-snapshot-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const store = createSnapshotStore(directory, cryptoProvider)
  store.write('https://music.example.com', 'Admin', { revision: 'abc' })

  assert.equal(store.read('https://music.example.com', 'admin').snapshot.revision, 'abc')
  assert.equal(
    getSnapshotKey('HTTPS://MUSIC.EXAMPLE.COM', 'ADMIN'),
    getSnapshotKey('https://music.example.com', 'admin'),
  )
})

test('refuses to store snapshots when operating system encryption is unavailable', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yinyun-snapshot-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const store = createSnapshotStore(directory, { available: () => false })

  assert.throws(
    () => store.write('https://music.example.com', 'admin', { revision: 'abc' }),
    /安全存储不可用/,
  )
})
