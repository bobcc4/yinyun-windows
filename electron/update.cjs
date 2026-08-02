'use strict'

const LATEST_RELEASE_API = 'https://api.github.com/repos/bobcc4/yinyun-windows/releases/latest'
const RELEASES_URL = 'https://github.com/bobcc4/yinyun-windows/releases'

function normalizeVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+(?:\.\d+)*)/i)
  return match ? match[1] : ''
}

function compareVersions(left, right) {
  const leftVersion = normalizeVersion(left)
  const rightVersion = normalizeVersion(right)
  if (!leftVersion || !rightVersion) return 0
  const leftParts = leftVersion.split('.').map(Number)
  const rightParts = rightVersion.split('.').map(Number)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

function parseLatestRelease(value) {
  if (!value || typeof value !== 'object' || value.draft || value.prerelease) return null
  const version = normalizeVersion(value.tag_name)
  const url = typeof value.html_url === 'string' ? value.html_url : ''
  if (!version || !url.startsWith(`${RELEASES_URL}/`)) return null
  return { version, url }
}

function isReleaseUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.startsWith('/bobcc4/yinyun-windows/releases/')
  } catch {
    return false
  }
}

module.exports = { compareVersions, isReleaseUrl, LATEST_RELEASE_API, normalizeVersion, parseLatestRelease }
