'use strict'

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_CONFIG = Object.freeze({
  serverUrl: '',
  username: '',
  minimizeToTray: true,
  startMinimized: false,
  launchAtLogin: false,
  disableAcceleration: false,
  playbackQuality: 'flac',
  volume: 0.8,
  downloadDirectory: '',
  lastUpdateVersion: '',
})

function normalizeConfig(value) {
  const config = { ...DEFAULT_CONFIG }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return config

  if (typeof value.serverUrl === 'string') config.serverUrl = value.serverUrl
  if (typeof value.username === 'string') config.username = value.username.trim().toLowerCase()
  if (typeof value.lastUpdateVersion === 'string') config.lastUpdateVersion = value.lastUpdateVersion
  if (['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'].includes(value.playbackQuality)) {
    config.playbackQuality = value.playbackQuality
  }
  if (typeof value.volume === 'number' && value.volume >= 0 && value.volume <= 1) config.volume = value.volume
  if (typeof value.downloadDirectory === 'string') config.downloadDirectory = value.downloadDirectory
  for (const key of ['minimizeToTray', 'startMinimized', 'launchAtLogin', 'disableAcceleration']) {
    if (typeof value[key] === 'boolean') config[key] = value[key]
  }
  return config
}

function createConfigStore(userDataPath) {
  const configPath = path.join(userDataPath, 'client-config.json')

  function read() {
    try {
      const value = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      return normalizeConfig(value)
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  function write(patch) {
    const next = normalizeConfig({ ...read(), ...patch })
    fs.mkdirSync(userDataPath, { recursive: true })
    const tempPath = `${configPath}.tmp`
    fs.writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    fs.renameSync(tempPath, configPath)
    return next
  }

  return { configPath, read, write }
}

module.exports = { createConfigStore, DEFAULT_CONFIG, normalizeConfig }
