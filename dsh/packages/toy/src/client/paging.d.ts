/**
 * Type face for `src/client/paging.js`: the catalogue -> grid page maths, kept
 * in plain ESM so its node:test suite exercises the JavaScript directly.
 */

import type { ToyListPage, ToySummary } from '../shared/types.ts'

/** Every Toy the panel loaded, plus the account total the Host reported. */
export interface ToyCatalogue {
  readonly total: number
  readonly items: readonly ToySummary[]
}

/**
 * The slice of the catalogue one grid page shows; a stale page number is
 * clamped into range.
 */
export function slicePage(catalogue: ToyCatalogue, pageNumber: number, pageSize: number): ToyListPage
