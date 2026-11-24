/**
 * Type face for `src/client/filters.js`: the client-side Toy filters, ordering
 * and chart maths, kept in plain ESM so their node:test suite exercises the
 * JavaScript directly.
 */

import type { ToySummary } from '../shared/types.ts'

/** The grid's filter groups. */
export type StatusBucket = 'published' | 'review' | 'rejected' | 'other'

/** The grid's ordering. */
export type SortBy = 'updated' | 'created' | 'title'

/** Options for {@link filterToys}. */
export interface FilterOptions {
  readonly query?: string
  readonly status?: 'all' | StatusBucket
  readonly sort?: SortBy
  /** Locale used by the title comparison. */
  readonly locale?: string
}

/** Bucket a raw platform status into the grid's filter groups. */
export function statusBucket(status?: string): StatusBucket

/** Case-insensitive match on title, slug and id. */
export function matchToy(toy: Pick<ToySummary, 'id' | 'title'> & { readonly slug?: string | undefined }, query: string): boolean

/** Filter then order the loaded catalogue. */
export function filterToys(items: readonly ToySummary[], options?: FilterOptions): readonly ToySummary[]

/** Round a chart maximum up to a readable value. */
export function niceMax(value: number): number

/** The y-axis tick values from top to bottom for a chart maximum. */
export function chartTicks(max: number, count: number): readonly number[]
