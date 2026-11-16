/**
 * Grid paging over the Toy catalogue the panel reads once.
 *
 * The Host pages `mylist` (50 per call at most); the panel keeps every card and
 * slices it here, so switching pages is instant and the Stats / Publish pickers
 * can offer a Toy that is not on the visible page.
 *
 * Kept in plain ESM (with the `paging.d.ts` type face) so the node:test suite
 * can exercise the page maths directly, like `locale.js`. React lives in
 * `ToyPanel.tsx`; this module has no dependency on it.
 *
 * @module dsh-toy/client-paging
 */

/**
 * The slice of the catalogue one grid page shows. A stale page number (the
 * account shrank since the last render) is clamped into range instead of
 * showing an empty grid, and `hasNext` only means "there are loaded cards
 * after this page".
 *
 * @param {{ readonly total: number, readonly items: readonly import('../shared/types.ts').ToySummary[] }} catalogue
 * @param {number} pageNumber
 * @param {number} pageSize
 * @returns {import('../shared/types.ts').ToyListPage}
 */
export function slicePage(catalogue, pageNumber, pageSize) {
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.trunc(pageSize)) : 1
  const count = catalogue.items.length
  const pages = Math.max(1, Math.ceil(count / size))
  const requested = Number.isFinite(pageNumber) ? Math.trunc(pageNumber) : 1
  const page = Math.min(Math.max(1, requested), pages)
  const start = (page - 1) * size
  return {
    total: catalogue.total,
    page,
    size,
    pages,
    hasNext: page < pages,
    items: catalogue.items.slice(start, start + size),
  }
}
