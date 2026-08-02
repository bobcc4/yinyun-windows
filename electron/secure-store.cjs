'use strict'

const fs = require('node:fs')
const path = require('node:path')

function createSecureJsonStore(filePath, cryptoProvider) {
  function read() {
    try {
      const envelope = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (!envelope || envelope.version !== 1 || typeof envelope.payload !== 'string') return null
      if (!envelope.encrypted || !cryptoProvider || !cryptoProvider.available()) return null
      const text = cryptoProvider.decrypt(Buffer.from(envelope.payload, 'base64'))
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  function write(value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const json = JSON.stringify(value)
    if (!cryptoProvider || !cryptoProvider.available()) {
      throw new Error('Windows 系统安全存储不可用，无法安全保存账户数据')
    }
    const payload = cryptoProvider.encrypt(json).toString('base64')
    const envelope = { version: 1, encrypted: true, payload }
    const tempPath = `${filePath}.tmp`
    fs.writeFileSync(tempPath, `${JSON.stringify(envelope)}\n`, 'utf8')
    fs.renameSync(tempPath, filePath)
  }

  function remove() {
    try { fs.unlinkSync(filePath) } catch { }
  }

  return { filePath, read, write, remove }
}

module.exports = { createSecureJsonStore }
