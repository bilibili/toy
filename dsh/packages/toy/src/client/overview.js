/**
 * The Stats tab's default overview: rank the account's Toys by yesterday's
 * traffic and keep a small trend per row.
 *
 * The panel already holds the Toy catalogue, and `toy stats` costs about a
 * tenth of a second per Toy, so the overview fans the existing Remote method
 * out over a small pool instead of adding a Bulk Host endpoint. Everything here
 * is pure data maths, kept in plain ESM so node:test can pin it like
 * `paging.js` / `filters.js`.
 *
 * @module dsh-toy/client-overview
 */

/** How many stats requests run at the same time. */
export const OVERVIEW_CONCURRENCY = 4

/** Sparklines never render more than this many days, even on the 90-day window. */
export const SPARK_DAYS = 14

/**
 * The latest settled day in a stats series, i.e. yesterday for a window that
 * ends yesterday. Items arrive oldest first.
 *
 * @param {{ readonly items: readonly import('../shared/types.ts').ToyStatsDay[] } | undefined} stats
 * @returns {import('../shared/types.ts').ToyStatsDay | undefined}
 */
export function latestDay(stats) {
  if (stats === undefined || stats.items.length === 0) return undefined
  let latest = stats.items[0]
  for (const item of stats.items) {
    if (item.date > latest.date) latest = item
  }
  return latest
}

/**
 * One overview row for a Toy, or an empty row when its stats could not be read.
 *
 * @param {import('../shared/types.ts').ToySummary} toy
 * @param {import('../shared/types.ts').ToyStats | undefined} stats
 * @returns {{
 *   toy: import('../shared/types.ts').ToySummary,
 *   stats: import('../shared/types.ts').ToyStats | undefined,
 *   date: string | undefined,
 *   pv: number,
 *   uv: number,
 *   totalPv: number,
 *   spark: readonly import('../shared/types.ts').ToyStatsDay[],
 * }}
 */
export function overviewRow(toy, stats) {
  const latest = latestDay(stats)
  const items = stats?.items ?? []
  let totalPv = 0
  for (const item of items) {
    totalPv += item.pv
  }
  return {
    toy,
    stats,
    date: latest?.date,
    pv: latest?.pv ?? 0,
    uv: latest?.uv ?? 0,
    totalPv,
    spark: items.slice(-SPARK_DAYS),
  }
}

/**
 * Rank rows the way the overview lists them: yesterday's PV desc, then UV desc,
 * then newest update, then title. Rows without stats sink to the end.
 *
 * @param {readonly ReturnType<typeof overviewRow>[]} rows
 * @param {string} [locale]
 * @returns {readonly ReturnType<typeof overviewRow>[]}
 */
export function sortOverviewRows(rows, locale = 'en') {
  const rank = (row) => (row.stats === undefined ? 1 : 0)
  return [...rows].sort((left, right) => {
    if (rank(left) !== rank(right)) return rank(left) - rank(right)
    if (right.pv !== left.pv) return right.pv - left.pv
    if (right.uv !== left.uv) return right.uv - left.uv
    if ((right.toy.mtime ?? 0) !== (left.toy.mtime ?? 0)) return (right.toy.mtime ?? 0) - (left.toy.mtime ?? 0)
    return left.toy.title.localeCompare(right.toy.title, locale)
  })
}

/**
 * Normalized bar heights (0–1) for a row's sparkline; PV and UV share one
 * scale so the two series stay comparable.
 *
 * @param {{ readonly items: readonly import('../shared/types.ts').ToyStatsDay[] } | undefined} stats
 * @returns {readonly { readonly pv: number, readonly uv: number }[]}
 */
export function sparkHeights(stats) {
  const items = (stats?.items ?? []).slice(-SPARK_DAYS)
  if (items.length === 0) return []
  const max = Math.max(1, ...items.map((item) => Math.max(item.pv, item.uv)))
  return items.map((item) => ({ pv: item.pv / max, uv: item.uv / max }))
}

/**
 * Run `worker` over items with a fixed concurrency, reporting progress after
 * every settled request. A rejected item resolves to `undefined` instead of
 * failing the whole overview.
 *
 * @template T, R
 * @param {readonly T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} worker
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<(R | undefined)[]>}
 */
export async function mapLimit(items, limit, worker, onProgress) {
  const size = Math.max(1, Math.trunc(limit))
  const results = new Array(items.length)
  let next = 0
  let done = 0
  const run = async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= items.length) return
      try {
        results[index] = await worker(items[index], index)
      } catch {
        results[index] = undefined
      }
      done += 1
      onProgress?.(done, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run))
  return results
}
