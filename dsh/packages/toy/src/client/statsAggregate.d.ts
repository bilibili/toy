/**
 * Type face for `src/client/statsAggregate.js`: the home dashboard maths, kept
 * in plain ESM so its node:test suite exercises the JavaScript directly.
 */

import type { ToyStats, ToySummary } from '../shared/types.ts'

/** Shift a `YYYY-MM-DD` date by whole days. */
export function shiftDate(date: string, days: number): string

/** The newest settled day across every Toy's series. */
export function latestAccountDate(stats: readonly (ToyStats | undefined)[]): string | undefined

/** Keep only the last `days` days of a Toy's series. */
export function sliceToyStats(stats: ToyStats | undefined, days: number): ToyStats | undefined

/** The home dashboard numbers. */
export interface AccountSummary {
  readonly date: string | undefined
  readonly yesterdayPv: number
  readonly yesterdayUv: number
  readonly weekAgoPv: number
  readonly weekAgoUv: number
  readonly wowPercent: number | undefined
  readonly last7Pv: number
  readonly last7Uv: number
  /** Average daily UV over the seven-day window (not deduplicated across days). */
  readonly last7UvAvg: number
  /** The highest combined daily UV and its date inside the window. */
  readonly last7UvPeak: number
  readonly last7UvPeakDate: string | undefined
  /** The seven days before the last seven (date-13 … date-7). */
  readonly prev7Pv: number
  readonly prev7Uv: number
  /** 7-day PV/UV compared with the previous seven days; undefined without a base. */
  readonly wow7PvPercent: number | undefined
  readonly wow7UvPercent: number | undefined
  readonly interactions: {
    readonly like: number
    readonly favorite: number
    readonly comment: number
    readonly share: number
    readonly total: number
  }
  readonly portfolio: {
    readonly total: number
    readonly published: number
    readonly review: number
    readonly rejected: number
    readonly other: number
  }
  readonly measured: number
  readonly missing: number
}

/** Aggregate the account dashboard numbers. */
export function accountSummary(
  toys: readonly ToySummary[],
  statsById: ReadonlyMap<number, ToyStats | undefined>,
): AccountSummary
