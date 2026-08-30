'use strict'

const api = window.yinyunClient
const { createFavoriteIndex, favoriteTrackId, rawTrack, trackId, trackIdentityAliases } = window.yinyunTrackIdentity
const { readLyricsContent, trackForLyrics } = window.yinyunLyrics
const { conversationKey, normalizeXiaoaiVoiceText, parseXiaoaiVoiceCommand } = window.yinyunXiaoaiVoice
const byId = id => document.getElementById(id)
const elements = {
  playlistNav: byId('playlist-nav'), createPlaylist: byId('create-playlist'),
  title: byId('view-title'), subtitle: byId('view-subtitle'), playlistActions: byId('playlist-actions'), navBack: byId('nav-back'),
  renamePlaylist: byId('rename-playlist'), deletePlaylist: byId('delete-playlist'),
  searchView: byId('search-view'), searchForm: byId('search-form'), searchInput: byId('search-input'),
  searchTypes: [...document.querySelectorAll('.search-type')], sourceTabs: [...document.querySelectorAll('.source-tab')],
  leaderboardView: byId('leaderboards-view'), leaderboardSource: byId('leaderboard-source'), leaderboardStatus: byId('leaderboard-status'), leaderboardList: byId('leaderboard-list'),
  libraryView: byId('library-view'), libraryLabel: byId('library-kind-label'), libraryRefresh: byId('library-refresh'), librarySort: byId('library-sort'), entityList: byId('entity-list'),
  downloadsView: byId('downloads-view'), downloadsSummary: byId('downloads-summary'), downloadsList: byId('downloads-list'), openDownloadDirectory: byId('open-download-directory'),
  tracksView: byId('tracks-view'), tracksToolbar: byId('tracks-toolbar'), playAll: byId('play-all'), shuffleAll: byId('shuffle-all'), trackSelect: byId('track-select'), trackSort: byId('track-sort'), selectionSummary: byId('selection-summary'), trackList: byId('track-list'),
  playlistHero: byId('playlist-hero'), playlistCover: byId('playlist-cover'), playlistName: byId('playlist-name'), playlistMeta: byId('playlist-meta'), heroPlayAll: byId('hero-play-all'), heroShuffle: byId('hero-shuffle'), playlistSelect: byId('playlist-select'),
  entityDetailSummary: byId('entity-detail-summary'), entityDetailCover: byId('entity-detail-cover'), entityDetailKind: byId('entity-detail-kind'), entityDetailName: byId('entity-detail-name'), entityDetailMeta: byId('entity-detail-meta'), entityDetailDescription: byId('entity-detail-description'), entityPlayAll: byId('entity-play-all'), entityShuffle: byId('entity-shuffle'), entityFavorite: byId('entity-favorite'), entitySelect: byId('entity-select'), entityTabs: byId('entity-tabs'), entityTabButtons: [...document.querySelectorAll('[data-entity-tab]')],
  relatedAlbums: byId('related-albums'), relatedAlbumCount: byId('related-album-count'), relatedAlbumList: byId('related-album-list'),
  empty: byId('empty-state'), loading: byId('loading-state'), about: byId('about-view'),
  accountName: byId('account-name'), connectionDot: byId('connection-dot'), syncCenter: byId('sync-center'),
  aboutVersion: byId('about-version'), aboutUpdate: byId('about-update'), aboutAccount: byId('about-account'), aboutServer: byId('about-server'), aboutDownloadDirectory: byId('about-download-directory'),
  xiaoaiView: byId('xiaoai-view'), xiaoaiAccountState: byId('xiaoai-account-state'), xiaoaiLoginSection: byId('xiaoai-login-section'), xiaoaiLogin: byId('xiaoai-login'), xiaoaiQrWrap: byId('xiaoai-qr-wrap'), xiaoaiQr: byId('xiaoai-qr'), xiaoaiQrStatus: byId('xiaoai-qr-status'), xiaoaiDeviceSection: byId('xiaoai-device-section'), xiaoaiDevice: byId('xiaoai-device'), xiaoaiRefresh: byId('xiaoai-refresh'), xiaoaiUseDevice: byId('xiaoai-use-device'), xiaoaiLogout: byId('xiaoai-logout'),
  audio: byId('audio'), nowCover: byId('now-cover'), nowTitle: byId('now-title'), nowArtist: byId('now-artist'), nowSource: byId('now-source'), nowQuality: byId('now-quality'), playerStatus: byId('player-status'), favoriteCurrent: byId('favorite-current'),
  previous: byId('previous'), playPause: byId('play-pause'), stop: byId('stop'), next: byId('next'), playMode: byId('play-mode'), progress: byId('progress'), elapsed: byId('elapsed'), duration: byId('duration'), volume: byId('volume'), quality: byId('quality'), castToggle: byId('cast-toggle'), downloadDirectory: byId('download-directory'), queueToggle: byId('queue-toggle'),
  detail: byId('detail-panel'), closeDetail: byId('close-detail'), queueCount: byId('queue-count'), clearQueue: byId('clear-queue'), queueList: byId('queue-list'),
  lyricsView: byId('lyrics-view'), closeLyrics: byId('close-lyrics'), lyricsBackdrop: byId('lyrics-backdrop'), lyricsCover: byId('lyrics-cover'), lyricsTitle: byId('lyrics-title'), lyricsArtist: byId('lyrics-artist'), lyricsSource: byId('lyrics-source'), lyricsQuality: byId('lyrics-quality'), lyricsPlaybackStatus: byId('lyrics-playback-status'), lyricsContent: byId('lyrics-content'),
  textDialog: byId('text-dialog'), textDialogTitle: byId('text-dialog-title'), textDialogInput: byId('text-dialog-input'), textDialogCancel: byId('text-dialog-cancel'), textDialogConfirm: byId('text-dialog-confirm'), playlistMenu: byId('playlist-menu'), toast: byId('toast'),
}

const state = {
  app: null, view: 'playlist', playlistId: 'love', playlists: [], tracks: [], originalTracks: [], entities: [],
  queue: readQueue(), queueIndex: -1, current: null, searchSource: 'tx', searchType: 'song',
  loading: false, playMode: localStorage.getItem('yinyun-player-mode') || 'list', loveIndex: new Map(),
  libraries: { artists: [], albums: [] }, libraryTracks: [], libraryType: 'artists', boardSource: 'tx', boards: [],
  resolving: false, toastTimer: null, downloads: new Map(), downloadHistory: readDownloadHistory(), boardId: null, entityDetail: null, entityDetailData: null, entityTab: 'songs', detailHistory: [], navigation: [], restoringNavigation: false,
  trackSort: 'recent', librarySort: 'recent', artistFilter: 'all', selectionMode: false, selectedTracks: new Set(), playStats: readPlayStats(), albumReleaseDates: readAlbumReleaseDates(), albumReleasePromise: null,
  lyrics: [], activeLyricIndex: -1, lyricsRequestId: 0, playbackState: 'idle', playbackInfo: null,
  output: 'local', xiaoai: { loggedIn: false, selectedDevice: null }, xiaoaiDevices: [], xiaoaiPollToken: 0, castStatusTimer: null, castProgressTimer: null, castVoiceTimer: null, castRecoveryTimer: null, castStatusReading: false, castVoiceReading: false, castVoiceReady: false, castVoiceSeenKeys: new Set(), castVoiceLastKey: '', castVoiceRecoveryNeeded: false, castUrl: '', castSourceUrl: '', castQueueSources: [], castRelayUrls: [], castTranscode: false, castGeneration: 0, castSeenPlaying: false, castPausedByUser: false, castPosition: 0, castPositionStartedAt: 0, castStreamOffset: 0, castSeeking: false, castIgnoreInactiveUntil: 0, castIgnoreRemoteTrackUntil: 0, castDeviceTrackKey: '', castRelayConnected: false, castRelayLostCount: 0, castInactiveCount: 0,
}

