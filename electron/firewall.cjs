'use strict'

const { execFile } = require('node:child_process')
const { XIAOAI_RELAY_PORT } = require('./xiaoai-relay.cjs')

const FIREWALL_RULE_NAME = 'Yinyun-XiaoAI-Relay'

function elevatedFirewallScript() {
  const values = [
    'advfirewall', 'firewall', 'delete', 'rule', 'name=Yinyun',
  ]
  const deleteArgs = values.map(value => "'" + value.replaceAll("'", "''") + "'").join(',')
  const addValues = [
    'advfirewall', 'firewall', 'add', 'rule',
    'name=' + FIREWALL_RULE_NAME, 'dir=in', 'action=allow', 'enable=yes',
    'protocol=TCP', 'localport=' + XIAOAI_RELAY_PORT, 'remoteip=LocalSubnet',
    'profile=private,public',
  ]
  const addArgs = addValues.map(value => "'" + value.replaceAll("'", "''") + "'").join(',')
  return [
    '$netsh = "$env:SystemRoot\\System32\\netsh.exe"',
    '& $netsh @(' + deleteArgs + ') | Out-Null',
    '& $netsh @(' + addArgs + ') | Out-Null',
    'exit $LASTEXITCODE',
  ].join('; ')
}

function firewallScript() {
  const elevated = elevatedFirewallScript()
  const encoded = Buffer.from(elevated, 'utf16le').toString('base64')
  return `$process = Start-Process -FilePath "powershell.exe" -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand','${encoded}') -Verb RunAs -Wait -PassThru; exit $process.ExitCode`
}

function verifyXiaoaiRelayRule() {
  return new Promise((resolve, reject) => {
    execFile('netsh.exe', ['advfirewall', 'firewall', 'show', 'rule', `name=${FIREWALL_RULE_NAME}`, 'verbose'], { windowsHide: true }, (error, stdout, stderr) => {
      const detail = String(stdout || stderr || '').trim()
      if (error || !detail.includes(String(XIAOAI_RELAY_PORT)) || !/LocalSubnet/i.test(detail)) {
        reject(new Error('Windows 防火墙规则未正确创建，请重新授权后再试'))
        return
      }
      resolve(true)
    })
  })
}

function allowXiaoaiRelay() {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', firewallScript()], { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message).trim()
        const cancelled = error.code === 1223 || /cancel|canceled|cancelled|取消/i.test(detail)
        reject(new Error(cancelled ? '已取消 Windows 防火墙授权' : 'Windows 防火墙授权失败：' + detail))
        return
      }
      verifyXiaoaiRelayRule().then(resolve, reject)
    })
  })
}

module.exports = { FIREWALL_RULE_NAME, allowXiaoaiRelay, elevatedFirewallScript, firewallScript, verifyXiaoaiRelayRule }
