'use strict'

const api = window.yinyunClient
const { createFavoriteIndex, favoriteTrackId, rawTrack, trackId } = window.yinyunTrackIdentity
const byId = id => document.getElementById(id)
const elements = {
  playlistNav: byId('playlist-nav'), createPlaylist: byId('create-playlist'),
  title: byId('view-title'), subtitle: byId('view-subtitle'), playlistActions: byId('playlist-actions'),
  renamePlaylist: byId('rename-playlist'), deletePlaylist: byId('delete-playlist'),
  searchView: byId('search-view'), searchForm: byId('search-form'), searchInput: byId('search-input'),
  searchTypes: [...document.querySelectorAll('.search-type')], sourceTabs: [...document.querySelectorAll('.source-tab')],
  leaderboardView: byId('leaderboards-view'), leaderboardSource: byId('leaderboard-source'), leaderboardStatus: byId('leaderboard-status'), leaderboardList: byId('leaderboard-list'),
  libraryView: byId('library-view'), libraryLabel: byId('library-kind-label'), libraryRefresh: byId('library-refresh'), entityList: byId('entity-list'),
  tracksView: byId('tracks-view'), tracksToolbar: byId('tracks-toolbar'), playAll: byId('play-all'), trackList: byId('track-list'),
  entityDetailSummary: byId('entity-detail-summary'), entityDetailBack: byId('entity-detail-back'), entityDetailCover: byId('entity-detail-cover'), entityDetailName: byId('entity-detail-name'), entityDetailMeta: byId('entity-detail-meta'), entityDetailDescription: byId('entity-detail-description'),
  relatedAlbums: byId('related-albums'), relatedAlbumCount: byId('related-album-count'), relatedAlbumList: byId('related-album-list'),
  empty: byId('empty-state'), loading: byId('loading-state'), about: byId('about-view'),
  accountName: byId('account-name'), connectionDot: byId('connection-dot'), syncCenter: byId('sync-center'),
  aboutVersion: byId('about-version'), aboutUpdate: byId('about-update'), aboutAccount: byId('about-account'), aboutServer: byId('about-server'), aboutDownloadDirectory: byId('about-download-directory'),
  audio: byId('audio'), nowCover: byId('now-cover'), nowTitle: byId('now-title'), nowArtist: byId('now-artist'), favoriteCurrent: byId('favorite-current'),
  previous: byId('previous'), playPause: byId('play-pause'), next: byId('next'), playMode: byId('play-mode'), progress: byId('progress'), elapsed: byId('elapsed'), duration: byId('duration'), volume: byId('volume'), quality: byId('quality'), downloadDirectory: byId('download-directory'), queueToggle: byId('queue-toggle'),
  detail: byId('detail-panel'), closeDetail: byId('close-detail'), queueCount: byId('queue-count'), clearQueue: byId('clear-queue'), queueList: byId('queue-list'),
  lyricsView: byId('lyrics-view'), closeLyrics: byId('close-lyrics'), lyricsBackdrop: byId('lyrics-backdrop'), lyricsCover: byId('lyrics-cover'), lyricsTitle: byId('lyrics-title'), lyricsArtist: byId('lyrics-artist'), lyricsContent: byId('lyrics-content'),
  playlistMenu: byId('playlist-menu'), toast: byId('toast'),
}

const state = {
  app: null, view: 'playlist', playlistId: 'love', playlists: [], tracks: [], entities: [],
  queue: readQueue(), queueIndex: -1, current: null, searchSource: 'tx', searchType: 'song',
  loading: false, playMode: localStorage.getItem('yinyun-player-mode') || 'list', loveIndex: new Map(),
  libraries: { artists: [], albums: [] }, libraryType: 'artists', boardSource: 'tx', boards: [],
  resolving: false, toastTimer: null, downloads: new Map(), boardId: null, entityDetail: null, detailHistory: [],
  lyrics: [], activeLyricIndex: -1, lyricsRequestId: 0,
}

