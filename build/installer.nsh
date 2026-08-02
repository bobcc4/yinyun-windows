; electron-builder's assisted installer normally appends APP_FILENAME after
; the directory page. Treat the selected path as the exact final directory.
!ifdef allowToChangeInstallationDirectory
  !undef allowToChangeInstallationDirectory
!endif

!macro customPageAfterChangeDir
  !insertmacro MUI_PAGE_DIRECTORY
!macroend

!macro customInit
  ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${If} $R0 != ""
    MessageBox MB_YESNO|MB_ICONINFORMATION \
      "检测到已安装音云 Windows 客户端 v$R0。无需卸载，直接覆盖升级会保留登录、设置和下载记录。是否继续？" \
      IDYES continueUpgrade
    Abort
    continueUpgrade:
  ${EndIf}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    Delete "$APPDATA\${APP_FILENAME}\account.json"
    Delete "$APPDATA\${APP_FILENAME}\account.json.tmp"

    !ifdef APP_PRODUCT_FILENAME
      Delete "$APPDATA\${APP_PRODUCT_FILENAME}\account.json"
      Delete "$APPDATA\${APP_PRODUCT_FILENAME}\account.json.tmp"
    !endif

    !ifdef APP_PACKAGE_NAME
      Delete "$APPDATA\${APP_PACKAGE_NAME}\account.json"
      Delete "$APPDATA\${APP_PACKAGE_NAME}\account.json.tmp"
    !endif
  ${endif}
!macroend
