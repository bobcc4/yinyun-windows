'use strict'

;(function exposeErrors(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.yinyunErrors = api
})(typeof window === 'undefined' ? globalThis : window, () => {
  function friendlyErrorMessage(error) {
    let message = error?.message || String(error || '操作失败')
    message = message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
    if (/No downloadable source found/i.test(message)) return '当前歌曲没有可用的播放来源'
    if (/The operation was aborted|AbortError|timed?\s*out/i.test(message)) return '请求超时，请稍后重试'
    return message.length > 180 ? `${message.slice(0, 177)}...` : message
  }

  return { friendlyErrorMessage }
})