function readQueue() {
  try {
    const value = JSON.parse(localStorage.getItem('yinyun-player-queue') || '[]')
    return Array.isArray(value) ? value.slice(0, 1000) : []
  } catch { return [] }
}
function readDownloadHistory() {
  try { const value = JSON.parse(localStorage.getItem('yinyun-download-history') || '[]'); return Array.isArray(value) ? value.slice(0, 500) : [] } catch { return [] }
}
function readPlayStats() { try { const value = JSON.parse(localStorage.getItem('yinyun-play-stats') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} } }
function readAlbumReleaseDates() { try { const value = JSON.parse(localStorage.getItem('yinyun-album-release-dates') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} } }
function savePlayStats() { localStorage.setItem('yinyun-play-stats', JSON.stringify(state.playStats)) }
function saveAlbumReleaseDates() { localStorage.setItem('yinyun-album-release-dates', JSON.stringify(state.albumReleaseDates)) }
function saveDownloadHistory() { localStorage.setItem('yinyun-download-history', JSON.stringify(state.downloadHistory.slice(0, 500))) }
function saveQueue() { localStorage.setItem('yinyun-player-queue', JSON.stringify(state.queue)) }
function playlistTrack(value) { return { ...rawTrack(value), id: trackId(value) } }
function normalizeTrack(value) {
  const raw = rawTrack(value) || {}
  return {
    id: String(value?.id || raw.id || raw.songmid || raw.hash || ''),
    title: String(value?.title || raw.name || '未知歌曲'), artist: String(value?.artist || raw.singer || '未知歌手'),
    album: String(value?.album || raw.albumName || raw.album || raw.meta?.albumName || ''), source: String(value?.source || raw.source || 'unknown'),
    duration: value?.duration ?? raw.interval ?? raw.meta?.interval ?? 0, artworkUrl: value?.artworkUrl || raw.img || raw.picUrl || raw.meta?.picUrl || raw.album?.picUrl || '',
    quality: value?.quality || raw.quality || '', extension: String(value?.extension || raw.extension || '').replace(/^\./, '').toLowerCase(), bitrate: Number(value?.bitrate || raw.bitrate || 0), size: Number(value?.size || raw.size || 0),
    localTrackId: value?.localTrackId || (value?.streamPath ? value.id : ''), streamPath: value?.streamPath || '', raw,
  }
}
function castIdentityText(value) { return String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') }
function castTrackKey(track) {
  const normalized = normalizeTrack(track)
  const title = castIdentityText(normalized.title)
  const artist = castIdentityText(normalized.artist)
  return title && artist ? `${title}|${artist}` : title
}
function castStatusValues(status) {
  const detail = status?.detail && typeof status.detail === 'object' ? status.detail : {}
  return {
    title: status?.title || detail.title || detail.song_name || detail.songName || detail.name || '',
    artist: status?.artist || detail.artist || detail.artist_name || detail.artistName || detail.singer || '',
    audioId: status?.audioId || detail.audio_id || detail.audioId || detail.song_id || detail.songId || '',
  }
}
function castStatusKey(status) {
  const values = castStatusValues(status)
  const title = castIdentityText(values.title)
  const artist = castIdentityText(values.artist)
  const audioId = castIdentityText(values.audioId)
  return title && artist ? `${title}|${artist}` : title ? `title:${title}` : audioId ? `id:${audioId}` : ''
}
function castStatusMatchesTrack(status, track) {
  const values = castStatusValues(status)
  const remoteTitle = castIdentityText(values.title)
  const remoteArtist = castIdentityText(values.artist)
  const remoteAudioId = castIdentityText(values.audioId)
  const normalized = normalizeTrack(track)
  const title = castIdentityText(normalized.title)
  const artist = castIdentityText(normalized.artist)
  if (remoteAudioId && [...trackIdentityAliases(track)].some(alias => castIdentityText(alias) === remoteAudioId)) return true
  if (!remoteTitle || !title || remoteTitle !== title) return false
  if (!remoteArtist || !artist) return true
  return remoteArtist === artist || remoteArtist.includes(artist) || artist.includes(remoteArtist)
}
function entityKey(value) { const item = value?.raw || value || {}; return `${item.source || value?.source || ''}_${item.id || item.mid || value?.id || ''}` }
function normalizeEntity(value, type) {
  const raw = value?.raw || value || {}
  return {
    id: String(value?.id || raw.id || raw.mid || ''), name: String(value?.name || raw.name || '未知'), artist: String(value?.artist || raw.artistName || raw.artist || raw.singer || ''),
    source: String(value?.source || raw.source || 'unknown'), artworkUrl: value?.artworkUrl || raw.picUrl || raw.img || raw.info?.img || '', kind: type,
    trackCount: Number(value?.trackCount ?? raw.size ?? raw.total ?? raw.count ?? 0), albumCount: Number(value?.albumCount ?? raw.albumSize ?? 0),
    publishTime: value?.publishTime || raw.publishTime || raw.info?.publishTime || '', raw,
  }
}
function formatTime(value) {
  if (typeof value === 'string' && /^\d{1,3}:\d{2}$/.test(value)) return value
  const seconds = Number(value) || 0
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}
function durationSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value || '').trim(); if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text)
  const parts = text.split(':').map(Number); if (parts.some(part => !Number.isFinite(part))) return 0
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}
function formatBytes(value) { const size = Number(value) || 0; if (!size) return '-'; const units = ['B', 'KB', 'MB', 'GB']; let current = size; let index = 0; while (current >= 1024 && index < units.length - 1) { current /= 1024; index++ } return `${current >= 100 || index === 0 ? Math.round(current) : current.toFixed(1)} ${units[index]}` }
function qualityLabel(value) {
  const track = normalizeTrack(value); const types = track.raw?.types || track.raw?.meta?.qualitys || track.raw?._types || {}; const order = ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master']; const onlineQuality = order.filter(id => Number(types?.[id]?.size || types?.[id]) > 0).at(-1) || ''; const quality = track.quality && track.quality !== 'unknown' ? track.quality : onlineQuality; const onlineSize = Number(types?.[onlineQuality]?.size || types?.[onlineQuality] || 0); const size = track.size || onlineSize; const extension = track.extension || (['128k', '320k'].includes(quality) ? 'mp3' : quality ? 'flac' : '')
  const seconds = durationSeconds(track.duration); const bitrate = track.bitrate || (size > 0 && seconds > 0 ? Math.round(size * 8 / seconds / 1000) : 0)
  return [extension, bitrate ? `${bitrate}K` : ''].filter(Boolean).join(' ')
}
const QUALITY_NAMES = { '128k': '标准音质', '320k': '高音质', flac: '无损音质', flac24bit: '24bit 无损', hires: '高解析度', atmos: '空间音频', atmos_plus: '增强空间音频', master: '母带音质' }
function platformLabel(value) { const source = String(value || '').trim().toLowerCase(); return source && source !== 'unknown' ? source.toUpperCase() : '' }
function actualQualityLabel(value) { const quality = String(value || '').trim().toLowerCase(); return QUALITY_NAMES[quality] || quality.toUpperCase() }
function setBadge(element, text, title = '') { element.textContent = text; element.title = title || text; element.classList.toggle('hidden', !text) }
function playbackStatusText() {
  const info = state.playbackInfo
  if (state.playbackState === 'resolving') return '正在获取播放地址'
  if (state.playbackState === 'buffering') return '正在缓冲'
  if (state.playbackState === 'error') return info?.error || '播放失败'
  if (!state.current) return '等待播放'
  if (state.output === 'xiaoai') {
    const device = state.xiaoai.selectedDevice?.name || '小爱音箱'
    if (state.playbackState === 'paused') return `小爱投放 · ${device} · 已暂停`
    return `小爱投放 · ${device} · 正在播放`
  }
  if (info?.local) return state.playbackState === 'paused' ? '本地播放 · 已暂停' : '本地播放'
  if (info?.switched) return `已从 ${platformLabel(info.requestedSource)} 切换至 ${platformLabel(info.actualSource)} · ${state.playbackState === 'paused' ? '已暂停' : '正在播放'}`
  return state.playbackState === 'paused' ? '已暂停' : '正在播放'
}
function renderPlaybackStatus() {
  const track = state.current ? normalizeTrack(state.current) : null; const info = state.playbackInfo
  const requestedSource = info?.requestedSource || track?.source; const actualSource = info?.actualSource || track?.source
  const source = info?.switched ? `${platformLabel(requestedSource)} → ${platformLabel(actualSource)}` : platformLabel(actualSource)
  const quality = actualQualityLabel(info?.actualQuality || track?.quality)
  const sourceTitle = info?.local ? `本地文件${actualSource ? ` · 来源平台 ${platformLabel(actualSource)}` : ''}` : info?.sourceName ? `音源：${info.sourceName}` : source
  for (const element of [elements.nowSource, elements.lyricsSource]) setBadge(element, source, sourceTitle)
  for (const element of [elements.nowQuality, elements.lyricsQuality]) setBadge(element, quality)
  const text = playbackStatusText(); const visualState = state.playbackState === 'buffering' ? 'resolving' : ['resolving', 'playing', 'paused', 'error'].includes(state.playbackState) ? state.playbackState : 'idle'
  for (const element of [elements.playerStatus, elements.lyricsPlaybackStatus]) { element.dataset.state = visualState; element.querySelector('span').textContent = text; element.title = text }
}
function timestamp(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number' && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value
  const parsed = Date.parse(String(value)); return Number.isFinite(parsed) ? parsed : 0
}
function addedTimestamp(value) {
  const raw = rawTrack(value) || {}; const meta = raw.meta || {}
  return Math.max(...[value?.addedAt, value?.createdAt, value?.downloadedAt, value?.modifiedAt, value?.updatedAt, value?.mtimeMs, raw.addedAt, raw.createdAt, raw.downloadedAt, raw.modifiedAt, raw.updatedAt, raw.mtimeMs, meta.addedAt, meta.createdAt, meta.modifiedAt].map(timestamp))
}
function albumReference(item) {
  const raw = item?.raw || {}; const meta = raw.meta || {}; const source = String(item?.platformSource || (item?.source !== 'local' ? item?.source : '') || raw.source || meta.source || '').toLowerCase(); const id = raw.albumId || raw.albumMid || raw.album?.id || meta.albumId || meta.albumMid || ''
  return source && id ? { key: `${source}:${id}`, source, id: String(id), name: item.name || '', artist: item.artist || '' } : null
}
function albumPublishTime(item) { const reference = albumReference(item); return item.publishTime || (reference ? state.albumReleaseDates[reference.key] : '') || '' }
function comparableName(value) { return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s·・.'’"“”\-—_()[\]（）【】]/g, '') }
async function fetchAlbumPublishTime(reference) {
  try { const result = await api.getEntityDetail('album', reference.id, reference.source, { name: reference.name, artist: reference.artist }); if (result?.entity?.publishTime) return result.entity.publishTime } catch { /* Older downloads may contain a legacy album ID. */ }
  for (const source of [...new Set([reference.source, 'tx', 'wy'])].filter(item => ['tx', 'wy'].includes(item))) {
    try {
      const result = await api.searchEntities({ query: reference.name, type: 'album', source, page: 1, limit: 10 }); const items = Array.isArray(result?.items) ? result.items : []; const name = comparableName(reference.name); const artist = comparableName(reference.artist)
      const exact = items.filter(item => comparableName(item.name) === name); const match = exact.find(item => { const candidate = comparableName(item.artist); return !artist || candidate.includes(artist) || artist.includes(candidate) }) || exact[0]
      if (!match?.id) continue
      const detail = await api.getEntityDetail('album', match.id, source, { name: match.name || reference.name, artist: match.artist || reference.artist }); if (detail?.entity?.publishTime) return detail.entity.publishTime
    } catch { /* Try the next enabled catalog. */ }
  }
  return ''
}
async function resolveAlbumReleaseDates(items) {
  if (state.albumReleasePromise) return state.albumReleasePromise
  const missing = [...new Map(items.map(item => [albumReference(item)?.key, item]).filter(([key, item]) => key && !albumPublishTime(item))).values()]
  if (!missing.length) return
  state.albumReleasePromise = (async () => {
    let cursor = 0; let completed = 0; const total = missing.length; const previousSubtitle = elements.subtitle.textContent
    const worker = async () => {
      while (cursor < total) {
        const item = missing[cursor++]; const reference = albumReference(item); if (!reference) continue
        const date = await fetchAlbumPublishTime(reference); if (date) state.albumReleaseDates[reference.key] = date
        completed++; elements.subtitle.textContent = `正在读取发行日期 ${completed}/${total}`
      }
    }
    await Promise.all(Array.from({ length: Math.min(6, total) }, worker)); saveAlbumReleaseDates(); elements.subtitle.textContent = previousSubtitle
  })().finally(() => { state.albumReleasePromise = null })
  return state.albumReleasePromise
}
function compareText(left, right) { return String(left || '').localeCompare(String(right || ''), 'zh-CN', { sensitivity: 'base' }) }
function applyTrackSort() {
  state.tracks = state.originalTracks.slice()
  if (state.trackSort === 'lastPlayed') state.tracks.sort((a, b) => Number(state.playStats[trackId(b)]?.lastPlayed || 0) - Number(state.playStats[trackId(a)]?.lastPlayed || 0))
  else if (state.trackSort === 'mostPlayed') state.tracks.sort((a, b) => Number(state.playStats[trackId(b)]?.count || 0) - Number(state.playStats[trackId(a)]?.count || 0) || Number(state.playStats[trackId(b)]?.lastPlayed || 0) - Number(state.playStats[trackId(a)]?.lastPlayed || 0))
}
function setTracks(items) { state.originalTracks = Array.isArray(items) ? items.slice() : []; state.selectedTracks.clear(); applyTrackSort() }
function selectedOrAllTracks() { const selected = state.tracks.filter(track => state.selectedTracks.has(trackId(track))); return selected.length ? selected : state.tracks }
function updateSelectionUi() {
  const count = state.selectedTracks.size; elements.selectionSummary.textContent = state.selectionMode ? `${count} 首已选择` : ''; elements.selectionSummary.classList.toggle('hidden', !state.selectionMode)
  for (const button of [elements.trackSelect, elements.playlistSelect, elements.entitySelect]) button?.classList.toggle('active', state.selectionMode)
}
function toggleSelectionMode() { state.selectionMode = !state.selectionMode; state.selectedTracks.clear(); updateSelectionUi(); renderTrackList() }
function playCollection(shuffle = false) { const tracks = selectedOrAllTracks(); if (!tracks.length) return; state.queue = shuffle ? tracks.slice().sort(() => Math.random() - 0.5) : tracks.slice(); state.queueIndex = 0; saveQueue(); renderQueue(); void playAt(0) }
function icon(name) { const item = document.createElement('i'); item.dataset.lucide = name; return item }
function replaceIcons() { window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } }) }
function setButtonIcon(button, name) { button.replaceChildren(icon(name)); replaceIcons() }
function errorMessage(error) { return window.yinyunErrors?.friendlyErrorMessage(error) || error?.message || String(error || '操作失败') }
function showToast(message, error = false) {
  clearTimeout(state.toastTimer); elements.toast.textContent = message; elements.toast.className = `toast${error ? ' error' : ''}`
  state.toastTimer = setTimeout(() => elements.toast.classList.add('hidden'), error ? 5000 : 3000)
}
function setLoading(value) {
  state.loading = value; elements.loading.classList.toggle('hidden', !value); const albumTab = state.view === 'artistDetail' && state.entityTab === 'albums'; elements.trackList.classList.toggle('hidden', value || albumTab)
  if (value) elements.empty.classList.add('hidden')
}
function setActiveNavigation(attribute, value) {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'))
  const item = document.querySelector(`[${attribute}="${CSS.escape(value)}"]`); if (item) item.classList.add('active')
}
function showMode(mode) {
  elements.searchView.classList.toggle('hidden', !['search', 'searchEntities'].includes(mode)); elements.leaderboardView.classList.toggle('hidden', mode !== 'leaderboards')
  elements.libraryView.classList.toggle('hidden', !['artists', 'albums', 'searchEntities'].includes(mode)); elements.downloadsView.classList.toggle('hidden', mode !== 'downloads'); elements.tracksView.classList.toggle('hidden', !['playlist', 'songs', 'search', 'leaderboardTracks', 'artistDetail', 'albumDetail'].includes(mode)); elements.about.classList.toggle('hidden', mode !== 'about'); elements.xiaoaiView.classList.toggle('hidden', mode !== 'xiaoai')
  elements.playlistHero.classList.toggle('hidden', mode !== 'playlist')
}
function currentRoute() {
  if (state.view === 'playlist') return { view: 'playlist', id: state.playlistId }
  if (state.view === 'leaderboardTracks') return { view: 'leaderboards' }
  if (['artistDetail', 'albumDetail'].includes(state.view)) return { view: state.libraryType || 'artists' }
  return { view: state.view }
}
function rememberNavigation(nextRoute) {
  if (state.restoringNavigation || !state.app) return
  const route = currentRoute(); const previous = state.navigation.at(-1)
  if (nextRoute && JSON.stringify(route) === JSON.stringify(nextRoute)) return
  if (!previous || JSON.stringify(previous) !== JSON.stringify(route)) state.navigation.push(route)
  state.navigation = state.navigation.slice(-30); elements.navBack.disabled = state.navigation.length === 0
}
async function restoreRoute(route) {
  state.restoringNavigation = true
  try {
    if (route.view === 'playlist') await openPlaylist(route.id)
    else if (route.view === 'search') openSearch()
    else if (route.view === 'leaderboards') await openLeaderboards()
    else if (route.view === 'songs') await openSongs()
    else if (route.view === 'artists' || route.view === 'albums') await openLibrary(route.view, true)
    else if (route.view === 'downloads') openDownloads()
    else if (route.view === 'xiaoai') openXiaoai()
    else openAbout()
  } finally { state.restoringNavigation = false; elements.navBack.disabled = state.navigation.length === 0 }
}
function goBack() {
  if (state.detailHistory.length) return restoreEntityOrigin()
  const route = state.navigation.pop(); elements.navBack.disabled = state.navigation.length === 0
  if (route) void restoreRoute(route)
}
function renderPlayMode() {
  const modes = { list: ['repeat-2', '列表循环'], one: ['repeat-1', '单曲循环'], shuffle: ['shuffle', '随机播放'] }; const [name, title] = modes[state.playMode] || modes.list
  setButtonIcon(elements.playMode, name); elements.playMode.title = title; elements.playMode.setAttribute('aria-label', title)
}
function updateSearchControls() {
  const entitySearch = state.searchType !== 'song'
  if (entitySearch && !['tx', 'wy'].includes(state.searchSource)) state.searchSource = 'tx'
  elements.sourceTabs.forEach(button => {
    button.disabled = entitySearch && !['tx', 'wy'].includes(button.dataset.source)
    button.classList.toggle('active', button.dataset.source === state.searchSource)
  })
  elements.searchInput.placeholder = state.searchType === 'singer' ? '搜索歌手' : state.searchType === 'album' ? '搜索专辑' : '搜索歌曲'
}
function renderPlaylists() {
  elements.playlistNav.replaceChildren()
  state.playlists.filter(item => !['default', 'love'].includes(item.id)).forEach(playlist => {
    const button = document.createElement('button'); button.type = 'button'; button.className = `nav-item${state.view === 'playlist' && state.playlistId === playlist.id ? ' active' : ''}`; button.dataset.playlist = playlist.id
    button.append(icon('list-music'), Object.assign(document.createElement('span'), { textContent: playlist.name })); button.addEventListener('click', () => void openPlaylist(playlist.id)); elements.playlistNav.append(button)
  }); replaceIcons()
}
async function refreshPlaylists() {
  state.playlists = await api.getPlaylists(); renderPlaylists(); const love = await api.getPlaylist('love'); setFavoriteTracks(love.items || []); renderCurrentFavorite()
}
function setFavoriteTracks(items) { state.loveIndex = createFavoriteIndex(items) }
function isFavorite(track) { return Boolean(favoriteTrackId(track, state.loveIndex)) }
async function refreshLibraries() {
  const [artists, albums] = await Promise.all([api.getLibrary('artists'), api.getLibrary('albums')]); state.libraries = { artists: Array.isArray(artists) ? artists : [], albums: Array.isArray(albums) ? albums : [] }
}
async function refreshLocalTracks() {
  const first = await api.getLibraryTracks({ page: 1, limit: 500 }); const items = [...(first.items || [])]
  const pages = Math.ceil(Number(first.total || items.length) / 500)
  for (let page = 2; page <= pages; page++) { const result = await api.getLibraryTracks({ page, limit: 500 }); items.push(...(result.items || [])) }
  state.libraryTracks = items; return items
}
function localEntities(type) {
  const grouped = new Map()
  state.libraryTracks.forEach(value => {
    const track = normalizeTrack(value); const name = type === 'artists' ? track.artist : track.album
    if (!name) return
    const key = type === 'albums' ? `${name}\0${track.artist}`.toLocaleLowerCase() : name.toLocaleLowerCase(); const item = grouped.get(key) || { id: `local:${type}:${key}`, name, artist: type === 'albums' ? track.artist : '', source: 'local', platformSource: track.source, artworkUrl: track.artworkUrl, publishTime: value?.publishTime || track.raw?.publishTime || track.raw?.releaseDate || track.raw?.year || track.raw?.meta?.publishTime || '', addedAt: 0, kind: type === 'artists' ? 'singer' : 'album', local: true, raw: track.raw, tracks: [] }
    item.tracks.push(value); item.addedAt = Math.max(item.addedAt, addedTimestamp(value)); if (!item.artworkUrl && track.artworkUrl) item.artworkUrl = track.artworkUrl; grouped.set(key, item)
  })
  return [...grouped.values()].map(item => ({ ...item, trackCount: item.tracks.length }))
}
function localAlbumsFromTracks(tracks) {
  const grouped = new Map()
  for (const value of tracks) {
    const track = normalizeTrack(value); if (!track.album) continue; const key = track.album.toLocaleLowerCase()
    const item = grouped.get(key) || { id: `local:albums:${key}`, name: track.album, artist: track.artist, source: 'local', platformSource: track.source, artworkUrl: track.artworkUrl, kind: 'album', local: true, raw: track.raw, tracks: [] }
    item.tracks.push(value); if (!item.artworkUrl && track.artworkUrl) item.artworkUrl = track.artworkUrl; grouped.set(key, item)
  }
  return [...grouped.values()].map(item => ({ ...item, trackCount: item.tracks.length }))
}
function makeIconButton(name, title) { const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button subtle'; button.title = title; button.setAttribute('aria-label', title); button.append(icon(name)); return button }
function renderCover(parent, url, size = 'small') {
  if (size === 'entity') parent.classList.add('entity-cover')
  else if (size === 'small') parent.classList.add('track-cover')
  parent.replaceChildren()
  if (!url) return parent.append(icon('music-2'))
  const image = document.createElement('img'); image.src = url; image.alt = ''; image.addEventListener('error', () => parent.replaceChildren(icon('music-2')), { once: true }); parent.append(image)
}
function resetEntityDetailView() {
  elements.entityDetailSummary.classList.add('hidden'); elements.entityTabs.classList.add('hidden'); elements.relatedAlbums.classList.add('hidden'); elements.relatedAlbumList.replaceChildren(); state.entityDetail = null; state.entityDetailData = null
}
function renderTrackList() {
  elements.trackSort.value = state.trackSort
  elements.trackList.replaceChildren()
  state.tracks.forEach((sourceTrack, index) => {
    const track = normalizeTrack(sourceTrack); const row = document.createElement('div'); row.className = `track-row${state.current && trackId(state.current) === trackId(track) ? ' playing' : ''}`
    row.addEventListener('dblclick', event => { if (!event.target.closest('button, input')) playFromTracks(sourceTrack) })
    const main = document.createElement('div'); main.className = 'track-main'; main.title = '双击播放'; let number
    if (state.selectionMode) { number = document.createElement('input'); number.type = 'checkbox'; number.className = 'track-checkbox'; number.checked = state.selectedTracks.has(trackId(sourceTrack)); number.setAttribute('aria-label', `选择 ${track.title}`); number.addEventListener('click', event => event.stopPropagation()); number.addEventListener('change', () => { if (number.checked) state.selectedTracks.add(trackId(sourceTrack)); else state.selectedTracks.delete(trackId(sourceTrack)); updateSelectionUi() }) }
    else number = Object.assign(document.createElement('span'), { className: 'track-index', textContent: String(index + 1) })
    const cover = document.createElement('div'); renderCover(cover, track.artworkUrl); const copy = document.createElement('div'); copy.className = 'track-copy'; const meta = document.createElement('span'); meta.className = 'track-meta'; const quality = qualityLabel(sourceTrack); if (quality) meta.append(Object.assign(document.createElement('em'), { className: 'quality-badge', textContent: quality })); meta.append(Object.assign(document.createElement('span'), { textContent: [track.artist, track.album, track.source !== 'unknown' ? track.source.toUpperCase() : ''].filter(Boolean).join(' · ') })); copy.append(Object.assign(document.createElement('strong'), { textContent: track.title }), meta); main.append(number, cover, copy)
    const loved = isFavorite(sourceTrack); const actions = document.createElement('div'); actions.className = 'track-actions'; const play = makeIconButton('play', '播放'); const favorite = makeIconButton('heart', loved ? '取消收藏' : '收藏'); favorite.classList.toggle('active', loved); const download = makeIconButton(state.downloads.has(trackId(track)) ? 'loader-circle' : 'download', state.downloads.has(trackId(track)) ? '正在下载' : '下载到 Windows'); download.classList.toggle('download-active', state.downloads.has(trackId(track))); download.disabled = state.downloads.has(trackId(track)); const add = makeIconButton('list-plus', '加入歌单')
    play.addEventListener('click', () => playFromTracks(sourceTrack)); favorite.addEventListener('click', () => void toggleFavorite(sourceTrack)); download.addEventListener('click', () => void downloadTrack(sourceTrack)); add.addEventListener('click', event => showPlaylistMenu(event.currentTarget, sourceTrack)); actions.append(play, favorite, download, add)
    if (state.view === 'playlist' && !['love'].includes(state.playlistId)) { const remove = makeIconButton('x', '从歌单移除'); remove.addEventListener('click', () => void removeFromCurrentPlaylist(sourceTrack)); actions.append(remove) }
    row.append(main, Object.assign(document.createElement('span'), { className: 'track-duration', textContent: formatTime(track.duration) }), actions); elements.trackList.append(row)
  })
  const standaloneToolbar = ['songs', 'search', 'leaderboardTracks'].includes(state.view)
  elements.empty.classList.toggle('hidden', state.tracks.length > 0 || state.loading); elements.tracksToolbar.classList.toggle('hidden', state.tracks.length === 0 || !standaloneToolbar); document.querySelector('.track-columns').classList.toggle('hidden', state.tracks.length === 0); updateSelectionUi(); replaceIcons()
}
async function openPlaylist(id) {
  rememberNavigation({ view: 'playlist', id }); state.detailHistory = []; resetEntityDetailView(); state.view = 'playlist'; state.playlistId = id; state.boardId = null; state.selectionMode = false; setActiveNavigation('data-playlist', id); showMode('playlist'); elements.playlistActions.classList.remove('hidden'); elements.renamePlaylist.classList.toggle('hidden', ['love', 'default'].includes(id)); elements.deletePlaylist.classList.toggle('hidden', ['love', 'default'].includes(id)); elements.title.textContent = '歌单详情'; setLoading(true)
  try {
    const playlist = await api.getPlaylist(id); setTracks(playlist.items || []); elements.subtitle.textContent = playlist.name; elements.playlistName.textContent = playlist.name; elements.playlistMeta.textContent = `${state.tracks.length} 首`;
    const coverTrack = state.tracks.map(normalizeTrack).find(track => track.artworkUrl); renderCover(elements.playlistCover, coverTrack?.artworkUrl, 'playlist')
    if (id === 'love') setFavoriteTracks(state.tracks); renderTrackList()
  } catch (error) { showToast(errorMessage(error), true) } finally { setLoading(false) }
}
function openSearch() {
  rememberNavigation({ view: 'search' }); state.detailHistory = []; resetEntityDetailView(); state.view = 'search'; state.playlistId = ''; state.selectionMode = false; setTracks([]); state.entities = []; setActiveNavigation('data-view', 'search'); showMode('search'); elements.playlistActions.classList.add('hidden'); elements.title.textContent = '搜索'; elements.subtitle.textContent = '搜索在线曲库'; elements.trackList.replaceChildren(); elements.entityList.replaceChildren(); elements.empty.classList.remove('hidden'); elements.searchInput.focus()
}
async function search() {
  const query = elements.searchInput.value.trim(); if (!query) return elements.searchInput.focus(); setLoading(true)
  if (state.searchType === 'song') {
    resetEntityDetailView(); state.view = 'search'; showMode('search')
    try { const result = await api.search({ query, source: state.searchSource, page: 1, limit: 50 }); setTracks(result.items || []); elements.subtitle.textContent = `${state.searchSource.toUpperCase()} · ${state.tracks.length} 首结果`; renderTrackList() } catch (error) { showToast(errorMessage(error), true) } finally { setLoading(false) }
    return
  }
  setLoading(false); state.view = 'searchEntities'; showMode('searchEntities'); elements.title.textContent = state.searchType === 'singer' ? '歌手搜索' : '专辑搜索'; elements.subtitle.textContent = `${state.searchSource.toUpperCase()} · 正在搜索`; renderEntityStatus('正在搜索...', 'loader-circle', true)
  try {
    const result = await api.searchEntities({ query, type: state.searchType, source: state.searchSource, page: 1, limit: 50 })
    state.entities = (result.items || []).map(item => normalizeEntity(item, state.searchType)); elements.subtitle.textContent = `${state.searchSource.toUpperCase()} · ${state.entities.length} 个结果`; renderEntities(state.searchType, state.entities)
  } catch (error) {
    const message = errorMessage(error); elements.subtitle.textContent = `${state.searchSource.toUpperCase()} · 搜索失败`; renderEntityStatus(message, 'circle-alert'); showToast(message, true)
  }
}
function entitySubtitle(item) {
  const parts = [item.source.toUpperCase()]
  if (item.kind === 'singer' && item.albumCount) parts.push(`${item.albumCount} 张专辑`)
  if (item.kind === 'album' && item.trackCount) parts.push(`${item.trackCount} 首歌曲`)
  if (item.artist && item.artist !== item.name) parts.push(item.artist)
  if (item.publishTime) parts.push(String(item.publishTime).slice(0, 10))
  return parts.join(' · ')
}
function renderEntityStatus(message, iconName = 'search-x', loading = false) {
  elements.entityList.replaceChildren(); elements.libraryRefresh.classList.add('hidden'); const empty = createEntityEmpty(message, iconName); empty.classList.toggle('loading', loading); elements.entityList.append(empty); elements.entityList.classList.remove('hidden')
}
function bindEntityOpen(row, item) {
  row.setAttribute('role', 'button'); row.tabIndex = 0
  row.addEventListener('click', event => { if (!event.target.closest('button')) void openEntityDetail(item) })
  row.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button')) { event.preventDefault(); void openEntityDetail(item) } })
}
function renderEntities(kind, items) {
  elements.entityList.className = 'entity-list'; elements.entityList.replaceChildren(); elements.libraryRefresh.classList.add('hidden'); elements.trackList.classList.add('hidden'); elements.empty.classList.add('hidden')
  items.forEach(item => {
    const row = document.createElement('article'); row.className = 'entity-row'; bindEntityOpen(row, item); const cover = document.createElement('div'); renderCover(cover, item.artworkUrl, 'entity'); const info = document.createElement('div'); info.className = 'entity-copy'; info.append(Object.assign(document.createElement('strong'), { textContent: item.name }), Object.assign(document.createElement('span'), { textContent: entitySubtitle(item) })); const actions = document.createElement('div'); actions.className = 'entity-actions'; const favorite = makeIconButton('heart', isEntityLoved(kind, item) ? '取消收藏' : '收藏'); favorite.classList.toggle('active', isEntityLoved(kind, item)); favorite.addEventListener('click', () => void toggleEntityFavorite(kind === 'singer' ? 'artists' : 'albums', item)); const open = makeIconButton('chevron-right', '查看详情'); open.addEventListener('click', () => void openEntityDetail(item)); actions.append(favorite, open); row.append(cover, info, actions); elements.entityList.append(row)
  }); if (!items.length) elements.entityList.append(createEntityEmpty('没有找到匹配结果')); elements.libraryLabel.textContent = `搜索结果 · ${items.length} 个`; elements.entityList.classList.remove('hidden'); replaceIcons()
}
function createEntityEmpty(message, iconName = 'search-x') { const empty = document.createElement('div'); empty.className = 'entity-empty'; empty.append(icon(iconName), Object.assign(document.createElement('span'), { textContent: message })); return empty }
function isEntityLoved(kind, item) { const type = kind === 'singer' ? 'artists' : kind === 'album' ? 'albums' : kind; return state.libraries[type].some(saved => entityKey(saved) === entityKey(item)) }
async function toggleEntityFavorite(type, item) {
  const target = entityFavoriteItem(item); if (!target) return showToast('该项目缺少平台曲库标识，无法收藏', true)
  try { const list = state.libraries[type].slice(); const index = list.findIndex(saved => entityKey(saved) === entityKey(target)); if (index >= 0) list.splice(index, 1); else list.unshift({ ...target.raw, id: target.id, name: target.name, source: target.source, picUrl: target.artworkUrl, artistName: target.artist }); await api.saveLibrary(type, list); state.libraries[type] = list; if (state.view === type) renderLibrary(type); else if (['artistDetail', 'albumDetail'].includes(state.view)) renderDetailSummary(state.entityDetail, state.entityDetailData); else renderEntities(item.kind, state.entities); showToast(index >= 0 ? '已取消收藏' : '已收藏') } catch (error) { showToast(errorMessage(error), true) }
}
async function openLibrary(type, preserveHistory = false) {
  if (!preserveHistory) { rememberNavigation({ view: type }); state.detailHistory = [] } resetEntityDetailView(); state.view = type; state.libraryType = type; setActiveNavigation('data-view', type); showMode(type); elements.playlistActions.classList.add('hidden'); elements.title.textContent = type === 'artists' ? '艺术家' : '专辑'; elements.subtitle.textContent = '正在整理本地音乐'
  elements.librarySort.replaceChildren(...(type === 'artists'
    ? [['all', '艺术家'], ['favorites', '仅收藏']]
    : [['recent', '最近添加'], ['released', '最近发行']]).map(([value, label]) => Object.assign(document.createElement('option'), { value, textContent: label })))
  try { await refreshLocalTracks(); if (type === 'albums' && state.librarySort === 'released') await resolveAlbumReleaseDates(localEntities(type)); renderLibrary(type) } catch (error) { showToast(errorMessage(error), true) }
}
function renderLibrary(type) {
  const localItems = localEntities(type); const favorites = state.libraries[type].map(item => ({ ...normalizeEntity(item, type === 'artists' ? 'singer' : 'album'), addedAt: addedTimestamp(item), favorite: true })); const favoriteNames = new Set(favorites.map(item => item.name.toLocaleLowerCase())); let items = [...favorites, ...localItems.filter(item => !favoriteNames.has(item.name.toLocaleLowerCase()))]; if (type === 'artists' && state.artistFilter === 'favorites') items = items.filter(item => item.favorite); if (type === 'albums') { const dateOf = item => state.librarySort === 'released' ? timestamp(albumPublishTime(item)) : Number(item.addedAt || 0); items = items.map((item, index) => ({ item: { ...item, publishTime: albumPublishTime(item) }, index, date: dateOf(item) })).sort((a, b) => b.date - a.date || a.index - b.index).map(entry => entry.item) } elements.libraryRefresh.classList.remove('hidden'); elements.librarySort.value = type === 'artists' ? state.artistFilter : state.librarySort; elements.libraryLabel.textContent = `${items.length} 个${type === 'artists' ? '艺术家' : '专辑'}`; elements.subtitle.textContent = `${state.libraryTracks.length} 首本地歌曲 · ${favorites.length} 个收藏`; elements.entityList.className = `entity-list ${type === 'artists' ? 'artist-grid' : 'album-grid'}`; elements.trackList.classList.add('hidden'); elements.empty.classList.add('hidden'); elements.entityList.replaceChildren()
  items.forEach(item => { const card = document.createElement('article'); card.className = 'library-card'; bindEntityOpen(card, item); const cover = document.createElement('div'); cover.className = 'library-card-cover'; renderCover(cover, item.artworkUrl, 'entity'); if (item.favorite) cover.append(Object.assign(document.createElement('span'), { className: 'library-favorite', title: '已收藏', textContent: '♥' })); const copy = document.createElement('div'); copy.className = 'library-card-copy'; const detail = [item.favorite ? '已收藏' : '', item.publishTime ? String(item.publishTime).slice(0, 10) : '', item.trackCount ? `${item.trackCount} 首` : '', item.artist].filter(Boolean).join(' · '); copy.append(Object.assign(document.createElement('strong'), { textContent: item.name }), Object.assign(document.createElement('span'), { textContent: detail })); card.append(cover, copy); elements.entityList.append(card) }); if (!items.length) elements.entityList.append(createEntityEmpty('本地音乐中没有可整理的内容')); replaceIcons()
}
function captureDetailOrigin() {
  if (state.entityDetail && ['artistDetail', 'albumDetail'].includes(state.view)) return { type: 'detail', item: state.entityDetail }
  if (state.view === 'searchEntities') return { type: 'search', kind: state.searchType, title: elements.title.textContent, subtitle: elements.subtitle.textContent }
  if (state.view === 'artists' || state.view === 'albums') return { type: 'library', libraryType: state.view }
  return { type: 'library', libraryType: state.libraryType }
}
function renderDetailSummary(entity, result) {
  elements.entityDetailSummary.classList.remove('hidden'); renderCover(elements.entityDetailCover, entity.artworkUrl, 'detail'); elements.entityDetailKind.textContent = entity.kind === 'singer' ? '艺术家' : '专辑'; elements.entityDetailName.textContent = entity.name
  const songs = result.songs || []; const parts = [`${songs.length} 首歌曲`]
  if (entity.kind === 'singer') parts.push(`${(result.albums || []).length} 张专辑`)
  if (entity.artist && entity.artist !== entity.name) parts.push(entity.artist)
  if (entity.publishTime) parts.push(String(entity.publishTime).slice(0, 10))
  elements.entityDetailMeta.textContent = parts.join(' · '); elements.entityDetailDescription.textContent = result.entity?.description || ''; const favoriteItem = entityFavoriteItem(entity); elements.entityFavorite.disabled = !favoriteItem; elements.entityFavorite.classList.toggle('active', favoriteItem ? isEntityLoved(entity.kind, favoriteItem) : false); elements.entityFavorite.title = favoriteItem ? (isEntityLoved(entity.kind, favoriteItem) ? '取消收藏' : '收藏') : '缺少平台曲库标识，无法收藏'
}
function renderRelatedAlbums(albums) {
  elements.relatedAlbums.classList.remove('hidden'); elements.relatedAlbumCount.textContent = `${albums.length} 张`; elements.relatedAlbumList.replaceChildren()
  albums.forEach(value => {
    const album = value.local ? value : normalizeEntity(value, 'album'); const button = document.createElement('button'); button.type = 'button'; button.className = 'library-card'; button.title = `打开专辑：${album.name}`
    const cover = document.createElement('div'); cover.className = 'library-card-cover'; renderCover(cover, album.artworkUrl, 'album')
    const copy = document.createElement('div'); copy.className = 'library-card-copy'; const detail = album.publishTime ? String(album.publishTime).slice(0, 10) : album.trackCount ? `${album.trackCount} 首` : album.artist
    copy.append(Object.assign(document.createElement('strong'), { textContent: album.name }), Object.assign(document.createElement('span'), { textContent: detail || album.source.toUpperCase() }))
    button.append(cover, copy); button.addEventListener('click', () => void openEntityDetail(album)); elements.relatedAlbumList.append(button)
  })
  if (!albums.length) elements.relatedAlbumList.append(Object.assign(document.createElement('span'), { className: 'entity-detail-empty', textContent: '暂无专辑信息' }))
}
function entityFavoriteItem(entity) {
  if (!entity) return null
  if (!entity.local) return entity
  const raw = entity.raw || {}; const id = entity.kind === 'album' ? (raw.albumId || raw.album?.id || raw.albumMid) : (raw.singerId || raw.singerMid || raw.singer?.mid)
  if (!id || !entity.platformSource) return null
  return { ...entity, id: String(id), source: entity.platformSource, raw: { ...raw, id: String(id), source: entity.platformSource } }
}
function renderEntityTab(tab) {
  if (!state.entityDetailData || !state.entityDetail) return
  state.entityTab = tab; elements.entityTabButtons.forEach(button => button.classList.toggle('active', button.dataset.entityTab === tab))
  if (state.entityDetail.kind === 'singer' && tab === 'albums') {
    elements.relatedAlbums.classList.remove('hidden'); elements.trackList.classList.add('hidden'); document.querySelector('.track-columns').classList.add('hidden'); elements.empty.classList.add('hidden'); elements.tracksToolbar.classList.add('hidden'); renderRelatedAlbums(state.entityDetailData.albums || [])
  } else {
    elements.relatedAlbums.classList.add('hidden'); setTracks(state.entityDetailData.songs || []); elements.trackList.classList.remove('hidden'); renderTrackList()
  }
}
async function openEntityDetail(item, pushHistory = true) {
  if (!item?.id || !['singer', 'album'].includes(item.kind)) return showToast('缺少歌手或专辑信息', true)
  if (pushHistory) { state.detailHistory.push(captureDetailOrigin()); elements.navBack.disabled = false }
  resetEntityDetailView(); state.entityDetail = item; state.view = item.kind === 'singer' ? 'artistDetail' : 'albumDetail'; state.selectionMode = false; showMode(state.view); elements.playlistActions.classList.add('hidden'); elements.title.textContent = item.kind === 'singer' ? '艺术家详情' : '专辑详情'; elements.subtitle.textContent = item.name; elements.trackList.replaceChildren(); setTracks([]); setLoading(true)
  try {
    if (item.local) {
      const result = { entity: item, songs: item.tracks || [], albums: item.kind === 'singer' ? localAlbumsFromTracks(item.tracks || []) : [] }; state.entityDetail = item; state.entityDetailData = result; setTracks(result.songs); renderDetailSummary(item, result); elements.entityTabs.classList.toggle('hidden', item.kind !== 'singer'); renderEntityTab(item.kind === 'singer' && result.albums.length ? 'albums' : 'songs'); return
    }
    const result = await api.getEntityDetail({ kind: item.kind, id: item.id, source: item.source, name: item.name, artist: item.artist })
    const entityData = result.entity || {}; const entity = normalizeEntity({ ...item, ...entityData, name: entityData.name || item.name, artist: entityData.artist || item.artist, artworkUrl: entityData.artworkUrl || item.artworkUrl, raw: item.raw }, item.kind)
    state.entityDetail = entity; state.entityDetailData = { ...result, songs: Array.isArray(result.songs) ? result.songs : [], albums: Array.isArray(result.albums) ? result.albums : [] }; setTracks(state.entityDetailData.songs); elements.subtitle.textContent = entity.name; renderDetailSummary(entity, state.entityDetailData); elements.entityTabs.classList.toggle('hidden', item.kind !== 'singer'); renderEntityTab(item.kind === 'singer' && state.entityDetailData.albums.length ? 'albums' : 'songs')
  } catch (error) {
    const message = errorMessage(error); elements.subtitle.textContent = '详情读取失败'; setTracks([]); renderTrackList(); showToast(message, true)
  } finally { setLoading(false) }
}
function restoreEntityOrigin() {
  const origin = state.detailHistory.pop()
  elements.navBack.disabled = state.detailHistory.length === 0 && state.navigation.length === 0
  if (!origin) return void openLibrary(state.entityDetail?.kind === 'album' ? 'albums' : 'artists', true)
  if (origin.type === 'detail') return void openEntityDetail(origin.item, false)
  if (origin.type === 'library') return void openLibrary(origin.libraryType, true)
  resetEntityDetailView(); state.view = 'searchEntities'; showMode('searchEntities'); elements.title.textContent = origin.title; elements.subtitle.textContent = origin.subtitle; renderEntities(origin.kind, state.entities)
}
async function openLeaderboards() {
  rememberNavigation({ view: 'leaderboards' }); state.detailHistory = []; resetEntityDetailView(); state.view = 'leaderboards'; state.boardId = null; setActiveNavigation('data-view', 'leaderboards'); showMode('leaderboards'); elements.playlistActions.classList.add('hidden'); elements.title.textContent = '排行榜'; elements.subtitle.textContent = '选择平台和榜单'; await loadBoards()
}
async function loadBoards() {
  elements.leaderboardStatus.textContent = '正在读取...'; elements.leaderboardList.replaceChildren(); try { const result = await api.getLeaderboards(state.boardSource); state.boards = result?.list || result?.items || []; elements.leaderboardStatus.textContent = `${state.boards.length} 个榜单`; state.boards.forEach(board => { const button = document.createElement('button'); button.type = 'button'; button.className = 'board-item'; button.append(icon('list-music'), Object.assign(document.createElement('span'), { textContent: board.name || board.id })); button.addEventListener('click', () => void openLeaderboardTracks(board)); elements.leaderboardList.append(button) }); replaceIcons() } catch (error) { elements.leaderboardStatus.textContent = ''; showToast(errorMessage(error), true) }
}
async function openLeaderboardTracks(board) {
  rememberNavigation({ view: 'leaderboardTracks' }); resetEntityDetailView(); state.view = 'leaderboardTracks'; state.boardId = board.bangid || String(board.id || '').replace(`${state.boardSource}__`, ''); showMode('leaderboardTracks'); elements.title.textContent = board.name || '排行榜'; elements.playlistActions.classList.add('hidden'); setLoading(true)
  try { const result = await api.getLeaderboardTracks({ source: state.boardSource, boardId: state.boardId, page: 1 }); setTracks(result.items || []); elements.subtitle.textContent = `${state.boardSource.toUpperCase()} · ${state.tracks.length} 首歌曲`; renderTrackList() } catch (error) { showToast(errorMessage(error), true) } finally { setLoading(false) }
}
async function openSongs() {
  rememberNavigation({ view: 'songs' }); state.detailHistory = []; resetEntityDetailView(); state.view = 'songs'; state.playlistId = ''; state.selectionMode = false; setActiveNavigation('data-view', 'songs'); showMode('songs'); elements.playlistActions.classList.add('hidden'); elements.title.textContent = '歌曲'; elements.subtitle.textContent = '正在读取本地音乐'; setLoading(true)
  try { setTracks(await refreshLocalTracks()); elements.subtitle.textContent = `${state.tracks.length} 首本地歌曲`; renderTrackList() } catch (error) { showToast(errorMessage(error), true) } finally { setLoading(false) }
}
function updateDownloadRecord(value) {
  const id = String(value.id || `${value.title || 'download'}:${value.path || ''}`); const record = { ...value, id, updatedAt: Date.now() }; const index = state.downloadHistory.findIndex(item => item.id === id)
  if (index >= 0) state.downloadHistory[index] = { ...state.downloadHistory[index], ...record }
  else state.downloadHistory.unshift(record)
  saveDownloadHistory()
}
function renderDownloads() {
  elements.downloadsList.replaceChildren(); const completed = state.downloadHistory.filter(item => item.status === 'completed').length; elements.downloadsSummary.textContent = `${state.downloadHistory.length} 条记录 · ${completed} 个已完成`
  state.downloadHistory.forEach(item => { const row = document.createElement('article'); row.className = 'download-row'; const statusIcon = item.status === 'completed' ? 'circle-check' : item.status === 'failed' ? 'circle-alert' : 'loader-circle'; const status = document.createElement('div'); status.className = `download-status ${item.status || ''}`; status.append(icon(statusIcon)); const copy = document.createElement('div'); copy.className = 'download-copy'; copy.append(Object.assign(document.createElement('strong'), { textContent: item.title || '未知歌曲' }), Object.assign(document.createElement('span'), { textContent: [item.artist, item.album, item.quality, item.source?.toUpperCase()].filter(Boolean).join(' · ') })); const progress = document.createElement('div'); progress.className = 'download-progress'; const percent = item.total ? Math.min(100, Math.round(Number(item.received || 0) / item.total * 100)) : 0; progress.append(Object.assign(document.createElement('span'), { textContent: item.status === 'completed' ? formatBytes(item.received) : item.status === 'failed' ? (item.error || '下载失败') : item.total ? `${percent}%` : formatBytes(item.received) }), Object.assign(document.createElement('small'), { textContent: item.path || '' })); row.append(status, copy, progress); elements.downloadsList.append(row) })
  if (!state.downloadHistory.length) elements.downloadsList.append(createEntityEmpty('还没有 Windows 本地下载记录', 'circle-down')); replaceIcons()
}
function openDownloads() { rememberNavigation({ view: 'downloads' }); state.detailHistory = []; resetEntityDetailView(); state.view = 'downloads'; setActiveNavigation('data-view', 'downloads'); showMode('downloads'); elements.playlistActions.classList.add('hidden'); elements.title.textContent = '下载管理'; elements.subtitle.textContent = 'Windows 本地下载'; renderDownloads() }
function openAbout() { rememberNavigation({ view: 'about' }); state.detailHistory = []; resetEntityDetailView(); state.view = 'about'; setActiveNavigation('data-view', 'about'); showMode('about'); elements.playlistActions.classList.add('hidden'); elements.title.textContent = '关于'; elements.subtitle.textContent = '客户端信息' }
function renderXiaoaiState() {
  const loggedIn = Boolean(state.xiaoai?.loggedIn); const selected = state.xiaoai?.selectedDevice
  elements.xiaoaiAccountState.textContent = loggedIn ? `已登录${selected ? ` · ${selected.name}` : ''}` : '未登录'; elements.xiaoaiAccountState.classList.toggle('connected', loggedIn)
  elements.xiaoaiLoginSection.classList.toggle('hidden', loggedIn); elements.xiaoaiDeviceSection.classList.toggle('hidden', !loggedIn)
  elements.castToggle.classList.toggle('active', state.output === 'xiaoai'); elements.castToggle.title = state.output === 'xiaoai' ? `正在投放到 ${selected?.name || '小爱音箱'}，点击断开` : selected ? `投放到 ${selected.name}` : '配置小爱投放'
  elements.castToggle.setAttribute('aria-label', elements.castToggle.title)
}
async function loadXiaoaiDevices() {
  elements.xiaoaiRefresh.disabled = true
  try {
    state.xiaoaiDevices = await api.getXiaoaiDevices(); elements.xiaoaiDevice.replaceChildren(new Option('请选择设备', ''))
    for (const device of state.xiaoaiDevices) elements.xiaoaiDevice.append(new Option(`${device.name}${device.presence === 'online' ? ' · 在线' : ''}`, device.id))
    elements.xiaoaiDevice.value = state.xiaoai.selectedDeviceId || ''; if (!state.xiaoaiDevices.length) showToast('当前小米账号下没有可用的小爱音箱', true)
  } catch (error) { showToast(errorMessage(error), true) } finally { elements.xiaoaiRefresh.disabled = false }
}
function openXiaoai() {
  rememberNavigation({ view: 'xiaoai' }); state.detailHistory = []; resetEntityDetailView(); state.view = 'xiaoai'; setActiveNavigation('data-view', 'xiaoai'); showMode('xiaoai'); elements.playlistActions.classList.add('hidden'); elements.title.textContent = '小爱投放'; elements.subtitle.textContent = '扫码登录、选择设备并控制播放'; renderXiaoaiState(); if (state.xiaoai.loggedIn && !state.xiaoaiDevices.length) void loadXiaoaiDevices()
}
async function startXiaoaiLogin() {
  const token = ++state.xiaoaiPollToken; elements.xiaoaiLogin.disabled = true; elements.xiaoaiQrStatus.textContent = '正在获取二维码...'
  try {
    const result = await api.startXiaoaiLogin(); if (token !== state.xiaoaiPollToken) return
    elements.xiaoaiQr.src = result.qrcodeUrl; elements.xiaoaiQrWrap.classList.remove('hidden'); elements.xiaoaiQrStatus.textContent = '请扫码并在手机上确认登录'
    while (token === state.xiaoaiPollToken) {
      const status = await api.pollXiaoaiLogin(); if (token !== state.xiaoaiPollToken) return
      if (status.state === 'confirmed') { state.xiaoai = status.xiaoai; elements.xiaoaiQrWrap.classList.add('hidden'); renderXiaoaiState(); await loadXiaoaiDevices(); showToast('小米账号登录成功'); return }
      if (['expired', 'failed'].includes(status.state)) throw new Error(status.message || '二维码已失效')
      elements.xiaoaiQrStatus.textContent = '等待扫码并确认登录'
    }
  } catch (error) { elements.xiaoaiQrStatus.textContent = errorMessage(error); showToast(errorMessage(error), true) } finally { if (token === state.xiaoaiPollToken) elements.xiaoaiLogin.disabled = false }
}
async function selectXiaoaiDevice() {
  const device = state.xiaoaiDevices.find(item => item.id === elements.xiaoaiDevice.value); if (!device) return showToast('请先选择小爱音箱', true)
  state.xiaoai = await api.selectXiaoaiDevice(device.id); renderXiaoaiState(); showToast(`已选择 ${device.name}`)
}
function stopCastStatusPolling() {
  if (state.castStatusTimer) clearInterval(state.castStatusTimer)
  if (state.castProgressTimer) clearInterval(state.castProgressTimer)
  if (state.castVoiceTimer) clearInterval(state.castVoiceTimer)
  if (state.castRecoveryTimer) clearTimeout(state.castRecoveryTimer)
  state.castStatusTimer = null; state.castProgressTimer = null; state.castVoiceTimer = null; state.castRecoveryTimer = null; state.castStatusReading = false; state.castVoiceReading = false; state.castVoiceReady = false; state.castInactiveCount = 0
}
function scheduleCastVoiceRecovery(generation) {
  if (state.castRecoveryTimer || state.castPausedByUser || state.output !== 'xiaoai') return
  state.castRecoveryTimer = setTimeout(async () => {
    state.castRecoveryTimer = null
    if (state.output !== 'xiaoai' || generation !== state.castGeneration || state.castPausedByUser || !state.current) return
    if (!state.castVoiceRecoveryNeeded) return
    try {
      await resumeCastPlayback()
    } catch {
      // A voice interaction may temporarily interrupt the speaker stream.
      // The next status poll will retry without changing the selected track.
    }
  }, 4500)
}
function voiceRecordList(records) {
  return (Array.isArray(records) ? records : [])
    .filter(record => record && record.query)
    .sort((left, right) => Number(left.timestamp || 0) - Number(right.timestamp || 0))
}
function rememberVoiceRecords(records) {
  const list = voiceRecordList(records)
  for (const record of list.slice(-20)) state.castVoiceSeenKeys.add(conversationKey(record))
  if (state.castVoiceSeenKeys.size > 40) state.castVoiceSeenKeys = new Set([...state.castVoiceSeenKeys].slice(-20))
  return list.at(-1) || null
}
function voiceRecordIsNew(record) {
  const key = conversationKey(record)
  if (!key || state.castVoiceSeenKeys.has(key)) return false
  state.castVoiceSeenKeys.add(key)
  return true
}
async function searchVoiceTrack(query) {
  const target = normalizeXiaoaiVoiceText(query)
  if (!target) return null
  const sources = [...new Set([state.playbackInfo?.actualSource, state.playbackInfo?.requestedSource, 'tx', 'wy'])]
    .map(value => String(value || '').toLowerCase()).filter(value => ['tx', 'wy', 'kw', 'kg', 'mg'].includes(value))
  for (const source of sources) {
    try {
      const result = await api.search({ query, source, page: 1, limit: 30 })
      const items = Array.isArray(result?.items) ? result.items : []
      const exactTitle = items.find(item => normalizeXiaoaiVoiceText(item.title || item.name) === target)
      if (exactTitle) return exactTitle
      const included = items.find(item => {
        const title = normalizeXiaoaiVoiceText(item.title || item.name)
        return title && (target.includes(title) || title.includes(target))
      })
      if (included) return included
    } catch {
      // Search the next enabled platform when one platform is unavailable.
    }
  }
  return null
}
async function handleXiaoaiVoiceCommand(record, generation) {
  const command = parseXiaoaiVoiceCommand(record.query)
  if (command.action === 'ignore') {
    scheduleCastVoiceRecovery(generation)
    return
  }
  if (state.castRecoveryTimer) { clearTimeout(state.castRecoveryTimer); state.castRecoveryTimer = null }
  state.castVoiceRecoveryNeeded = false
  state.castPausedByUser = ['pause', 'stop'].includes(command.action)
  try {
    if (command.action === 'next') return nextTrack(true)
    if (command.action === 'previous') return previousTrack()
    if (command.action === 'pause') {
      const position = currentCastPosition(); setCastPosition(position, false); state.playbackState = 'paused'; setButtonIcon(elements.playPause, 'play'); renderCastProgress(); renderPlaybackStatus(); await api.xiaoaiPause(); return
    }
    if (command.action === 'resume') {
      state.castPausedByUser = false; if (state.castUrl) await resumeCastPlayback(); else await playAt(state.queueIndex, true); return
    }
    if (command.action === 'stop') {
      await api.xiaoaiStop(); state.castUrl = ''; state.playbackState = 'paused'; setCastPosition(0, false); setButtonIcon(elements.playPause, 'play'); renderCastProgress(); renderPlaybackStatus(); return
    }
    if (command.action === 'play') {
      const track = await searchVoiceTrack(command.query)
      if (!track) { state.castPausedByUser = false; scheduleCastVoiceRecovery(generation); showToast(`没有找到“${command.query}”的精确歌曲`, true); return }
      state.queue = [track]; state.queueIndex = 0; saveQueue(); renderQueue(); renderTrackList(); await playAt(0, true)
    }
  } catch (error) {
    state.castPausedByUser = false
    scheduleCastVoiceRecovery(generation)
    showToast(`语音操作失败：${errorMessage(error)}`, true)
  }
}
function startCastVoicePolling(generation) {
  state.castVoiceReady = false
  state.castVoiceRecoveryNeeded = false
  state.castVoiceSeenKeys = new Set()
  const poll = async () => {
    if (state.output !== 'xiaoai' || generation !== state.castGeneration || state.castVoiceReading) return
    state.castVoiceReading = true
    try {
      const records = await api.getXiaoaiConversations(10)
      if (generation !== state.castGeneration || state.output !== 'xiaoai') return
      if (!state.castVoiceReady) {
        rememberVoiceRecords(records)
        state.castVoiceReady = true
        return
      }
      for (const record of voiceRecordList(records)) {
        if (!voiceRecordIsNew(record)) continue
        await handleXiaoaiVoiceCommand(record, generation)
        break
      }
      if (state.castVoiceSeenKeys.size > 40) state.castVoiceSeenKeys = new Set([...state.castVoiceSeenKeys].slice(-20))
    } catch {
      // A temporary Xiaomi API failure must not interrupt audio playback.
    } finally { state.castVoiceReading = false }
  }
  void poll()
  state.castVoiceTimer = setInterval(() => { void poll() }, 1200)
}
function currentCastPosition() {
  const elapsed = state.playbackState === 'playing' && state.castPositionStartedAt ? (Date.now() - state.castPositionStartedAt) / 1000 : 0
  const position = Math.max(0, state.castPosition + elapsed)
  const duration = castDuration()
  return duration ? Math.min(duration, position) : position
}
function setCastPosition(position, running = state.playbackState === 'playing') {
  state.castPosition = Math.max(0, Number(position) || 0); state.castPositionStartedAt = running ? Date.now() : 0
}
function castDuration() { return durationSeconds(normalizeTrack(state.current).duration) }
function castStatusAtEnd(status, positionBeforeStatus) {
  const duration = castDuration()
  if (!duration) return false
  const remotePosition = Number(status?.position)
  const endThreshold = Math.max(1, duration - 2)
  return positionBeforeStatus >= endThreshold || (Number.isFinite(remotePosition) && remotePosition >= endThreshold)
}
function nextCastQueueIndex(index) {
  if (state.queue.length < 2 || state.playMode === 'one') return -1
  if (state.playMode !== 'shuffle') return (index + 1) % state.queue.length
  let next = index
  while (next === index) next = Math.floor(Math.random() * state.queue.length)
  return next
}
async function startCastPlayback(source, position = 0, transcode = state.castTranscode) {
  const sources = (Array.isArray(source) ? source : [{ url: source, transcode }]).map(item => typeof item === 'string' ? { url: item } : { ...item })
  if (!sources.length || !sources[0].url) throw new Error('褰撳墠姝屾洸灏氭湭鍑嗗濂芥姇鏀?')
  const duration = castDuration()
  const offset = Math.min(Math.max(0, Number(position) || 0), duration || Number.MAX_SAFE_INTEGER)
  state.castGeneration++
  const generation = state.castGeneration
  stopCastStatusPolling()
  state.castSourceUrl = sources[0].url
  state.castQueueSources = sources
  state.castRelayUrls = []
  state.castTranscode = Boolean(sources[0].transcode ?? transcode)
  state.castSeenPlaying = false
  state.castPausedByUser = false
  state.castSeeking = false
  state.castDevicePosition = 0
  state.castStreamOffset = offset
  state.castDeviceTrackKey = castTrackKey(state.current)
  state.castRelayConnected = false
  state.castRelayLostCount = 0
  state.castInactiveCount = 0
  state.castIgnoreRemoteTrackUntil = Date.now() + 5000
  state.castIgnoreInactiveUntil = Date.now() + 5000
  setCastPosition(offset, false)
  const result = await api.xiaoaiPlay(sources[0].url, { sources, offsetSeconds: offset, durationSeconds: duration, transcode: state.castTranscode })
  if (generation !== state.castGeneration) return
  state.castRelayUrls = Array.isArray(result?.relayUrls) ? result.relayUrls : []
  state.castUrl = state.castRelayUrls[0] || ''
  state.playbackState = 'playing'
  setCastPosition(offset, true)
  setButtonIcon(elements.playPause, 'pause')
  renderCastProgress()
  startCastStatusPolling(generation)
}
function castSourcesForCurrent() {
  if (!state.castQueueSources.length) return [{ url: state.castSourceUrl, transcode: state.castTranscode }]
  const currentKey = castTrackKey(state.current)
  const index = state.castQueueSources.findIndex(item => castTrackKey(item) === currentKey)
  return index > 0 ? state.castQueueSources.slice(index) : state.castQueueSources.slice()
}
async function seekCastTo(position) {
  if (!state.castUrl) throw new Error('当前歌曲尚未准备好投放')
  const duration = castDuration()
  if (!duration) throw new Error('当前歌曲缺少时长，无法在小爱音箱中拖动播放')
  const target = Math.min(Math.max(0, Number(position) || 0), duration)
  const wasPlaying = state.playbackState === 'playing'
  setCastPosition(target, false)
  state.castStreamOffset = target
  state.castDevicePosition = 0
  renderCastProgress()
  state.playbackState = 'resolving'
  renderPlaybackStatus()
  await startCastPlayback(castSourcesForCurrent(), target)
  if (!wasPlaying) {
    await api.xiaoaiPause()
    state.castPausedByUser = true
    setCastPosition(target, false)
    state.playbackState = 'paused'
    setButtonIcon(elements.playPause, 'play')
    renderCastProgress()
  }
  renderPlaybackStatus()
}

async function resumeCastPlayback() {
  const position = currentCastPosition()
  if (!state.castUrl) throw new Error('小爱音箱未恢复播放')
  // Pausing can close the speaker's HTTP stream. Replaying the relay URL is
  // required to reconnect the stream; a native resume alone can report
  // "playing" while the speaker has no audio connection left.
  state.playbackState = 'resolving'
  state.castPausedByUser = false
  renderPlaybackStatus()
  await startCastPlayback(castSourcesForCurrent(), position)
}
function renderCastProgress() {
  if (state.output !== 'xiaoai' || !state.current) return
  const duration = durationSeconds(normalizeTrack(state.current).duration); const position = duration ? Math.min(duration, currentCastPosition()) : currentCastPosition()
  elements.elapsed.textContent = formatTime(position); elements.duration.textContent = formatTime(duration); elements.progress.value = duration ? String(Math.min(1000, Math.round(position / duration * 1000))) : '0'; syncLyrics(position)
}
function startCastStatusPolling(generation) {
  stopCastStatusPolling(); state.castStatusTimer = setInterval(async () => {
    if (state.output !== 'xiaoai' || generation !== state.castGeneration || !state.current || state.resolving || state.castStatusReading) return
    state.castStatusReading = true
    try {
      const status = await api.getXiaoaiStatus(); if (generation !== state.castGeneration) return
      const positionBeforeStatus = currentCastPosition()
      const statusAtEnd = castStatusAtEnd(status, positionBeforeStatus)
      if (status.volume >= 0 && document.activeElement !== elements.volume) elements.volume.value = String(Math.round(status.volume))
      if (status.status === 0 && !state.castPausedByUser) state.castInactiveCount++
      else if (status.status !== 0 || state.castPausedByUser) state.castInactiveCount = 0
      if (status.relayConnected === true) {
        state.castRelayConnected = true
        state.castRelayLostCount = 0
      } else if (status.relayConnected === false && state.castRelayConnected && !state.castPausedByUser) {
        state.castRelayLostCount++
        if (state.castRelayLostCount >= 2 && state.castInactiveCount >= 2 && statusAtEnd) {
          state.castRelayConnected = false
          state.castRelayLostCount = 0
          state.castSeenPlaying = false
          if (state.queue.length > 1) {
            state.playbackState = 'resolving'
            renderPlaybackStatus()
            nextTrack(true)
            return
          }
          setCastPosition(0, false)
          state.playbackState = 'paused'
          renderCastProgress()
          renderPlaybackStatus()
          return
        }
      }
      const remoteKey = castStatusKey(status)
      const trackKey = castTrackKey(state.current)
      const acceptsRemoteTrack = Date.now() >= state.castIgnoreRemoteTrackUntil || (state.playbackState === 'paused' && !state.castPausedByUser)
      if (remoteKey && acceptsRemoteTrack && remoteKey !== trackKey) {
        const remoteIndex = state.queue.findIndex(track => castStatusMatchesTrack(status, track))
        if (remoteIndex >= 0) {
          state.castDeviceTrackKey = remoteKey
          if (remoteIndex !== state.queueIndex) {
            // The speaker already has the next Yinyun item. Adopt it locally;
            // resolving it again would interrupt the device and add latency.
            state.queueIndex = remoteIndex
            state.current = state.queue[remoteIndex]
            const relayIndex = state.castQueueSources.findIndex(source => castStatusMatchesTrack(status, source))
            const queuedSource = relayIndex >= 0 ? state.castQueueSources[relayIndex] : null
            if (relayIndex > 0) {
              state.castQueueSources = state.castQueueSources.slice(relayIndex)
              state.castRelayUrls = state.castRelayUrls.slice(relayIndex)
            }
            state.castSourceUrl = queuedSource?.url || ''
            state.castUrl = relayIndex >= 0 ? state.castRelayUrls[relayIndex] || '' : ''
            state.castTranscode = Boolean(queuedSource?.transcode)
            state.castSeeking = false
            state.castStreamOffset = 0
            state.castDevicePosition = 0
            state.castPausedByUser = false
            setCastPosition(Math.max(0, Number(status.position) || 0), status.status === 1)
            state.playbackState = status.status === 1 ? 'playing' : 'paused'
            renderNowPlaying()
            renderQueue()
            renderTrackList()
            void loadLyrics(state.current)
          }
        } else {
          // Do not keep advancing the old track when the speaker is playing a
          // song outside the client queue.
          state.castDeviceTrackKey = remoteKey
          setCastPosition(status.position, status.status === 1 && !state.castPausedByUser)
          if (state.playbackState === 'playing') state.playbackState = 'paused'
          renderCastProgress()
          renderPlaybackStatus()
          return
        }
      } else if (remoteKey) {
        state.castDeviceTrackKey = remoteKey
      }
      if (!state.castSeeking && status.status === 1 && status.position >= 0 && !state.castPausedByUser) {
        // Some XiaoAI models report a stale zero position. Do not let it reset
        // the local clock that drives the progress bar.
        if (status.position > state.castDevicePosition + 1) {
          state.castDevicePosition = status.position
          setCastPosition(state.castStreamOffset + status.position, state.playbackState === 'playing')
        }
      }
      const acceptsInactiveStatus = Date.now() >= state.castIgnoreInactiveUntil
      if (status.status === 1 && !state.castPausedByUser) { state.castSeenPlaying = true; state.castIgnoreInactiveUntil = 0; if (state.playbackState !== 'playing') { state.playbackState = 'playing'; state.castPositionStartedAt = Date.now() } setButtonIcon(elements.playPause, 'pause'); renderPlaybackStatus() }
      else if (status.status === 2 && state.castSeenPlaying && !state.castPausedByUser) {
        // Voice wake-up and TTS can report paused for a short period. Wait for
        // the conversation poll before changing the local playback state.
        state.castVoiceRecoveryNeeded = true
        scheduleCastVoiceRecovery(generation)
      }
      else if (status.status === 0 && state.castSeenPlaying && acceptsInactiveStatus && !state.castPausedByUser) {
        if (state.castInactiveCount >= 2 && acceptsInactiveStatus && statusAtEnd) { state.castSeenPlaying = false; state.castInactiveCount = 0; nextTrack(false) }
        else {
          state.castVoiceRecoveryNeeded = true
          scheduleCastVoiceRecovery(generation)
        }
      }
    } catch { /* A temporary status read failure must not interrupt playback. */ }
    finally { state.castStatusReading = false }
  }, 1000)
  state.castProgressTimer = setInterval(() => {
    if (state.output === 'xiaoai' && generation === state.castGeneration && state.current) renderCastProgress()
  }, 250)
  startCastVoicePolling(generation)
}
async function enableXiaoaiOutput() {
  if (!state.xiaoai.loggedIn || !state.xiaoai.selectedDevice) { openXiaoai(); return showToast('请先登录小米账号并选择设备', true) }
  elements.audio.pause(); elements.audio.removeAttribute('src'); state.output = 'xiaoai'; renderXiaoaiState(); if (state.current) await playAt(state.queueIndex, true); else showToast(`后续歌曲将投放到 ${state.xiaoai.selectedDevice.name}`)
}
async function disableXiaoaiOutput() {
  state.castSourceUrl = ''; state.castQueueSources = []; state.castRelayUrls = []
  state.castGeneration++; stopCastStatusPolling(); try { await api.xiaoaiStop() } catch {} state.output = 'local'; state.castUrl = ''; state.castTranscode = false; state.castSeenPlaying = false; state.castPausedByUser = false; state.castSeeking = false; state.castStreamOffset = 0; state.castIgnoreInactiveUntil = 0; state.castIgnoreRemoteTrackUntil = 0; state.castDeviceTrackKey = ''; state.castRelayConnected = false; state.castRelayLostCount = 0; setCastPosition(0, false); state.castDevicePosition = 0; state.playbackState = state.current ? 'paused' : 'idle'; setButtonIcon(elements.playPause, 'play'); renderXiaoaiState(); renderPlaybackStatus(); showToast('已断开小爱投放')
}
function artistNames(value) { return [...new Set(String(value || '').split(/[、，,&；;|/+]/).map(name => name.trim()).filter(Boolean))] }
async function searchArtist(name) {
  if (!name) return
  closeLyrics(); closeDetail(); rememberNavigation({ view: 'search' }); state.detailHistory = []; resetEntityDetailView(); state.view = 'searchEntities'; state.searchType = 'singer'
  const track = state.current ? normalizeTrack(state.current) : null; const actualSource = String(state.playbackInfo?.actualSource || track?.source || '').toLowerCase(); state.searchSource = ['tx', 'wy'].includes(actualSource) ? actualSource : 'tx'
  elements.searchTypes.forEach(button => button.classList.toggle('active', button.dataset.type === 'singer')); elements.searchInput.value = name; updateSearchControls(); setActiveNavigation('data-view', 'search'); showMode('searchEntities'); await search()
}
function openCurrentArtist(anchor, event) {
  event?.stopPropagation(); const track = state.current ? normalizeTrack(state.current) : null; const names = artistNames(track?.artist); if (!names.length) return
  if (names.length === 1) return void searchArtist(names[0])
  elements.playlistMenu.replaceChildren(); names.forEach(name => { const button = document.createElement('button'); button.type = 'button'; button.append(icon('user-round'), name); button.addEventListener('click', () => { elements.playlistMenu.classList.add('hidden'); void searchArtist(name) }); elements.playlistMenu.append(button) }); const rect = anchor.getBoundingClientRect(); elements.playlistMenu.style.left = `${Math.min(rect.left, innerWidth - 220)}px`; elements.playlistMenu.style.top = `${Math.min(rect.bottom + 4, innerHeight - 280)}px`; elements.playlistMenu.classList.remove('hidden'); replaceIcons()
}
function playFromTracks(sourceTrack) { const index = state.tracks.indexOf(sourceTrack); state.queue = state.tracks.slice(); state.queueIndex = Math.max(0, index); saveQueue(); renderQueue(); void playAt(state.queueIndex) }
async function playAt(index, force = false) {
  if (!state.queue.length || (state.resolving && !force)) return; const normalized = ((index % state.queue.length) + state.queue.length) % state.queue.length; state.queueIndex = normalized; state.current = state.queue[normalized]; state.resolving = true; state.playbackState = 'resolving'; const cast = state.output === 'xiaoai'; const requestedQuality = cast ? '320k' : elements.quality.value; state.playbackInfo = { requestedSource: normalizeTrack(state.current).source, actualQuality: requestedQuality }; renderNowPlaying(); renderQueue(); renderTrackList()
  try { const original = state.current; const originalTrack = normalizeTrack(original); const result = await api.resolveTrack({ track: original, quality: requestedQuality, preferOnline: false }); if (state.current !== state.queue[normalized]) return; const originalRaw = rawTrack(original); const originalSource = originalTrack.source; const actualSource = result.local ? (original.downloadSource || originalRaw.downloadSource || result.actualSource || originalSource) : (result.actualSource || originalSource); state.current = { ...original, quality: result.quality || original.quality, source: actualSource, raw: { ...originalRaw, ...(result.track?.raw || result.track || {}) } }; state.playbackInfo = { requestedSource: result.requestedSource || originalSource, actualSource, actualQuality: result.quality || original.quality || requestedQuality, sourceName: result.sourceName || '', local: Boolean(result.local), switched: !result.local && Boolean(originalSource && actualSource && platformLabel(originalSource) !== platformLabel(actualSource)) }; renderNowPlaying(); renderTrackList(); void loadLyrics(state.current)
    if (cast) { elements.audio.pause(); elements.audio.removeAttribute('src'); await startCastPlayback(await buildCastSources(original, result), 0) }
    else { elements.audio.src = result.url; await elements.audio.play(); state.playbackState = 'playing'; setButtonIcon(elements.playPause, 'pause') }
    const id = trackId(original); const previous = state.playStats[id] || {}; state.playStats[id] = { count: Number(previous.count || 0) + 1, lastPlayed: Date.now() }; savePlayStats(); renderPlaybackStatus()
  } catch (error) { state.playbackState = 'error'; state.playbackInfo = { ...state.playbackInfo, error: errorMessage(error) }; renderPlaybackStatus(); showToast(`无法播放：${errorMessage(error)}`, true) } finally { state.resolving = false }
}
async function buildCastSources(currentTrack, currentResult) {
  const current = normalizeTrack(currentTrack)
  const sources = [{
    url: currentResult.url,
    id: trackId(currentTrack),
    audioId: trackId(currentTrack),
    title: current.title,
    artist: current.artist,
    album: current.album,
    transcode: Boolean(currentResult.local && normalizeTrack(currentResult.track || currentTrack).extension !== 'mp3'),
  }]
  return sources
}
function nextTrack(manual = false) { if (!state.queue.length) return; let next = state.queueIndex + 1; if (state.playMode === 'shuffle' && state.queue.length > 1) do next = Math.floor(Math.random() * state.queue.length); while (next === state.queueIndex); else if (!manual && state.playMode === 'one') next = state.queueIndex; void playAt(next, manual) }
function previousTrack() { if (state.output === 'local' && elements.audio.currentTime > 4) { elements.audio.currentTime = 0; return } void playAt(state.queueIndex - 1) }
async function stopCurrentTrack() {
  if (!state.current) return
  try {
    if (state.output === 'xiaoai') { await api.xiaoaiStop(); state.castGeneration++; stopCastStatusPolling(); state.castPausedByUser = true; state.castSeenPlaying = false; state.castSeeking = false; state.castStreamOffset = 0; state.castIgnoreInactiveUntil = 0; state.castIgnoreRemoteTrackUntil = 0; state.castDeviceTrackKey = ''; state.castRelayConnected = false; state.castRelayLostCount = 0; setCastPosition(0, false); state.castDevicePosition = 0 }
    else { elements.audio.pause(); elements.audio.currentTime = 0 }
    state.playbackState = 'paused'; elements.progress.value = 0; elements.elapsed.textContent = '0:00'; setButtonIcon(elements.playPause, 'play'); renderPlaybackStatus()
  } catch (error) { showToast(errorMessage(error), true) }
}
function renderNowPlaying() {
  const track = state.current ? normalizeTrack(state.current) : null
  elements.nowTitle.textContent = track?.title || '尚未播放'; elements.nowArtist.textContent = track?.artist || '选择一首歌曲开始播放'; elements.nowArtist.disabled = !track?.artist; renderCover(elements.nowCover, track?.artworkUrl, 'now'); elements.nowCover.disabled = !track; elements.favoriteCurrent.disabled = !track
  elements.lyricsTitle.textContent = track?.title || '尚未播放'; elements.lyricsArtist.textContent = track?.artist || '-'; elements.lyricsArtist.disabled = !track?.artist; renderCover(elements.lyricsCover, track?.artworkUrl, 'lyrics'); elements.lyricsBackdrop.style.backgroundImage = track?.artworkUrl ? `url(${JSON.stringify(track.artworkUrl)})` : ''
  renderCurrentFavorite(); renderPlaybackStatus(); updateCoverIndicators(); replaceIcons()
}
function renderCurrentFavorite() { const loved = state.current && isFavorite(state.current); elements.favoriteCurrent.classList.toggle('active', Boolean(loved)); elements.favoriteCurrent.title = loved ? '取消收藏' : '收藏' }
async function toggleFavorite(track) {
  const existingId = favoriteTrackId(track, state.loveIndex); const loved = Boolean(existingId)
  try {
    if (loved) await api.removeFromPlaylist('love', existingId)
    else await api.addToPlaylist('love', playlistTrack(track))
    await refreshPlaylists()
    if (state.view === 'playlist' && state.playlistId === 'love') await openPlaylist('love')
    else { renderTrackList(); renderCurrentFavorite() }
    showToast(loved ? '已取消收藏' : '已收藏')
  } catch (error) { showToast(errorMessage(error), true) }
}
function showPlaylistMenu(anchor, track) { elements.playlistMenu.replaceChildren(); const playlists = state.playlists.filter(item => !['default', 'love'].includes(item.id)); if (!playlists.length) { const empty = document.createElement('button'); empty.type = 'button'; empty.textContent = '请先创建歌单'; empty.disabled = true; elements.playlistMenu.append(empty) } playlists.forEach(playlist => { const button = document.createElement('button'); button.type = 'button'; button.append(icon('list-music'), playlist.name); button.addEventListener('click', async () => { elements.playlistMenu.classList.add('hidden'); try { await api.addToPlaylist(playlist.id, playlistTrack(track)); await refreshPlaylists(); showToast(`已加入“${playlist.name}”`) } catch (error) { showToast(errorMessage(error), true) } }); elements.playlistMenu.append(button) }); const rect = anchor.getBoundingClientRect(); elements.playlistMenu.style.left = `${Math.min(rect.left, innerWidth - 220)}px`; elements.playlistMenu.style.top = `${Math.min(rect.bottom + 4, innerHeight - 280)}px`; elements.playlistMenu.classList.remove('hidden'); replaceIcons() }
async function removeFromCurrentPlaylist(track) { try { await api.removeFromPlaylist(state.playlistId, trackId(track)); await openPlaylist(state.playlistId); await refreshPlaylists(); showToast('已从歌单移除') } catch (error) { showToast(errorMessage(error), true) } }
async function downloadTrack(track) { const normalized = normalizeTrack(track); const id = trackId(track); state.downloads.set(id, 'downloading'); updateDownloadRecord({ id, status: 'downloading', title: normalized.title, artist: normalized.artist, album: normalized.album, quality: elements.quality.value, source: normalized.source, received: 0, total: 0 }); renderTrackList(); try { const result = await api.downloadTrack(track, elements.quality.value); if (result?.cancelled) { state.downloads.delete(id); state.downloadHistory = state.downloadHistory.filter(item => item.id !== id); saveDownloadHistory(); renderTrackList(); return } showToast(`已下载到 Windows：${result.path}`); state.downloads.delete(id); renderTrackList() } catch (error) { state.downloads.delete(id); updateDownloadRecord({ id, status: 'failed', title: normalized.title, artist: normalized.artist, album: normalized.album, quality: elements.quality.value, source: normalized.source, error: errorMessage(error) }); renderTrackList(); showToast(`下载失败：${errorMessage(error)}`, true) } }
function renderQueue() { elements.queueList.replaceChildren(); elements.queueCount.textContent = `${state.queue.length} 首`; state.queue.forEach((item, index) => { const row = document.createElement('div'); row.className = `queue-item${index === state.queueIndex ? ' playing' : ''}`; const track = normalizeTrack(item); const cover = document.createElement('div'); cover.className = 'queue-cover'; renderCover(cover, track.artworkUrl); const copy = document.createElement('div'); copy.className = 'queue-item-copy'; copy.append(Object.assign(document.createElement('strong'), { textContent: track.title }), Object.assign(document.createElement('span'), { textContent: track.artist })); copy.addEventListener('dblclick', () => void playAt(index)); const remove = makeIconButton('x', '移出队列'); remove.addEventListener('click', () => { state.queue.splice(index, 1); if (index < state.queueIndex) state.queueIndex--; else if (index === state.queueIndex && state.queue.length) { state.queueIndex = Math.min(index, state.queue.length - 1); void playAt(state.queueIndex) } else if (!state.queue.length) stopPlayback(); saveQueue(); renderQueue() }); row.append(cover, copy, remove); elements.queueList.append(row) }); saveQueue(); replaceIcons() }
  function stopPlayback() { if (state.output === 'xiaoai') void api.xiaoaiStop().catch(() => {}); stopCastStatusPolling(); elements.audio.pause(); elements.audio.removeAttribute('src'); state.current = null; state.queueIndex = -1; state.playbackState = 'idle'; state.playbackInfo = null; state.castUrl = ''; state.castTranscode = false; state.castSeenPlaying = false; state.castPausedByUser = false; state.castSeeking = false; state.castStreamOffset = 0; state.castIgnoreInactiveUntil = 0; state.castIgnoreRemoteTrackUntil = 0; state.castDeviceTrackKey = ''; state.castRelayConnected = false; state.castRelayLostCount = 0; setCastPosition(0, false); state.castDevicePosition = 0; renderNowPlaying(); renderTrackList(); elements.progress.value = 0; elements.elapsed.textContent = '0:00'; elements.duration.textContent = '0:00' }
function closeDetail() { elements.detail.classList.remove('open'); elements.detail.setAttribute('aria-hidden', 'true') }
function toggleQueue() { if (elements.detail.classList.contains('open')) closeDetail(); else { elements.detail.classList.add('open'); elements.detail.setAttribute('aria-hidden', 'false') } }
function updateCoverIndicators() {
  const open = !elements.lyricsView.classList.contains('hidden')
  for (const [cover, name, title] of [[elements.nowCover, open ? 'minimize-2' : 'maximize-2', open ? '收起歌词' : '展开歌词'], [elements.lyricsCover, 'minimize-2', '收起歌词']]) {
    let indicator = cover.querySelector('.cover-indicator'); if (!indicator) { indicator = document.createElement('span'); indicator.className = 'cover-indicator'; cover.append(indicator) }
    indicator.replaceChildren(icon(name)); cover.title = title; cover.setAttribute('aria-label', title)
  }
  replaceIcons()
}
function openLyrics() { if (!state.current) return; closeDetail(); elements.lyricsView.classList.remove('hidden'); elements.lyricsView.setAttribute('aria-hidden', 'false'); updateCoverIndicators(); syncLyrics(elements.audio.currentTime) }
function closeLyrics() { elements.lyricsView.classList.add('hidden'); elements.lyricsView.setAttribute('aria-hidden', 'true'); updateCoverIndicators() }
function toggleLyrics() { if (elements.lyricsView.classList.contains('hidden')) openLyrics(); else closeLyrics() }
function askText(title, initialValue = '') {
  return new Promise(resolve => {
    if (elements.textDialog.open) elements.textDialog.close('cancel')
    elements.textDialogTitle.textContent = title; elements.textDialogInput.value = initialValue; elements.textDialog.returnValue = 'cancel'
    elements.textDialog.addEventListener('close', () => resolve(elements.textDialog.returnValue === 'confirm' ? elements.textDialogInput.value.trim() : null), { once: true })
    elements.textDialog.showModal(); requestAnimationFrame(() => { elements.textDialogInput.focus(); elements.textDialogInput.select() })
  })
}
function parseLyrics(value) {
  const timed = []; const plain = []
  for (const sourceLine of String(value || '').split(/\r?\n/)) {
    const text = sourceLine.replace(/(?:\[[^\]]+\])+\s*/g, '').trim(); if (!text) continue
    const timestamps = [...sourceLine.matchAll(/\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g)]
    if (!timestamps.length) plain.push({ time: null, text })
    else timestamps.forEach(match => timed.push({ time: Number(match[1]) * 60 + Number(match[2]), text }))
  }
  return timed.length ? timed.sort((a, b) => a.time - b.time) : plain
}
function renderLyrics(lines, status = '') {
  state.lyrics = lines; state.activeLyricIndex = -1; elements.lyricsContent.replaceChildren()
  if (!lines.length) { elements.lyricsContent.append(Object.assign(document.createElement('p'), { className: 'lyric-line', textContent: status || '暂无歌词' })); return }
  lines.forEach(line => {
    const item = Object.assign(document.createElement('p'), { className: 'lyric-line', textContent: line.text })
    if (line.time !== null) { item.dataset.time = String(line.time); item.tabIndex = 0; item.setAttribute('role', 'button'); item.addEventListener('click', () => { if (state.output === 'xiaoai') void seekCastTo(line.time).catch(error => showToast(errorMessage(error), true)); else { elements.audio.currentTime = line.time; syncLyrics(line.time) } }); item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.click() } }) }
    elements.lyricsContent.append(item)
  })
}
function syncLyrics(currentTime) {
  if (!state.lyrics.length || state.lyrics[0].time === null) return
  let active = -1
  for (let index = 0; index < state.lyrics.length; index++) { if (state.lyrics[index].time > currentTime + 0.15) break; active = index }
  if (active === state.activeLyricIndex) return
  state.activeLyricIndex = active; const lines = elements.lyricsContent.querySelectorAll('.lyric-line'); lines.forEach((line, index) => line.classList.toggle('active', index === active))
  if (active >= 0 && !elements.lyricsView.classList.contains('hidden')) {
    const line = lines[active]; const contentRect = elements.lyricsContent.getBoundingClientRect(); const lineRect = line?.getBoundingClientRect()
    if (lineRect) elements.lyricsContent.scrollTo({ top: elements.lyricsContent.scrollTop + lineRect.top - contentRect.top - (elements.lyricsContent.clientHeight - lineRect.height) / 2, behavior: 'smooth' })
  }
}
async function loadLyrics(track) {
  const requestId = ++state.lyricsRequestId; renderLyrics([], '正在读取歌词...')
  try { const value = await api.getLyrics(trackForLyrics(track)); if (requestId !== state.lyricsRequestId) return; renderLyrics(parseLyrics(readLyricsContent(value))); syncLyrics(elements.audio.currentTime) } catch { if (requestId === state.lyricsRequestId) renderLyrics([]) }
}
function handleDownloadProgress(value) { if (!value) return; updateDownloadRecord(value); if (state.view === 'downloads') renderDownloads(); if (value.status === 'downloading' && value.total) showToast(`正在下载 ${value.title}：${Math.round(value.received / value.total * 100)}%`); else if (value.status === 'downloading') showToast(`正在下载 ${value.title}：已接收 ${Math.round(value.received / 1024 / 1024 * 10) / 10} MB`); else if (value.status === 'completed') showToast(`下载完成：${value.path}`) }

