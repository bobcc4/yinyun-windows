'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { createSecureJsonStore } = require('./secure-store.cjs')

function getSnapshotKey(serverUrl, username) {
  return crypto.createHash('sha256')
    .update(`${String(serverUrl).toLowerCase()}\n${String(username).toLowerCase()}`)
    .digest('hex')
    .slice(0, 24)
}

function createSnapshotStore(userDataPath, cryptoProvider) {
  const directory = path.join(userDataPath, 'sync-snapshots')

  function getStore(serverUrl, username) {
    return createSecureJsonStore(path.join(directory, `${getSnapshotKey(serverUrl, username)}.json`), cryptoProvider)
  }

  function read(serverUrl, username) {
    return getStore(serverUrl, username).read()
  }

  function write(serverUrl, username, snapshot) {
    const value = {
      serverUrl,
      username: String(username).trim().toLowerCase(),
      savedAt: new Date().toISOString(),
      snapshot,
    }
    getStore(serverUrl, username).write(value)
    return value
  }

  function remove(serverUrl, username) {
    getStore(serverUrl, username).remove()
  }

  function exportFile(targetPath, value) {
    const payload = {
      format: 'yinyun-account-sync',
      version: 1,
      exportedAt: new Date().toISOString(),
      username: value.username,
      snapshot: value.snapshot,
    }
    fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  }

  function importFile(sourcePath) {
    const value = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
    if (!value || value.format !== 'yinyun-account-sync' || value.version !== 1 || !value.snapshot) {
      throw new Error('不是有效的音云同步备份文件')
    }
    return value
  }

  return { directory, read, write, remove, exportFile, importFile }
}

module.exports = { createSnapshotStore, getSnapshotKey }
