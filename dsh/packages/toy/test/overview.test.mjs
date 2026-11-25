/**
 * The Stats tab's default overview maths: ranking by yesterday's traffic,
 * sparkline scaling and the bounded-concurrency fan-out. Pure values, no DOM.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { latestDay, mapLimit, overviewRow, sortOverviewRows, sparkHeights } from '../src/client/overview.js'

/** A Toy with the fields the overview reads. */
function toy(id, title, extra = {}) {
  return { id, title, ...extra }
}

/** A stats series oldest first. */
function stats(id, days) {
  return { id, items: days.map(([date, pv, uv]) => ({ date, pv, uv })) }
}

test('latestDay returns the newest date regardless of item order', () => {
  assert.equal(latestDay(undefined), undefined)
  assert.equal(latestDay({ items: [] }), undefined)
  const day = latestDay({ items: [{ date: '2026-11-22', pv: 4, uv: 3 }, { date: '2026-11-20', pv: 9, uv: 9 }] })
  assert.equal(day.date, '2026-11-22')
  assert.equal(day.pv, 4)
})

test('overviewRow takes yesterday from the series and sums the window', () => {
  const row = overviewRow(toy(7, 'seven'), stats(7, [['2026-11-21', 10, 8], ['2026-11-22', 3, 2]]))
  assert.equal(row.date, '2026-11-22')
  assert.equal(row.pv, 3)
  assert.equal(row.uv, 2)
  assert.equal(row.totalPv, 13)
  assert.equal(row.spark.length, 2)
  const empty = overviewRow(toy(8, 'eight'), undefined)
  assert.equal(empty.date, undefined)
  assert.equal(empty.pv, 0)
  assert.equal(empty.totalPv, 0)
})

test('rows rank by yesterday PV, then UV, then update time, missing stats last', () => {
  const rows = [
    overviewRow(toy(1, 'a', { mtime: 10 }), stats(1, [['2026-11-22', 5, 5]])),
    overviewRow(toy(2, 'b', { mtime: 99 }), stats(2, [['2026-11-22', 5, 7]])),
    overviewRow(toy(3, 'c', { mtime: 50 }), stats(3, [['2026-11-22', 9, 1]])),
    overviewRow(toy(4, 'd', { mtime: 80 }), undefined),
  ]
  assert.deepEqual(sortOverviewRows(rows).map((row) => row.toy.id), [3, 2, 1, 4])
  assert.deepEqual(rows.map((row) => row.toy.id), [1, 2, 3, 4])
})

test('sparkHeights shares one scale for PV and UV and caps at 14 days', () => {
  assert.deepEqual(sparkHeights(undefined), [])
  const days = Array.from({ length: 20 }, (_, index) => [`2026-11-${String(index + 1).padStart(2, '0')}`, index + 1, (index + 1) / 2])
  const heights = sparkHeights(stats(1, days))
  assert.equal(heights.length, 14)
  assert.equal(heights[heights.length - 1].pv, 1)
  assert.equal(heights[heights.length - 1].uv, 0.5)
})

test('mapLimit keeps input order, reports progress and tolerates failures', async () => {
  const seen = []
  const progress = []
  const out = await mapLimit([1, 2, 3, 4, 5], 2, async (value) => {
    seen.push(value)
    if (value === 3) throw new Error('boom')
    return value * 10
  }, (done, total) => progress.push([done, total]))
  assert.deepEqual(out, [10, 20, undefined, 40, 50])
  assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5])
  assert.equal(progress.length, 5)
  assert.deepEqual(progress[4], [5, 5])
})
