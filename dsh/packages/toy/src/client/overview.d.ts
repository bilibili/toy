/**
 * Type face for `src/client/overview.js`: the Stats tab's ranking and trend
 * maths, kept in plain ESM so its node:test suite exercises the JavaScript.
 */

import type { ToyStats, ToyStatsDay, ToySummary } from '../shared/types.ts'

/** How many stats requests run at the same time. */

/** Sparklines never render more than this many days. */
export const SPARK_DAYS: number

/** One Toy's row in the overview, with or without readable stats. */
export interface OverviewRow {
  readonly toy: ToySummary
  readonly stats: ToyStats | undefined
  readonly date: string | undefined
  readonly pv: number
  readonly uv: number
  readonly totalPv: number
  readonly totalUv: number
  readonly spark: readonly ToyStatsDay[]
}

/** The latest settled day in a stats series. */
export function latestDay(stats: Pick<ToyStats, 'items'> | undefined): ToyStatsDay | undefined

/** Build one overview row. */
export function overviewRow(toy: ToySummary, stats: ToyStats | undefined): OverviewRow

/** Rank rows by yesterday's PV/UV, then update time, then title. */
export function sortOverviewRows(rows: readonly OverviewRow[], locale?: string): readonly OverviewRow[]

/** Normalized PV/UV bar heights for a sparkline. */
export function sparkHeights(stats: Pick<ToyStats, 'items'> | undefined): readonly { readonly pv: number, readonly uv: number }[]

/** Run a worker over items with a fixed concurrency, collecting failures as undefined. */
export function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<(R | undefined)[]>
