'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createFavoriteIndex, favoriteTrackId, trackIdentityAliases } = require('../renderer/track-identity.js')

test('matches playlist tracks to favorites across normalized platform identifiers', () => {
  const favorites = [{
    id: 'tx_003HuuJB4gNCdA',
    source: 'tx',
    raw: { id: 'tx_003HuuJB4gNCdA', songmid: '003HuuJB4gNCdA', source: 'tx' },
  }]
  const index = createFavoriteIndex(favorites)

  assert.equal(favoriteTrackId({
    id: '003HuuJB4gNCdA',
    source: 'tx',
    raw: { songmid: '003HuuJB4gNCdA', source: 'tx' },
  }, index), 'tx_003HuuJB4gNCdA')
})

test('matches KG hash and metadata identifiers without title guessing', () => {
  const favorite = { id: 'kg_ABCDEF', source: 'kg', raw: { id: 'kg_ABCDEF', hash: 'ABCDEF', source: 'kg' } }
  const index = createFavoriteIndex([favorite])
  assert.equal(favoriteTrackId({ source: 'kg', raw: { meta: { hash: 'ABCDEF' }, source: 'kg' } }, index), 'kg_ABCDEF')
  assert.equal(trackIdentityAliases({ title: '同名歌曲', artist: '歌手', source: 'kg' }).size, 0)
})
