/**
 * Pure filters, sorting and chart maths for the panel's Toy workspace.
 *
 * Kept in plain ESM (with the `filters.d.ts` type face) so the node:test suite
 * exercises the list behaviour directly, like `paging.js` and `locale.js`.
 * React stays in the view modules; nothing here touches the DOM.
 *
 * @module dsh-toy/client-filters
 */

/**
 * Bucket a raw platform status into the grid's filter groups.
 *
 * @param {string | undefined} status
 * @returns {'published' | 'review' | 'rejected' | 'other'}
 */
export function statusBucket(status) {
  const value = (status ?? '').toLowerCase()
  if (value === '') return 'other'
  if (value.includes('reject') || value.includes('fail') || value.includes('ban') || value.includes('offline')) return 'rejected'
  if (value.includes('review') || value.includes('audit') || value.includes('pending') || value.includes('wait')) return 'review'
  if (value.includes('publish') || value.includes('online') || value.includes('release')) return 'published'
  return 'other'
}

/**
 * Case-insensitive match on title, slug and id.
 *
 * @param {{ readonly id: number, readonly title: string, readonly slug?: string | undefined }} toy
 * @param {string} query
 * @returns {boolean}
 */
export function matchToy(toy, query) {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return (
    toy.title.toLowerCase().includes(needle)
    || (toy.slug ?? '').toLowerCase().includes(needle)
    || String(toy.id).includes(needle)
  )
}

/**
 * Filter then order the loaded catalogue. `updated`/`created` sort newest
 * first; `title` compares with the active locale.
 *
 * @param {readonly import('../shared/types.ts').ToySummary[]} items
 * @param {{ readonly query?: string, readonly status?: string, readonly sort?: 'updated' | 'created' | 'title', readonly locale?: string }} options
 * @returns {readonly import('../shared/types.ts').ToySummary[]}
 */
export function filterToys(items, options = {}) {
  const query = options.query ?? ''
  const status = options.status ?? 'all'
  const rows = items.filter((toy) => {
    if (status !== 'all' && statusBucket(toy.status) !== status) return false
    return matchToy(toy, query)
  })
  const sorted = [...rows]
  const sort = options.sort ?? 'updated'
  if (sort === 'title') sorted.sort((left, right) => left.title.localeCompare(right.title, options.locale ?? 'en'))
  else if (sort === 'created') sorted.sort((left, right) => (right.ctime ?? 0) - (left.ctime ?? 0))
  else sorted.sort((left, right) => (right.mtime ?? 0) - (left.mtime ?? 0))
  return sorted
}

/**
 * Round a chart maximum up to a readable value (5 / 10 / 20 / 50 / 100 …).
 *
 * @param {number} value
 * @returns {number}
 */
export function niceMax(value) {
  if (!Number.isFinite(value) || value <= 5) return 5
  const power = 10 ** Math.floor(Math.log10(value))
  const normalized = value / power
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * power
}

/**
 * The y-axis tick values from top to bottom for a chart maximum.
 *
 * @param {number} max
 * @param {number} count
 * @returns {readonly number[]}
 */
export function chartTicks(max, count) {
  const ticks = []
  for (let index = 0; index <= count; index += 1) ticks.push(Math.round((max / count) * (count - index)))
  return ticks
}
