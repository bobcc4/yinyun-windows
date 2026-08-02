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