function readQueue() {
  try {
    const value = JSON.parse(localStorage.getItem('yinyun-player-queue') || '[]')
    return Array.isArray(value) ? value.slice(0, 1000) : []
  } catch { return [] }
}
function saveQueue() { localStorage.setItem('yinyun-player-queue', JSON.stringify(state.queue)) }
function playlistTrack(value) { return { ...rawTrack(value), id: trackId(value) } }
function normalizeTrack(value) {
  const raw = rawTrack(value) || {}
  return {
    id: String(value?.id || raw.id || raw.songmid || raw.hash || ''),
    title: String(value?.title || raw.name || '未知歌曲'), artist: String(value?.artist || raw.singer || '未知歌手'),
    album: String(value?.album || raw.albumName || raw.album || raw.meta?.albumName || ''), source: String(value?.source || raw.source || 'unknown'),
    duration: value?.duration ?? raw.interval ?? raw.meta?.interval ?? 0, artworkUrl: value?.artworkUrl || raw.img || raw.picUrl || raw.meta?.picUrl || raw.album?.picUrl || '', raw,
  }
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
function icon(name) { const item = document.createElement('i'); item.dataset.lucide = name; return item }
function replaceIcons() { window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } }) }
function setButtonIcon(button, name) { button.replaceChildren(icon(name)); replaceIcons() }
function errorMessage(error) { return error?.message || String(error || '操作失败') }
function showToast(message, error = false) {
  clearTimeout(state.toastTimer); elements.toast.textContent = message; elements.toast.className = `toast${error ? ' error' : ''}`
  state.toastTimer = setTimeout(() => elements.toast.classList.add('hidden'), error ? 5000 : 3000)
}
function setLoading(value) {
  state.loading = value; elements.loading.classList.toggle('hidden', !value); elements.trackList.classList.toggle('hidden', value)
  if (value) elements.empty.classList.add('hidden')
}
function setActiveNavigation(attribute, value) {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'))
  const item = document.querySelector(`[${attribute}="${CSS.escape(value)}"]`); if (item) item.classList.add('active')
}
function showMode(mode) {
  elements.searchView.classList.toggle('hidden', !['search', 'searchEntities'].includes(mode)); elements.leaderboardView.classList.toggle('hidden', mode !== 'leaderboards')
  elements.libraryView.classList.toggle('hidden', !['artists', 'albums', 'searchEntities'].includes(mode)); elements.tracksView.classList.toggle('hidden', !['playlist', 'search', 'leaderboardTracks', 'artistDetail', 'albumDetail'].includes(mode)); elements.about.classList.toggle('hidden', mode !== 'about')
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
function makeIconButton(name, title) { const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button subtle'; button.title = title; button.setAttribute('aria-label', title); button.append(icon(name)); return button }
function renderCover(parent, url, size = 'small') {
  if (size === 'entity') parent.classList.add('entity-cover')
  else if (size === 'small') parent.classList.add('track-cover')
  parent.replaceChildren()
  if (!url) return parent.append(icon('music-2'))
  const image = document.createElement('img'); image.src = url; image.alt = ''; image.addEventListener('error', () => parent.replaceChildren(icon('music-2')), { once: true }); parent.append(image)
}
function resetEntityDetailView() {
  elements.entityDetailSummary.classList.add('hidden'); elements.relatedAlbums.classList.add('hidden'); elements.relatedAlbumList.replaceChildren(); state.entityDetail = null
}
function renderTrackList() {
  elements.trackList.replaceChildren()
  state.tracks.forEach(sourceTrack => {
    const track = normalizeTrack(sourceTrack); const row = document.createElement('div'); row.className = `track-row${state.current && trackId(state.current) === trackId(track) ? ' playing' : ''}`
    row.addEventListener('dblclick', event => { if (!event.target.closest('button')) playFromTracks(sourceTrack) })
    const main = document.createElement('div'); main.className = 'track-main'; main.title = '双击播放'; const cover = document.createElement('div'); renderCover(cover, track.artworkUrl); const copy = document.createElement('div'); copy.className = 'track-copy'; copy.append(Object.assign(document.createElement('strong'), { textContent: track.title }), Object.assign(document.createElement('span'), { textContent: track.artist })); main.append(cover, copy)
    const loved = isFavorite(sourceTrack); const actions = document.createElement('div'); actions.className = 'track-actions'; const play = makeIconButton('play', '播放'); const favorite = makeIconButton('heart', loved ? '取消收藏' : '收藏'); favorite.classList.toggle('active', loved); const download = makeIconButton(state.downloads.has(trackId(track)) ? 'loader-circle' : 'download', state.downloads.has(trackId(track)) ? '正在下载' : '下载到 Windows'); download.classList.toggle('download-active', state.downloads.has(trackId(track))); download.disabled = state.downloads.has(trackId(track)); const add = makeIconButton('list-plus', '加入歌单')
    play.addEventListener('click', () => playFromTracks(sourceTrack)); favorite.addEventListener('click', () => void toggleFavorite(sourceTrack)); download.addEventListener('click', () => void downloadTrack(sourceTrack)); add.addEventListener('click', event => showPlaylistMenu(event.currentTarget, sourceTrack)); actions.append(play, favorite, download, add)
    if (state.view === 'playlist' && !['love'].includes(state.playlistId)) { const remove = makeIconButton('x', '从歌单移除'); remove.addEventListener('click', () => void removeFromCurrentPlaylist(sourceTrack)); actions.append(remove) }
    row.append(main, Object.assign(document.createElement('span'), { className: 'track-album', textContent: track.album || '-' }), Object.assign(document.createElement('span'), { className: 'track-source', textContent: track.source.toUpperCase() }), Object.assign(document.createElement('span'), { className: 'track-duration', textContent: formatTime(track.duration) }), actions); elements.trackList.append(row)
  })
  elements.empty.classList.toggle('hidden', state.tracks.length > 0 || state.loading); elements.tracksToolbar.classList.toggle('hidden', state.tracks.length === 0); replaceIcons()
}
async function openPlaylist(id) {
  state.detailHistory = []; resetEntityDetailView(); state.view = 'playlist'; state.playlistId = id; state.boardId = null; setActiveNavigation('data-playlist', id); showMode('playlist'); elements.playlistActions.classList.toggle('hidden', ['love', 'default'].includes(id)); const summary = state.playlists.find(item => item.id === id); elements.title.textContent = summary?.name || (id === 'love' ? '我喜欢的音乐' : '歌单'); setLoading(true)
  try { const playlist = await api.getPlaylist(id); state.tracks = playlist.items || []; elements.title.textContent = playlist.name; elements.subtitle.textContent = `${state.tracks.length} 首歌曲`; if (id === 'love') setFavoriteTracks(state.tracks); renderTrackList() } catch (error) { showToast(errorMessage(error), true) } finally { setLoading(false) }
}
function openSearch() {
  state.detailHistory = []; resetEntityDetailView(); state.view = 'search'; state.playlistId = ''; state.tracks = []; state.entities = []; setActiveNavigation('data-view', 'search'); showMode('search'); elements.playlistActions.classList.add('hidden'); elements.title.textContent = '搜索'; elements.subtitle.textContent = '搜索在线曲库'; elements.trackList.replaceChildren(); elements.entityList.replaceChildren(); elements.empty.classList.remove('hidden'); elements.searchInput.focus()
}
async function search() {
  const query = elements.searchInput.value.trim(); if (!query) return elements.searchInput.focus(); setLoading(true)
  if (state.searchType === 'song') {
    resetEntityDetailView(); state.view = 'search'; showMode('search')
    try { const result = await api.search({ query, source: state.searchSource, page: 1, limit: 50 }); state.tracks = result.items || []; elements.subtitle.textContent = `${state.searchSource.toUpperCase()} · ${state.tracks.length} 首结果`; renderTrackList() } catch (error) { showToast(errorMessage(error), true) } finally { setLoading(false) }
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
  elements.entityList.replaceChildren(); elements.libraryRefresh.classList.add('hidden'); elements.trackList.classList.add('hidden'); elements.empty.classList.add('hidden')
  items.forEach(item => {
    const row = document.createElement('article'); row.className = 'entity-row'; bindEntityOpen(row, item); const cover = document.createElement('div'); renderCover(cover, item.artworkUrl, 'entity'); const info = document.createElement('div'); info.className = 'entity-copy'; info.append(Object.assign(document.createElement('strong'), { textContent: item.name }), Object.assign(document.createElement('span'), { textContent: entitySubtitle(item) })); const actions = document.createElement('div'); actions.className = 'entity-actions'; const favorite = makeIconButton('heart', isEntityLoved(kind, item) ? '取消收藏' : '收藏'); favorite.classList.toggle('active', isEntityLoved(kind, item)); favorite.addEventListener('click', () => void toggleEntityFavorite(kind === 'singer' ? 'artists' : 'albums', item)); const open = makeIconButton('chevron-right', '查看详情'); open.addEventListener('click', () => void openEntityDetail(item)); actions.append(favorite, open); row.append(cover, info, actions); elements.entityList.append(row)
  }); if (!items.length) elements.entityList.append(createEntityEmpty('没有找到匹配结果')); elements.libraryLabel.textContent = `搜索结果 · ${items.length} 个`; elements.entityList.classList.remove('hidden'); replaceIcons()
}
function createEntityEmpty(message, iconName = 'search-x') { const empty = document.createElement('div'); empty.className = 'entity-empty'; empty.append(icon(iconName), Object.assign(document.createElement('span'), { textContent: message })); return empty }
function isEntityLoved(kind, item) { const type = kind === 'singer' ? 'artists' : kind === 'album' ? 'albums' : kind; return state.libraries[type].some(saved => entityKey(saved) === entityKey(item)) }
async function toggleEntityFavorite(type, item) {
  try { const list = state.libraries[type].slice(); const index = list.findIndex(saved => entityKey(saved) === entityKey(item)); if (index >= 0) list.splice(index, 1); else list.unshift({ ...item.raw, id: item.id, name: item.name, source: item.source, picUrl: item.artworkUrl, artistName: item.artist }); await api.saveLibrary(type, list); state.libraries[type] = list; if (state.view === type) renderLibrary(type); else renderEntities(item.kind, state.entities); showToast(index >= 0 ? '已取消收藏' : '已收藏') } catch (error) { showToast(errorMessage(error), true) }
}
async function openLibrary(type, preserveHistory = false) {
  if (!preserveHistory) state.detailHistory = []; resetEntityDetailView(); state.view = type; state.libraryType = type; setActiveNavigation('data-view', type); showMode(type); elements.playlistActions.classList.add('hidden'); elements.title.textContent = type === 'artists' ? '收藏歌手' : '收藏专辑'
  try { await refreshLibraries(); renderLibrary(type) } catch (error) { showToast(errorMessage(error), true) }
}
function renderLibrary(type) {
  const items = state.libraries[type].map(item => normalizeEntity(item, type === 'artists' ? 'singer' : 'album')); elements.libraryRefresh.classList.remove('hidden'); elements.libraryLabel.textContent = `${items.length} 个${type === 'artists' ? '歌手' : '专辑'}`; elements.entityList.classList.remove('hidden'); elements.trackList.classList.add('hidden'); elements.empty.classList.add('hidden'); elements.entityList.replaceChildren()
  items.forEach(item => { const row = document.createElement('article'); row.className = 'entity-row'; bindEntityOpen(row, item); const cover = document.createElement('div'); renderCover(cover, item.artworkUrl, 'entity'); const copy = document.createElement('div'); copy.className = 'entity-copy'; copy.append(Object.assign(document.createElement('strong'), { textContent: item.name }), Object.assign(document.createElement('span'), { textContent: entitySubtitle(item) })); const actions = document.createElement('div'); actions.className = 'entity-actions'; const open = makeIconButton('chevron-right', '查看详情'); open.addEventListener('click', () => void openEntityDetail(item)); const remove = makeIconButton('heart-off', '取消收藏'); remove.classList.add('active'); remove.addEventListener('click', () => void toggleEntityFavorite(type, item)); actions.append(open, remove); row.append(cover, copy, actions); elements.entityList.append(row) }); if (!items.length) elements.entityList.append(createEntityEmpty(type === 'artists' ? '还没有收藏歌手' : '还没有收藏专辑')); replaceIcons()
}
function captureDetailOrigin() {
  if (state.entityDetail && ['artistDetail', 'albumDetail'].includes(state.view)) return { type: 'detail', item: state.entityDetail }
  if (state.view === 'searchEntities') return { type: 'search', kind: state.searchType, title: elements.title.textContent, subtitle: elements.subtitle.textContent }
  if (state.view === 'artists' || state.view === 'albums') return { type: 'library', libraryType: state.view }
  return { type: 'library', libraryType: state.libraryType }
}
function renderDetailSummary(entity, result) {
  elements.entityDetailSummary.classList.remove('hidden'); renderCover(elements.entityDetailCover, entity.artworkUrl, 'detail'); elements.entityDetailName.textContent = entity.name
  const parts = [entity.source.toUpperCase(), `${state.tracks.length} 首歌曲`]
  if (entity.kind === 'singer') parts.push(`${(result.albums || []).length} 张专辑`)
  if (entity.artist && entity.artist !== entity.name) parts.push(entity.artist)
  if (entity.publishTime) parts.push(String(entity.publishTime).slice(0, 10))
  elements.entityDetailMeta.textContent = parts.join(' · '); elements.entityDetailDescription.textContent = result.entity?.description || ''
}
function renderRelatedAlbums(albums) {
  elements.relatedAlbums.classList.remove('hidden'); elements.relatedAlbumCount.textContent = `${albums.length} 张`; elements.relatedAlbumList.replaceChildren()
  albums.forEach(value => {
    const album = normalizeEntity(value, 'album'); const button = document.createElement('button'); button.type = 'button'; button.className = 'album-card'; button.title = `打开专辑：${album.name}`
    const cover = document.createElement('div'); cover.className = 'album-card-cover'; renderCover(cover, album.artworkUrl, 'album')
    const copy = document.createElement('div'); copy.className = 'album-card-copy'; const detail = album.publishTime ? String(album.publishTime).slice(0, 10) : album.trackCount ? `${album.trackCount} 首` : album.artist
    copy.append(Object.assign(document.createElement('strong'), { textContent: album.name }), Object.assign(document.createElement('span'), { textContent: detail || album.source.toUpperCase() }))
    button.append(cover, copy); button.addEventListener('click', () => void openEntityDetail(album)); elements.relatedAlbumList.append(button)
  })
  if (!albums.length) elements.relatedAlbumList.append(Object.assign(document.createElement('span'), { className: 'entity-detail-empty', textContent: '暂无专辑信息' }))
}
async function openEntityDetail(item, pushHistory = true) {
  if (!item?.id || !['singer', 'album'].includes(item.kind)) return showToast('缺少歌手或专辑信息', true)
  if (pushHistory) state.detailHistory.push(captureDetailOrigin())
  resetEntityDetailView(); state.entityDetail = item; state.view = item.kind === 'singer' ? 'artistDetail' : 'albumDetail'; showMode(state.view); elements.playlistActions.classList.add('hidden'); elements.title.textContent = item.name; elements.subtitle.textContent = '正在读取详情'; elements.trackList.replaceChildren(); state.tracks = []; setLoading(true)
  try {
    const result = await api.getEntityDetail({ kind: item.kind, id: item.id, source: item.source, name: item.name, artist: item.artist })
    const entityData = result.entity || {}; const entity = normalizeEntity({ ...item, ...entityData, name: entityData.name || item.name, artist: entityData.artist || item.artist, artworkUrl: entityData.artworkUrl || item.artworkUrl, raw: item.raw }, item.kind)
    state.entityDetail = entity; state.tracks = Array.isArray(result.songs) ? result.songs : []; elements.title.textContent = entity.name; elements.subtitle.textContent = `${entity.source.toUpperCase()} · ${state.tracks.length} 首歌曲`; renderDetailSummary(entity, result)
    if (item.kind === 'singer') renderRelatedAlbums(Array.isArray(result.albums) ? result.albums : [])
    renderTrackList()
  } catch (error) {
    const message = errorMessage(error); elements.subtitle.textContent = '详情读取失败'; state.tracks = []; renderTrackList(); showToast(message, true)
  } finally { setLoading(false) }
}
function restoreEntityOrigin() {
  const origin = state.detailHistory.pop()
  if (!origin) return void openLibrary(state.entityDetail?.kind === 'album' ? 'albums' : 'artists')
  if (origin.type === 'detail') return void openEntityDetail(origin.item, false)
  if (origin.type === 'library') return void openLibrary(origin.libraryType, true)
  resetEntityDetailView(); state.view = 'searchEntities'; showMode('searchEntities'); elements.title.textContent = origin.title; elements.subtitle.textContent = origin.subtitle; renderEntities(origin.kind, state.entities)
}
async function openLeaderboards() {
  state.detailHistory = []; resetEntityDetailView(); state.view = 'leaderboards'; state.boardId = null; setActiveNavigation('data-view', 'leaderboards'); showMode('leaderboards'); elements.playlistActions.classList.add('hidden'); elements.title.textContent = '排行榜'; elements.subtitle.textContent = '选择平台和榜单'; await loadBoards()
}
async function loadBoards() {
  elements.leaderboardStatus.textContent = '正在读取...'; elements.leaderboardList.replaceChildren(); try { const result = await api.getLeaderboards(state.boardSource); state.boards = result?.list || result?.items || []; elements.leaderboardStatus.textContent = `${state.boards.length} 个榜单`; state.boards.forEach(board => { const button = document.createElement('button'); button.type = 'button'; button.className = 'board-item'; button.append(icon('list-music'), Object.assign(document.createElement('span'), { textContent: board.name || board.id })); button.addEventListener('click', () => void openLeaderboardTracks(board)); elements.leaderboardList.append(button) }); replaceIcons() } catch (error) { elements.leaderboardStatus.textContent = ''; showToast(errorMessage(error), true) }
}
async function openLeaderboardTracks(board) {
  resetEntityDetailView(); state.view = 'leaderboardTracks'; state.boardId = board.bangid || String(board.id || '').replace(`${state.boardSource}__`, ''); showMode('leaderboardTracks'); elements.title.textContent = board.name || '排行榜'; elements.playlistActions.classList.add('hidden'); setLoading(true)
  try { const result = await api.getLeaderboardTracks({ source: state.boardSource, boardId: state.boardId, page: 1 }); state.tracks = result.items || []; elements.subtitle.textContent = `${state.boardSource.toUpperCase()} · ${state.tracks.length} 首歌曲`; renderTrackList() } catch (error) { showToast(errorMessage(error), true) } finally { setLoading(false) }
}
function openAbout() { state.detailHistory = []; resetEntityDetailView(); state.view = 'about'; setActiveNavigation('data-view', 'about'); showMode('about'); elements.playlistActions.classList.add('hidden'); elements.title.textContent = '关于'; elements.subtitle.textContent = '客户端信息' }
function playFromTracks(sourceTrack) { const index = state.tracks.indexOf(sourceTrack); state.queue = state.tracks.slice(); state.queueIndex = Math.max(0, index); saveQueue(); renderQueue(); void playAt(state.queueIndex) }
async function playAt(index) {
  if (!state.queue.length || state.resolving) return; const normalized = ((index % state.queue.length) + state.queue.length) % state.queue.length; state.queueIndex = normalized; state.current = state.queue[normalized]; state.resolving = true; renderNowPlaying(); renderQueue(); renderTrackList(); elements.nowArtist.textContent = '正在获取播放地址...'
  try { const result = await api.resolveTrack({ track: rawTrack(state.current), quality: elements.quality.value }); if (state.current !== state.queue[normalized]) return; elements.audio.src = result.url; state.current = { ...state.current, raw: result.track || rawTrack(state.current), source: result.actualSource || state.current.source }; renderNowPlaying(); renderTrackList(); void loadLyrics(state.current); await elements.audio.play() } catch (error) { showToast(`无法播放：${errorMessage(error)}`, true) } finally { state.resolving = false }
}
function nextTrack(manual = false) { if (!state.queue.length) return; let next = state.queueIndex + 1; if (state.playMode === 'shuffle' && state.queue.length > 1) do next = Math.floor(Math.random() * state.queue.length); while (next === state.queueIndex); else if (!manual && state.playMode === 'one') next = state.queueIndex; void playAt(next) }
function previousTrack() { if (elements.audio.currentTime > 4) { elements.audio.currentTime = 0; return } void playAt(state.queueIndex - 1) }
function renderNowPlaying() {
  const track = state.current ? normalizeTrack(state.current) : null
  elements.nowTitle.textContent = track?.title || '尚未播放'; elements.nowArtist.textContent = track?.artist || '选择一首歌曲开始播放'; renderCover(elements.nowCover, track?.artworkUrl, 'now'); elements.nowCover.disabled = !track; elements.favoriteCurrent.disabled = !track
  elements.lyricsTitle.textContent = track?.title || '尚未播放'; elements.lyricsArtist.textContent = track?.artist || '-'; renderCover(elements.lyricsCover, track?.artworkUrl, 'lyrics'); elements.lyricsBackdrop.style.backgroundImage = track?.artworkUrl ? `url(${JSON.stringify(track.artworkUrl)})` : ''
  renderCurrentFavorite(); replaceIcons()
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
async function downloadTrack(track) { state.downloads.set(trackId(track), 'downloading'); renderTrackList(); try { const result = await api.downloadTrack(rawTrack(track), elements.quality.value); if (result?.cancelled) { state.downloads.delete(trackId(track)); renderTrackList(); return } showToast(`已下载到 Windows：${result.path}`); state.downloads.delete(trackId(track)); renderTrackList() } catch (error) { state.downloads.delete(trackId(track)); renderTrackList(); showToast(`下载失败：${errorMessage(error)}`, true) } }
function renderQueue() { elements.queueList.replaceChildren(); elements.queueCount.textContent = `${state.queue.length} 首`; state.queue.forEach((item, index) => { const row = document.createElement('div'); row.className = `queue-item${index === state.queueIndex ? ' playing' : ''}`; const copy = document.createElement('div'); copy.className = 'queue-item-copy'; const track = normalizeTrack(item); copy.append(Object.assign(document.createElement('strong'), { textContent: track.title }), Object.assign(document.createElement('span'), { textContent: track.artist })); copy.addEventListener('dblclick', () => void playAt(index)); const remove = makeIconButton('x', '移出队列'); remove.addEventListener('click', () => { state.queue.splice(index, 1); if (index < state.queueIndex) state.queueIndex--; else if (index === state.queueIndex && state.queue.length) { state.queueIndex = Math.min(index, state.queue.length - 1); void playAt(state.queueIndex) } else if (!state.queue.length) stopPlayback(); saveQueue(); renderQueue() }); row.append(copy, remove); elements.queueList.append(row) }); saveQueue(); replaceIcons() }
function stopPlayback() { elements.audio.pause(); elements.audio.removeAttribute('src'); state.current = null; state.queueIndex = -1; renderNowPlaying(); renderTrackList(); elements.progress.value = 0; elements.elapsed.textContent = '0:00'; elements.duration.textContent = '0:00' }
function closeDetail() { elements.detail.classList.remove('open'); elements.detail.setAttribute('aria-hidden', 'true') }
function toggleQueue() { if (elements.detail.classList.contains('open')) closeDetail(); else { elements.detail.classList.add('open'); elements.detail.setAttribute('aria-hidden', 'false') } }
function openLyrics() { if (!state.current) return; closeDetail(); elements.lyricsView.classList.remove('hidden'); elements.lyricsView.setAttribute('aria-hidden', 'false'); syncLyrics(elements.audio.currentTime) }
function closeLyrics() { elements.lyricsView.classList.add('hidden'); elements.lyricsView.setAttribute('aria-hidden', 'true') }
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
    if (line.time !== null) { item.dataset.time = String(line.time); item.tabIndex = 0; item.setAttribute('role', 'button'); item.addEventListener('click', () => { elements.audio.currentTime = line.time; syncLyrics(line.time) }); item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.click() } }) }
    elements.lyricsContent.append(item)
  })
}
function syncLyrics(currentTime) {
  if (!state.lyrics.length || state.lyrics[0].time === null) return
  let active = -1
  for (let index = 0; index < state.lyrics.length; index++) { if (state.lyrics[index].time > currentTime + 0.15) break; active = index }
  if (active === state.activeLyricIndex) return
  state.activeLyricIndex = active; const lines = elements.lyricsContent.querySelectorAll('.lyric-line'); lines.forEach((line, index) => line.classList.toggle('active', index === active)); if (active >= 0 && !elements.lyricsView.classList.contains('hidden')) lines[active]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
async function loadLyrics(track) {
  const requestId = ++state.lyricsRequestId; renderLyrics([], '正在读取歌词...')
  try { const value = await api.getLyrics(rawTrack(track)); if (requestId !== state.lyricsRequestId) return; const content = value?.content || value?.lyric || value?.lrc || ''; renderLyrics(parseLyrics(content)); syncLyrics(elements.audio.currentTime) } catch { if (requestId === state.lyricsRequestId) renderLyrics([]) }
}
function handleDownloadProgress(value) { if (!value) return; if (value.status === 'downloading' && value.total) showToast(`正在下载 ${value.title}：${Math.round(value.received / value.total * 100)}%`); else if (value.status === 'downloading') showToast(`正在下载 ${value.title}：已接收 ${Math.round(value.received / 1024 / 1024 * 10) / 10} MB`); else if (value.status === 'completed') showToast(`下载完成：${value.path}`) }

elements.searchForm.addEventListener('submit', event => { event.preventDefault(); void search() })
elements.searchTypes.forEach(button => button.addEventListener('click', () => { state.searchType = button.dataset.type; elements.searchTypes.forEach(item => item.classList.toggle('active', item === button)); updateSearchControls(); if (elements.searchInput.value.trim()) void search() }))
elements.sourceTabs.forEach(button => button.addEventListener('click', () => { state.searchSource = button.dataset.source; elements.sourceTabs.forEach(item => item.classList.toggle('active', item === button)); if (elements.searchInput.value.trim()) void search() }))
document.querySelector('[data-view="search"]').addEventListener('click', openSearch); document.querySelector('[data-view="leaderboards"]').addEventListener('click', () => void openLeaderboards()); document.querySelector('[data-view="artists"]').addEventListener('click', () => void openLibrary('artists')); document.querySelector('[data-view="albums"]').addEventListener('click', () => void openLibrary('albums')); document.querySelector('[data-playlist="love"]').addEventListener('click', () => void openPlaylist('love')); document.querySelector('[data-view="about"]').addEventListener('click', openAbout)
elements.syncCenter.addEventListener('click', () => api.openSyncCenter()); elements.libraryRefresh.addEventListener('click', () => void openLibrary(state.libraryType)); elements.leaderboardSource.addEventListener('change', () => { state.boardSource = elements.leaderboardSource.value; void loadBoards() })
elements.entityDetailBack.addEventListener('click', restoreEntityOrigin)
elements.createPlaylist.addEventListener('click', async () => { const name = window.prompt('请输入歌单名称')?.trim(); if (!name) return; try { const created = await api.createPlaylist(name); await refreshPlaylists(); await openPlaylist(created.id) } catch (error) { showToast(errorMessage(error), true) } })
elements.renamePlaylist.addEventListener('click', async () => { const current = state.playlists.find(item => item.id === state.playlistId); const name = window.prompt('请输入新的歌单名称', current?.name || '')?.trim(); if (!name || name === current?.name) return; try { await api.renamePlaylist(state.playlistId, name); await refreshPlaylists(); await openPlaylist(state.playlistId); showToast('歌单已重命名') } catch (error) { showToast(errorMessage(error), true) } })
elements.deletePlaylist.addEventListener('click', async () => { const current = state.playlists.find(item => item.id === state.playlistId); if (!current || !window.confirm(`删除歌单“${current.name}”？`)) return; try { await api.deletePlaylist(current.id); await refreshPlaylists(); await openPlaylist('love'); showToast('歌单已删除') } catch (error) { showToast(errorMessage(error), true) } })
elements.playAll.addEventListener('click', () => { if (state.tracks.length) playFromTracks(state.tracks[0]) }); elements.favoriteCurrent.addEventListener('click', () => { if (state.current) void toggleFavorite(state.current) }); elements.playPause.addEventListener('click', () => { if (!state.current && state.queue.length) return void playAt(Math.max(0, state.queueIndex)); if (!state.current && state.tracks.length) return playFromTracks(state.tracks[0]); if (elements.audio.paused) elements.audio.play().catch(error => showToast(errorMessage(error), true)); else elements.audio.pause() }); elements.previous.addEventListener('click', previousTrack); elements.next.addEventListener('click', () => nextTrack(true))
elements.playMode.addEventListener('click', () => { state.playMode = state.playMode === 'list' ? 'one' : state.playMode === 'one' ? 'shuffle' : 'list'; localStorage.setItem('yinyun-player-mode', state.playMode); renderPlayMode() }); elements.queueToggle.addEventListener('click', toggleQueue); elements.closeDetail.addEventListener('click', closeDetail); elements.nowCover.addEventListener('click', openLyrics); elements.closeLyrics.addEventListener('click', closeLyrics); elements.clearQueue.addEventListener('click', () => { state.queue = []; stopPlayback(); renderQueue() })
elements.volume.addEventListener('input', () => { elements.audio.volume = Number(elements.volume.value) / 100 }); elements.volume.addEventListener('change', () => api.savePreferences({ volume: elements.audio.volume })); elements.quality.addEventListener('change', () => api.savePreferences({ playbackQuality: elements.quality.value })); elements.progress.addEventListener('input', () => { if (Number.isFinite(elements.audio.duration)) elements.audio.currentTime = Number(elements.progress.value) / 1000 * elements.audio.duration }); elements.audio.addEventListener('timeupdate', () => { const duration = elements.audio.duration || 0; elements.progress.value = duration ? String(Math.round(elements.audio.currentTime / duration * 1000)) : '0'; elements.elapsed.textContent = formatTime(elements.audio.currentTime); elements.duration.textContent = formatTime(duration); syncLyrics(elements.audio.currentTime) }); elements.audio.addEventListener('play', () => setButtonIcon(elements.playPause, 'pause')); elements.audio.addEventListener('pause', () => setButtonIcon(elements.playPause, 'play')); elements.audio.addEventListener('ended', () => nextTrack(false)); elements.audio.addEventListener('error', () => { if (elements.audio.src) showToast('当前歌曲播放失败', true) }); document.addEventListener('click', event => { if (!elements.playlistMenu.contains(event.target)) elements.playlistMenu.classList.add('hidden') }); document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeLyrics(); closeDetail(); return } if (event.code !== 'Space' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return; event.preventDefault(); elements.playPause.click() })
elements.downloadDirectory.addEventListener('click', async () => { try { const result = await api.chooseDownloadDirectory(); if (!result?.success) return; state.app.config.downloadDirectory = result.directory; elements.aboutDownloadDirectory.textContent = result.directory; showToast(`下载目录已设置：${result.directory}`) } catch (error) { showToast(errorMessage(error), true) } })
function renderAppState(value) {
  state.app = value; const connected = Boolean(value.account); elements.accountName.textContent = connected ? value.account.username : '连接已断开'; elements.connectionDot.classList.toggle('offline', !connected)
  elements.aboutVersion.textContent = `v${value.appVersion}`; elements.aboutAccount.textContent = value.account?.username || '-'; elements.aboutServer.textContent = value.account?.serverUrl || '-'; elements.aboutDownloadDirectory.textContent = value.config.downloadDirectory || '首次下载时选择'
  const update = value.availableUpdate; elements.aboutUpdate.classList.toggle('hidden', !update); elements.aboutUpdate.textContent = update ? `有新版本 v${update.version}` : ''; elements.aboutUpdate.dataset.url = update?.url || ''
}
elements.aboutUpdate.addEventListener('click', () => { const url = elements.aboutUpdate.dataset.url; if (url) api.openExternal(url) })
api.onDownloadProgress(handleDownloadProgress); api.onState(renderAppState)

async function initialize() {
  replaceIcons(); renderPlayMode(); renderQueue(); updateSearchControls()
  try { renderAppState(await api.getState()); elements.quality.value = state.app.config.playbackQuality || 'flac'; elements.audio.volume = state.app.config.volume ?? 0.8; elements.volume.value = String(Math.round(elements.audio.volume * 100)); await refreshPlaylists(); await refreshLibraries(); await openPlaylist('love') } catch (error) { showToast(errorMessage(error), true) }
}
void initialize()
