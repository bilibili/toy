/**
 * The home dashboard's account aggregates: yesterday, the same day last week,
 * the last seven days, the portfolio buckets and cumulative interactions.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { accountSummary, latestAccountDate, shiftDate, sliceToyStats } from '../src/client/statsAggregate.js'

function toy(id, title, status) {
  return { id, title, ...(status === undefined ? {} : { status }) }
}

function stats(id, days, dyn) {
  return {
    id,
    items: days.map(([date, pv, uv]) => ({ date, pv, uv })),
    ...(dyn === undefined ? {} : { dynStat: dyn }),
  }
}

test('shiftDate crosses month and year boundaries', () => {
  assert.equal(shiftDate('2026-11-24', -7), '2026-11-17')
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28')
  assert.equal(shiftDate('2025-12-31', 1), '2026-01-01')
})

test('latestAccountDate takes the newest day across Toys', () => {
  assert.equal(latestAccountDate([undefined, stats(1, [['2026-11-20', 1, 1], ['2026-11-23', 2, 2]])]), '2026-11-23')
  assert.equal(latestAccountDate([]), undefined)
})

test('sliceToyStats keeps the trailing window and leaves the input alone', () => {
  const source = stats(1, [['2026-11-20', 1, 1], ['2026-11-21', 2, 2], ['2026-11-22', 3, 3]])
  const sliced = sliceToyStats(source, 2)
  assert.deepEqual(sliced.items.map((day) => day.date), ['2026-11-21', '2026-11-22'])
  assert.equal(source.items.length, 3)
  assert.equal(sliceToyStats(undefined, 2), undefined)
})

test('accountSummary aggregates yesterday, week-ago, last 7 days and interactions', () => {
  const toys = [toy(1, 'a', 'published'), toy(2, 'b', 'in-review'), toy(3, 'c', undefined)]
  const map = new Map([
    [1, stats(1, [
      ['2026-11-16', 5, 4],
      ['2026-11-23', 10, 8],
    ], { like: 1, favorite: 2, comment: 3, share: 4 })],
    [2, stats(2, [
      ['2026-11-22', 7, 6],
      ['2026-11-23', 3, 2],
    ], { like: 10 })],
    [3, undefined],
  ])
  const summary = accountSummary(toys, map)
  assert.equal(summary.date, '2026-11-23')
  assert.equal(summary.yesterdayPv, 13)
  assert.equal(summary.yesterdayUv, 10)
  assert.equal(summary.weekAgoPv, 5)
  assert.equal(summary.weekAgoUv, 4)
  assert.equal(summary.wowPercent, 160)
  assert.equal(summary.last7Pv, 20)
  assert.equal(summary.last7Uv, 16)
  assert.equal(summary.prev7Pv, 5)
  assert.equal(summary.prev7Uv, 4)
  assert.equal(summary.wow7PvPercent, 300)
  assert.equal(summary.wow7UvPercent, 300)
  assert.deepEqual(summary.interactions, { like: 11, favorite: 2, comment: 3, share: 4, total: 20 })
  assert.deepEqual(summary.portfolio, { total: 3, published: 1, review: 1, rejected: 0, other: 1 })
  assert.equal(summary.measured, 2)
  assert.equal(summary.missing, 1)
})

test('wowPercent is undefined without last week data', () => {
  const summary = accountSummary([toy(1, 'a')], new Map([[1, stats(1, [['2026-11-23', 4, 4]])]]))
  assert.equal(summary.weekAgoPv, 0)
  assert.equal(summary.wowPercent, undefined)
  assert.equal(summary.wow7PvPercent, undefined)
  assert.equal(summary.wow7UvPercent, undefined)
})
