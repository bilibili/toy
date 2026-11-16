/**
 * The panel's client-side grid paging on its own: pure arithmetic, so its
 * node:test suite pins the page maths without a DOM. The Host `listToys`
 * paging (50 per call, `hasNext` from the served page) is covered in
 * `service.test.mjs`; this is what the browser does with the loaded cards.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { slicePage } from '../src/client/paging.js'

/** A catalogue of `count` Toys with ids 1..count. */
function catalogue(count) {
  const items = Array.from({ length: count }, (_, index) => ({ id: index + 1, title: `toy-${index + 1}` }))
  return { total: count, items }
}

test('an empty catalogue still yields one empty page', () => {
  const page = slicePage(catalogue(0), 1, 20)
  assert.equal(page.total, 0)
  assert.equal(page.page, 1)
  assert.equal(page.size, 20)
  assert.equal(page.pages, 1)
  assert.equal(page.hasNext, false)
  assert.deepEqual(page.items, [])
})

test('a 23-Toy account pages as 20 + 3', () => {
  const first = slicePage(catalogue(23), 1, 20)
  assert.equal(first.total, 23)
  assert.equal(first.page, 1)
  assert.equal(first.pages, 2)
  assert.equal(first.hasNext, true)
  assert.equal(first.items.length, 20)
  assert.equal(first.items[0].id, 1)
  assert.equal(first.items[19].id, 20)

  const second = slicePage(catalogue(23), 2, 20)
  assert.equal(second.page, 2)
  assert.equal(second.hasNext, false)
  assert.deepEqual(second.items.map(item => item.id), [21, 22, 23])
})

test('the last page never advertises a next page', () => {
  for (const count of [1, 20, 21, 40, 41]) {
    const pages = Math.max(1, Math.ceil(count / 20))
    const last = slicePage(catalogue(count), pages, 20)
    assert.equal(last.page, pages, `count ${count}`)
    assert.equal(last.hasNext, false, `count ${count}`)
    assert.equal(last.items.length, count - (pages - 1) * 20, `count ${count}`)
  }
})

test('a stale page number is clamped into range instead of emptying the grid', () => {
  for (const requested of [0, -3, 9, 2.7, Number.NaN]) {
    const page = slicePage(catalogue(23), requested, 20)
    assert.ok(page.page >= 1 && page.page <= 2, `requested ${requested} -> ${page.page}`)
    assert.ok(page.items.length > 0, `requested ${requested} kept cards`)
  }
  assert.equal(slicePage(catalogue(23), 9, 20).page, 2)
  assert.equal(slicePage(catalogue(23), 0, 20).page, 1)
})

test('a zero or unusable page size does not divide by zero', () => {
  for (const size of [0, -5, Number.NaN]) {
    const page = slicePage(catalogue(3), 1, size)
    assert.equal(page.size, 1)
    assert.equal(page.pages, 3)
    assert.equal(page.items.length, 1)
    assert.equal(page.hasNext, true)
  }
})
