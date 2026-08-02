const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('NSIS treats the selected installation directory as the final path', () => {
  const installer = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8')
  assert.match(installer, /!undef allowToChangeInstallationDirectory/)
  assert.match(installer, /!macro customPageAfterChangeDir[\s\S]*!insertmacro MUI_PAGE_DIRECTORY[\s\S]*!macroend/)
  assert.doesNotMatch(installer, /StrCpy\s+\$INSTDIR\s+"\$INSTDIR\\\$\{APP_FILENAME\}"/)
})