elements.searchForm.addEventListener('submit', event => { event.preventDefault(); void search() })
elements.searchTypes.forEach(button => button.addEventListener('click', () => { state.searchType = button.dataset.type; elements.searchTypes.forEach(item => item.classList.toggle('active', item === button)); updateSearchControls(); if (elements.searchInput.value.trim()) void search() }))
elements.sourceTabs.forEach(button => button.addEventListener('click', () => { state.searchSource = button.dataset.source; elements.sourceTabs.forEach(item => item.classList.toggle('active', item === button)); if (elements.searchInput.value.trim()) void search() }))
document.querySelector('[data-view="search"]').addEventListener('click', openSearch); document.querySelector('[data-view="leaderboards"]').addEventListener('click', () => void openLeaderboards()); document.querySelector('[data-view="songs"]').addEventListener('click', () => void openSongs()); document.querySelector('[data-view="artists"]').addEventListener('click', () => void openLibrary('artists')); document.querySelector('[data-view="albums"]').addEventListener('click', () => void openLibrary('albums')); document.querySelector('[data-view="downloads"]').addEventListener('click', openDownloads); document.querySelector('[data-view="xiaoai"]').addEventListener('click', openXiaoai); document.querySelector('[data-playlist="love"]').addEventListener('click', () => void openPlaylist('love')); document.querySelector('[data-view="about"]').addEventListener('click', openAbout)
elements.syncCenter.addEventListener('click', () => api.openSyncCenter()); elements.libraryRefresh.addEventListener('click', () => void openLibrary(state.libraryType)); elements.leaderboardSource.addEventListener('change', () => { state.boardSource = elements.leaderboardSource.value; void loadBoards() })
elements.librarySort.addEventListener('change', async () => { if (state.libraryType === 'artists') state.artistFilter = elements.librarySort.value; else state.librarySort = elements.librarySort.value; if (state.libraryType === 'albums' && state.librarySort === 'released') await resolveAlbumReleaseDates(localEntities('albums')); renderLibrary(state.libraryType) })
elements.navBack.addEventListener('click', goBack)
elements.createPlaylist.addEventListener('click', async () => { const name = await askText('新建歌单'); if (!name) return; try { const created = await api.createPlaylist(name); await refreshPlaylists(); await openPlaylist(created.id) } catch (error) { showToast(errorMessage(error), true) } })
elements.renamePlaylist.addEventListener('click', async () => { const current = state.playlists.find(item => item.id === state.playlistId); const name = await askText('编辑歌单名称', current?.name || ''); if (!name || name === current?.name) return; try { await api.renamePlaylist(state.playlistId, name); await refreshPlaylists(); await openPlaylist(state.playlistId); showToast('歌单已重命名') } catch (error) { showToast(errorMessage(error), true) } })
elements.deletePlaylist.addEventListener('click', async () => { const current = state.playlists.find(item => item.id === state.playlistId); if (!current || !window.confirm(`删除歌单“${current.name}”？`)) return; try { await api.deletePlaylist(current.id); await refreshPlaylists(); await openPlaylist('love'); showToast('歌单已删除') } catch (error) { showToast(errorMessage(error), true) } })
elements.trackSort.addEventListener('change', () => { state.trackSort = elements.trackSort.value; applyTrackSort(); renderTrackList() }); elements.trackSelect.addEventListener('click', toggleSelectionMode); elements.playlistSelect.addEventListener('click', toggleSelectionMode); elements.entitySelect.addEventListener('click', toggleSelectionMode)
elements.entityTabButtons.forEach(button => button.addEventListener('click', () => renderEntityTab(button.dataset.entityTab)))
elements.playAll.addEventListener('click', () => playCollection(false)); elements.shuffleAll.addEventListener('click', () => playCollection(true)); elements.entityPlayAll.addEventListener('click', () => playCollection(false)); elements.entityShuffle.addEventListener('click', () => playCollection(true)); elements.favoriteCurrent.addEventListener('click', () => { if (state.current) void toggleFavorite(state.current) }); elements.playPause.addEventListener('click', async () => {
  if (!state.current && state.queue.length) return void playAt(Math.max(0, state.queueIndex)); if (!state.current && state.tracks.length) return playFromTracks(state.tracks[0])
  if (state.output === 'local') {
    if (elements.audio.paused) {
      try {
        await elements.audio.play()
        if (state.current && state.output === 'local' && !elements.audio.paused) {
          state.playbackState = 'playing'
          setButtonIcon(elements.playPause, 'pause')
          renderPlaybackStatus()
        }
      } catch (error) { showToast(errorMessage(error), true) }
    } else {
      elements.audio.pause()
      if (state.current) {
        state.playbackState = 'paused'
        setButtonIcon(elements.playPause, 'play')
        renderPlaybackStatus()
      }
    }
    return
  }
  try {
    if (state.playbackState === 'playing') {
      const position = currentCastPosition(); state.castPausedByUser = true; setCastPosition(position, false); state.playbackState = 'paused'; setButtonIcon(elements.playPause, 'play'); renderCastProgress(); renderPlaybackStatus()
      try { await api.xiaoaiPause() } catch (error) { state.castPausedByUser = false; state.playbackState = 'playing'; state.castPositionStartedAt = Date.now(); setButtonIcon(elements.playPause, 'pause'); renderPlaybackStatus(); throw error }
    }
    else if (!state.castUrl) await playAt(state.queueIndex, true)
    else { await resumeCastPlayback() }
    renderPlaybackStatus()
  } catch (error) { showToast(errorMessage(error), true) }
}); elements.previous.addEventListener('click', previousTrack); elements.stop.addEventListener('click', () => void stopCurrentTrack()); elements.next.addEventListener('click', () => nextTrack(true))
elements.entityFavorite.addEventListener('click', () => { const target = entityFavoriteItem(state.entityDetail); if (target) void toggleEntityFavorite(state.entityDetail.kind === 'singer' ? 'artists' : 'albums', target) })
elements.heroPlayAll.addEventListener('click', () => playCollection(false)); elements.heroShuffle.addEventListener('click', () => playCollection(true))
elements.playMode.addEventListener('click', () => { state.playMode = state.playMode === 'list' ? 'one' : state.playMode === 'one' ? 'shuffle' : 'list'; localStorage.setItem('yinyun-player-mode', state.playMode); renderPlayMode() }); elements.queueToggle.addEventListener('click', toggleQueue); elements.closeDetail.addEventListener('click', closeDetail); elements.nowCover.addEventListener('click', toggleLyrics); elements.nowArtist.addEventListener('click', event => openCurrentArtist(elements.nowArtist, event)); elements.lyricsArtist.addEventListener('click', event => openCurrentArtist(elements.lyricsArtist, event)); elements.lyricsCover.addEventListener('click', closeLyrics); elements.closeLyrics.addEventListener('click', closeLyrics); elements.textDialogCancel.addEventListener('click', () => elements.textDialog.close('cancel')); elements.clearQueue.addEventListener('click', () => { state.queue = []; stopPlayback(); renderQueue() })
elements.volume.addEventListener('input', () => { if (state.output === 'local') elements.audio.volume = Number(elements.volume.value) / 100 }); elements.volume.addEventListener('change', async () => { try { if (state.output === 'xiaoai') await api.setXiaoaiVolume(Number(elements.volume.value)); else await api.savePreferences({ volume: elements.audio.volume }) } catch (error) { showToast(errorMessage(error), true) } }); elements.quality.addEventListener('change', () => api.savePreferences({ playbackQuality: elements.quality.value })); elements.progress.addEventListener('input', () => { if (state.output === 'local' && Number.isFinite(elements.audio.duration)) { elements.audio.currentTime = Number(elements.progress.value) / 1000 * elements.audio.duration } else if (state.output === 'xiaoai' && state.current) { state.castSeeking = true; setCastPosition(Number(elements.progress.value) / 1000 * castDuration(), false); renderCastProgress() } }); elements.progress.addEventListener('change', () => { if (state.output !== 'xiaoai' || !state.current) return; const position = currentCastPosition(); state.castSeeking = false; void seekCastTo(position).catch(error => { renderPlaybackStatus(); showToast(errorMessage(error), true) }) }); elements.audio.addEventListener('timeupdate', () => { if (state.output !== 'local') return; const duration = elements.audio.duration || 0; elements.progress.value = duration ? String(Math.round(elements.audio.currentTime / duration * 1000)) : '0'; elements.elapsed.textContent = formatTime(elements.audio.currentTime); elements.duration.textContent = formatTime(duration); syncLyrics(elements.audio.currentTime) }); elements.audio.addEventListener('play', () => { if (state.output !== 'local') return; setButtonIcon(elements.playPause, 'pause'); if (state.playbackState !== 'resolving') { state.playbackState = 'playing'; renderPlaybackStatus() } }); elements.audio.addEventListener('playing', () => { if (state.output !== 'local') return; state.playbackState = 'playing'; renderPlaybackStatus() }); elements.audio.addEventListener('waiting', () => { if (state.output !== 'local' || !state.current || state.playbackState === 'resolving') return; state.playbackState = 'buffering'; renderPlaybackStatus() }); elements.audio.addEventListener('pause', () => { if (state.output !== 'local') return; if (state.current && !['error', 'resolving'].includes(state.playbackState)) state.playbackState = 'paused'; setButtonIcon(elements.playPause, 'play'); renderPlaybackStatus() }); elements.audio.addEventListener('ended', () => { if (state.output === 'local') nextTrack(false) }); elements.audio.addEventListener('error', () => { if (state.output !== 'local' || !elements.audio.src) return; state.playbackState = 'error'; state.playbackInfo = { ...state.playbackInfo, error: '当前歌曲播放失败' }; renderPlaybackStatus(); showToast('当前歌曲播放失败', true) }); document.addEventListener('click', event => { if (!elements.playlistMenu.contains(event.target)) elements.playlistMenu.classList.add('hidden') }); document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeLyrics(); closeDetail(); return } if (event.code !== 'Space' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return; event.preventDefault(); elements.playPause.click() })
elements.castToggle.addEventListener('click', () => void (state.output === 'xiaoai' ? disableXiaoaiOutput() : enableXiaoaiOutput()))
elements.xiaoaiLogin.addEventListener('click', () => void startXiaoaiLogin()); elements.xiaoaiRefresh.addEventListener('click', () => void loadXiaoaiDevices()); elements.xiaoaiUseDevice.addEventListener('click', async () => { try { if (state.output === 'xiaoai') await disableXiaoaiOutput(); await selectXiaoaiDevice(); await enableXiaoaiOutput() } catch (error) { showToast(errorMessage(error), true) } }); elements.xiaoaiLogout.addEventListener('click', async () => { try { state.xiaoaiPollToken++; if (state.output === 'xiaoai') await disableXiaoaiOutput(); state.xiaoai = await api.logoutXiaoai(); state.xiaoaiDevices = []; elements.xiaoaiQrWrap.classList.add('hidden'); renderXiaoaiState(); showToast('已退出小米账号') } catch (error) { showToast(errorMessage(error), true) } })
elements.downloadDirectory.addEventListener('click', async () => { try { const result = await api.chooseDownloadDirectory(); if (!result?.success) return; state.app.config.downloadDirectory = result.directory; elements.aboutDownloadDirectory.textContent = result.directory; showToast(`下载目录已设置：${result.directory}`) } catch (error) { showToast(errorMessage(error), true) } })
elements.openDownloadDirectory.addEventListener('click', () => elements.downloadDirectory.click())
function renderAppState(value) {
  state.app = value; if (value.xiaoai) state.xiaoai = value.xiaoai; const connected = Boolean(value.account); elements.accountName.textContent = connected ? value.account.username : '连接已断开'; elements.connectionDot.classList.toggle('offline', !connected)
  elements.aboutVersion.textContent = `v${value.appVersion}`; elements.aboutAccount.textContent = value.account?.username || '-'; elements.aboutServer.textContent = value.account?.serverUrl || '-'; elements.aboutDownloadDirectory.textContent = value.config.downloadDirectory || '首次下载时选择'
  const update = value.availableUpdate; elements.aboutUpdate.classList.toggle('hidden', !update); elements.aboutUpdate.textContent = update ? `有新版本 v${update.version}` : ''; elements.aboutUpdate.dataset.url = update?.url || ''
  renderXiaoaiState()
}
elements.aboutUpdate.addEventListener('click', () => { const url = elements.aboutUpdate.dataset.url; if (url) api.openExternal(url) })
api.onDownloadProgress(handleDownloadProgress); api.onState(renderAppState)

async function initialize() {
  replaceIcons(); renderPlayMode(); renderQueue(); updateSearchControls()
  try { renderAppState(await api.getState()); elements.quality.value = state.app.config.playbackQuality || 'flac'; elements.audio.volume = state.app.config.volume ?? 0.8; elements.volume.value = String(Math.round(elements.audio.volume * 100)); await refreshPlaylists(); await refreshLibraries(); state.restoringNavigation = true; await openPlaylist('love'); state.restoringNavigation = false; state.navigation = []; elements.navBack.disabled = true } catch (error) { state.restoringNavigation = false; showToast(errorMessage(error), true) }
}
void initialize()
