/**
 * Type face for `src/client/locale.js`: the locale state machine, kept in
 * plain ESM so its node:test suite exercises the JavaScript directly.
 */

/** The subset of the DSH `locale` service the page needs. */
export interface LocaleService {
  getLocale(): { readonly active?: string } | undefined
  subscribe?(listener: () => void): () => void
}

/** The host context needed to look the locale service up. */
export interface LocaleContext {
  get(serviceKey: string): unknown
}

/** A locale source bound to one client context at a time. */
export interface LocaleSource {
  bind(context: LocaleContext | undefined): () => void
  subscribe(listener: () => void): () => void
  snapshot(): string
  active(): string | undefined
}

/** True when a locale tag names Chinese. */
export function isChineseLocale(active: string | undefined): boolean

/** True when the browser prefers Chinese. */
export function prefersChinese(): boolean

/** Create a locale source; see the module comment in `locale.js`. */
export function createLocaleSource(): LocaleSource
