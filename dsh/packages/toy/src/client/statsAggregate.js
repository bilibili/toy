/**
 * Account-level aggregates for the home dashboard: yesterday's traffic, the
 * week-over-week comparison, the last-seven-day totals, the work portfolio and
 * the cumulative interactions.
 *
 * Pure maths over the per-Toy `toy stats` payloads, kept in plain ESM so
 * node:test can pin it like `filters.js` / `overview.js`.
 *
 * @module dsh-toy/client-stats-aggregate
 */

import { statusBucket } from './filters.js'

/**
 * Shift a `YYYY-MM-DD` date by whole days (UTC arithmetic avoids DST drift).
 * @param {string} date
 * @param {number} days
 * @returns {string}
 */
export function shiftDate(date, days) {
  const [year, month, day] = date.split('-').map(Number)
  const stamp = Date.UTC(year, (month ?? 1) - 1, day ?? 1) + days * 86_400_000
  const shifted = new Date(stamp)
  return shifted.toISOString().slice(0, 10)
}

/**
 * The newest settled day across every Toy's series.
 * @param {readonly (import('../shared/types.ts').ToyStats | undefined)[]} stats
 * @returns {string | undefined}
 */
export function latestAccountDate(stats) {
  let latest
  for (const toyStats of stats) {
    for (const day of toyStats?.items ?? []) {
      if (latest === undefined || day.date > latest) latest = day.date
    }
  }
  return latest
}

/**
 * Slice one Toy's series to the last `days` days (used when a 14-day cache
 * serves a 7-day view).
 * @param {import('../shared/types.ts').ToyStats | undefined} stats
 * @param {number} days
 * @returns {import('../shared/types.ts').ToyStats | undefined}
 */
export function sliceToyStats(stats, days) {
  if (stats === undefined) return undefined
  if (!Number.isFinite(days) || days <= 0) return stats
  return { ...stats, items: stats.items.slice(-Math.trunc(days)) }
}

/**
 * The home dashboard numbers.
 *
 * @param {readonly import('../shared/types.ts').ToySummary[]} toys
 * @param {ReadonlyMap<number, import('../shared/types.ts').ToyStats | undefined>} statsById
 * @returns {{
 *   date: string | undefined,
 *   yesterdayPv: number,
 *   yesterdayUv: number,
 *   weekAgoPv: number,
 *   weekAgoUv: number,
 *   wowPercent: number | undefined,
 *   last7Pv: number,
 *   last7Uv: number,
 *   interactions: { like: number, favorite: number, comment: number, share: number, total: number },
 *   portfolio: { total: number, published: number, review: number, rejected: number, other: number },
 *   measured: number,
 *   missing: number,
 * }}
 */
export function accountSummary(toys, statsById) {
  const rows = toys.map(toy => statsById.get(toy.id))
  const date = latestAccountDate(rows)
  const weekAgo = date === undefined ? undefined : shiftDate(date, -7)
  const windowStart = date === undefined ? undefined : shiftDate(date, -6)
  // The previous seven days, for the 7-day week-over-week comparison.
  const previousStart = date === undefined ? undefined : shiftDate(date, -13)
  const previousEnd = date === undefined ? undefined : shiftDate(date, -7)

  let yesterdayPv = 0
  let yesterdayUv = 0
  let weekAgoPv = 0
  let weekAgoUv = 0
  let last7Pv = 0
  let last7Uv = 0
  let prev7Pv = 0
  let prev7Uv = 0
  const windowUvByDate = new Map()
  const previousUvByDate = new Map()
  let measured = 0
  let missing = 0
  const interactions = { like: 0, favorite: 0, comment: 0, share: 0 }
  const portfolio = { total: toys.length, published: 0, review: 0, rejected: 0, other: 0 }

  for (const toy of toys) {
    const bucket = statusBucket(toy.status)
    portfolio[bucket] += 1
  }

  for (const stats of rows) {
    if (stats === undefined) {
      missing += 1
      continue
    }
    measured += 1
    for (const day of stats.items) {
      if (date !== undefined && day.date === date) {
        yesterdayPv += day.pv
        yesterdayUv += day.uv
      }
      if (weekAgo !== undefined && day.date === weekAgo) {
        weekAgoPv += day.pv
        weekAgoUv += day.uv
      }
      if (windowStart !== undefined && day.date >= windowStart && date !== undefined && day.date <= date) {
        last7Pv += day.pv
        last7Uv += day.uv
        windowUvByDate.set(day.date, (windowUvByDate.get(day.date) ?? 0) + day.uv)
      }
      if (previousStart !== undefined && previousEnd !== undefined && day.date >= previousStart && day.date <= previousEnd) {
        prev7Pv += day.pv
        prev7Uv += day.uv
        previousUvByDate.set(day.date, (previousUvByDate.get(day.date) ?? 0) + day.uv)
      }
    }
    const dyn = stats.dynStat
    if (dyn !== undefined) {
      interactions.like += dyn.like ?? 0
      interactions.favorite += dyn.favorite ?? 0
      interactions.comment += dyn.comment ?? 0
      interactions.share += dyn.share ?? 0
    }
  }

  const interactionTotal = interactions.like + interactions.favorite + interactions.comment + interactions.share
  let peakUv = 0
  let peakUvDate
  for (const [day, uv] of windowUvByDate) {
    if (uv > peakUv) {
      peakUv = uv
      peakUvDate = day
    }
  }
  // The week-over-week badge sits next to the active-day average, so it must
  // compare averages too: comparing window sums would contradict the number
  // beside it whenever the two weeks had different numbers of active days.
  const last7UvAvgRaw = last7Uv / Math.max(1, windowUvByDate.size)
  const prev7UvAvgRaw = prev7Uv / Math.max(1, previousUvByDate.size)
  return {
    date,
    yesterdayPv,
    yesterdayUv,
    weekAgoPv,
    weekAgoUv,
    wowPercent: weekAgoPv > 0 ? ((yesterdayPv - weekAgoPv) / weekAgoPv) * 100 : undefined,
    last7Pv,
    last7Uv,
    last7UvAvg: Math.round(last7UvAvgRaw),
    last7UvPeak: peakUv,
    last7UvPeakDate: peakUvDate,
    prev7Pv,
    prev7Uv,
    wow7PvPercent: prev7Pv > 0 ? ((last7Pv - prev7Pv) / prev7Pv) * 100 : undefined,
    wow7UvPercent: prev7UvAvgRaw > 0 ? ((last7UvAvgRaw - prev7UvAvgRaw) / prev7UvAvgRaw) * 100 : undefined,
    interactions: { ...interactions, total: interactionTotal },
    portfolio,
    measured,
    missing,
  }
}
