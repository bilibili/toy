/**
 * The panel's client-side Toy filters, ordering and chart maths: pure values,
 * so the node:test suite pins the list behaviour without a DOM. The Host
 * `listToys` contract is covered in `service.test.mjs`; this is what the
 * browser does with the loaded cards.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chartTicks, filterToys, matchToy, niceMax, statusBucket } from '../src/client/filters.js'

/** One Toy with the fields the filters read. */
function toy(id, title, extra = {}) {
  return { id, title, ...extra }
}

test('buckets the platform status values into filter groups', () => {
  assert.equal(statusBucket(undefined), 'other')
  assert.equal(statusBucket(''), 'other')
  assert.equal(statusBucket('published'), 'published')
  assert.equal(statusBucket('online'), 'published')
  assert.equal(statusBucket('RELEASED'), 'published')
  assert.equal(statusBucket('in-review'), 'review')
  assert.equal(statusBucket('audit_pending'), 'review')
  assert.equal(statusBucket('rejected'), 'rejected')
  assert.equal(statusBucket('offline'), 'rejected')
  assert.equal(statusBucket('draft'), 'other')
})

test('matches title, slug and id, case-insensitively', () => {
  const item = toy(42, '微光小镇', { slug: 'weiguang-town' })
  assert.equal(matchToy(item, ''), true)
  assert.equal(matchToy(item, '   '), true)
  assert.equal(matchToy(item, '微光'), true)
  assert.equal(matchToy(item, 'town'), true)
  assert.equal(matchToy(item, '42'), true)
  assert.equal(matchToy(item, 'missing'), false)
})

test('filters by status and query before ordering', () => {
  const items = [
    toy(1, 'alpha', { status: 'published', mtime: 10 }),
    toy(2, 'beta', { status: 'in-review', mtime: 30 }),
    toy(3, 'gamma', { status: 'published', mtime: 20, slug: 'gamma-dev' }),
  ]
  assert.deepEqual(filterToys(items).map((row) => row.id), [2, 3, 1])
  assert.deepEqual(filterToys(items, { status: 'published' }).map((row) => row.id), [3, 1])
  assert.deepEqual(filterToys(items, { query: 'dev' }).map((row) => row.id), [3])
  assert.deepEqual(filterToys(items, { status: 'published', sort: 'created' }).map((row) => row.id), [1, 3])
  assert.deepEqual(filterToys(items, { sort: 'title' }).map((row) => row.id), [1, 2, 3])
})

test('never mutates the input order', () => {
  const items = [toy(1, 'a', { mtime: 1 }), toy(2, 'b', { mtime: 2 })]
  const ordered = filterToys(items)
  assert.deepEqual(items.map((row) => row.id), [1, 2])
  assert.deepEqual(ordered.map((row) => row.id), [2, 1])
})

test('rounds chart maxima to readable values and builds ticks', () => {
  assert.equal(niceMax(0), 5)
  assert.equal(niceMax(3), 5)
  assert.equal(niceMax(7), 10)
  assert.equal(niceMax(18), 20)
  assert.equal(niceMax(42), 50)
  assert.equal(niceMax(120), 200)
  assert.equal(niceMax(Number.NaN), 5)
  assert.deepEqual(chartTicks(20, 4), [20, 15, 10, 5, 0])
})
