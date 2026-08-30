'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { elevatedFirewallScript, firewallScript } = require('../electron/firewall.cjs')

test('limits the XiaoAI relay firewall rule to its fixed port and local subnet', () => {
  const elevated = elevatedFirewallScript()
  assert.match(elevated, /localport=39781/)
  assert.match(elevated, /remoteip=LocalSubnet/)
  assert.match(elevated, /profile=private,public/)
  assert.match(elevated, /name=Yinyun-XiaoAI-Relay/)
  assert.doesNotMatch(elevated, /name=Yinyun XiaoAI Relay/)
  assert.match(firewallScript(), /-Verb RunAs/)
})
