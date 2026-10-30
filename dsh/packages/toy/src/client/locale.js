/**
 * The panel's locale source: follows the DSH `locale` service and notifies
 * subscribers when the language switches, so `useCopy` can ride
 * `useSyncExternalStore`.
 *
 * Kept in plain ESM (with the `locale.d.ts` type face) so the node:test suites
 * can exercise the state machine directly, like the host-side `src/tools.js`.
 * React lives in `i18n.ts`; this module has no dependency on it.
 *
 * @module dsh-toy/client-locale
 */

/**
 * The subset of the DSH `locale` service the page needs.
 * @typedef {object} LocaleService
 * @property {() => { readonly active?: string } | undefined} getLocale
 * @property {(listener: () => void) => () => void} [subscribe]
 */

/**
 * The host context needed to look the locale service up.
 * @typedef {object} LocaleContext
 * @property {(serviceKey: string) => unknown} get
 */

/** True when a locale tag names Chinese. */
export function isChineseLocale(active) {
  return typeof active === 'string' && active.toLowerCase().startsWith('zh')
}

/** True when the browser prefers Chinese. */
export function prefersChinese() {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
}

/**
 * Look the optional locale service up; a missing or failing lookup is fine.
 * @param {LocaleContext | undefined} context
 * @returns {LocaleService | undefined}
 */
function lookup(context) {
  if (context === undefined || typeof context.get !== 'function') return undefined
  try {
    return /** @type {LocaleService | undefined} */ (context.get('locale'))
  } catch {
    return undefined
  }
}

/**
 * Create a locale source bound to one client context at a time.
 *
 * - `bind` follows a context; a later bind supersedes an earlier one and the
 *   superseded disposer is a no-op.
 * - The service is re-resolved on every read and subscribe, so a locale
 *   service that registers after the panel mounted is still sampled and
 *   subscribed, and a replaced instance is re-subscribed instead of pinning a
 *   stale one.
 * - `subscribe` and `snapshot` are stable, so `useSyncExternalStore` can take
 *   them directly; `snapshot` is `''` while no service is available (the
 *   caller then falls back to the browser language).
 */
export function createLocaleSource() {
  /** @type {LocaleContext | undefined} */
  let context
  /** @type {LocaleService | undefined} */
  let service
  /** @type {(() => void) | undefined} */
  let unsubscribe
  /** @type {object | undefined} */
  let owner
  const listeners = new Set()

  function notify() {
    for (const listener of [...listeners]) listener()
  }

  function detach() {
    try {
      unsubscribe?.()
    } catch {
      // The service may already be gone with the page or plugin.
    }
    unsubscribe = undefined
    service = undefined
  }

  /**
   * Resolve the service and (re)attach the change subscription. Called from
   * every read and from `subscribe`, which is where a late service becomes
   * observable; a guard keeps the attach idempotent when React re-renders.
   */
  function sync() {
    const next = lookup(context)
    if (next === service) return service
    detach()
    service = next
    if (service !== undefined && typeof service.subscribe === 'function') {
      try {
        unsubscribe = service.subscribe(notify)
      } catch {
        unsubscribe = undefined
      }
    }
    return service
  }

  /** The active locale tag, or undefined when the service is not available. */
  function active() {
    try {
      const value = sync()?.getLocale?.()?.active
      return typeof value === 'string' && value !== '' ? value : undefined
    } catch {
      return undefined
    }
  }

  /** Stable `useSyncExternalStore` snapshot; `''` means "use the fallback". */
  function snapshot() {
    return active() ?? ''
  }

  /** Stable `useSyncExternalStore` subscription. */
  function subscribe(listener) {
    listeners.add(listener)
    sync()
    return () => {
      listeners.delete(listener)
    }
  }

  /**
   * Follow a client context. Call it from `ctx.effect` and dispose with the
   * returned function.
   * @param {LocaleContext | undefined} nextContext
   * @returns {() => void}
   */
  function bind(nextContext) {
    const token = {}
    detach()
    owner = token
    context = nextContext
    sync()
    return () => {
      if (owner !== token) return
      detach()
      context = undefined
      owner = undefined
    }
  }

  return { bind, subscribe, snapshot, active }
}
