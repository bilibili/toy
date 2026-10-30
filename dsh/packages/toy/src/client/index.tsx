/**
 * @bilibili/dsh-toy — browser half.
 *
 * Mounts the generated Remote contribution and contributes:
 * - a sidebar icon (`sidebar.panellist`, id `toy-publisher`);
 * - the matching full page in the main column (`main`, key `toy-publisher`);
 * - a compact account summary on the bundle's own Plugins page
 *   (`plugins.bundle.config`, keyed by the bundle package name).
 *
 * The full page lives in `./ToyPanel.tsx`, the summary in `./BundleSummary.tsx`.
 */

import { createElement as h } from 'react'
import type { ReactNode } from 'react'

import remote from '@bilibili/dsh-toy/remote'

import type { ToyNamespace } from './api.ts'
import { bindLocale } from './i18n.ts'
import { ToyBundleSummary } from './BundleSummary.tsx'
import { ToyPanel } from './ToyPanel.tsx'

/** Plugin name, matching the host half and the bundle row. */
export const name = 'toy-client'

/** `remote` and `slots` must exist before apply runs. */
export const inject = ['remote', 'slots']

/** Bundle package name: the key of `plugins.bundle.config`. */
const PACKAGE_NAME = '@bilibili/dsh-toy'
/** Panel id shared by the sidebar entry and the main panel. */
const PANEL_ID = 'toy-publisher'

interface SlotRegistration {
  readonly name: string
  readonly key?: string
  readonly id?: string
  readonly order?: number
  readonly label?: string | (() => string)
}

interface SlotsService {
  inject(slot: string, contribute: () => unknown): void
  register(registration: SlotRegistration, component: (props: any) => ReactNode): () => void
}

interface LayoutService {
  selectPanel(panelId: string): void
}

interface ClientContext {
  readonly remote: { $mount(info: unknown): Promise<() => void> }
  readonly slots: SlotsService
  get(serviceKey: string): unknown
  effect(dispose: () => void | (() => void), label?: string): void
}

/** Sidebar icon: a small package/box glyph in the current text color. */
function ToyPanelIcon({ size }: { readonly size: number }): ReactNode {
  // The bilibili Toy mark: a dark "T" carrying the five brand-coloured tiles.
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 48 48', 'aria-hidden': true, style: { flex: '0 0 auto' } },
    h('path', {
      fill: '#18191C',
      d: 'M4 1h40a3 3 0 0 1 3 3v15H33v26a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3V19H1V4a3 3 0 0 1 3-3Z',
    }),
    h('rect', { x: 5, y: 5, width: 9, height: 9, rx: 2, fill: '#00AEEC' }),
    h('rect', { x: 20, y: 5, width: 9, height: 9, rx: 2, fill: '#FF6699' }),
    h('rect', { x: 34, y: 5, width: 9, height: 9, rx: 2, fill: '#FFDC40' }),
    h('rect', { x: 20, y: 20, width: 9, height: 9, rx: 2, fill: '#2AC864' }),
    h('rect', { x: 20, y: 34, width: 9, height: 9, rx: 2, fill: '#AC6DFF' }),
  )
}

/**
 * A shortcut from the bundle's Plugins page to the full panel.
 *
 * The layout service is resolved lazily at click time: `apply` may run before
 * the shell provides `layout`, but by the time a user clicks the button it is
 * always there. Without it the shortcut is a harmless no-op.
 */
function resolveOpenPanel(ctx: ClientContext): () => void {
  return () => {
    try {
      const layout = ctx.get('layout') as Partial<LayoutService> | undefined
      layout?.selectPanel?.(PANEL_ID)
    } catch {
      // The main key is not mounted (e.g. the panel was disabled): ignore.
    }
  }
}

/** Mount the Remote contribution and register the panel + bundle page. */
export async function apply(ctx: ClientContext): Promise<void> {
  const disposeMount = await ctx.remote.$mount(remote as unknown)
  ctx.effect(() => disposeMount, 'toy: remote mount')

  // The locale service is optional: without it the copy falls back to the
  // browser language. The context is kept so a service registered after this
  // plugin is still sampled; the copy hooks re-render on a language switch.
  ctx.effect(() => bindLocale(ctx), 'toy: locale binding')

  const namespace = ctx.get('remote.toyPublisher')
  if (namespace === undefined) {
    throw new Error('toy: the Remote namespace did not register after $mount')
  }
  const ns = namespace as ToyNamespace
  const onOpenPanel = resolveOpenPanel(ctx)

  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, () => h(ToyPanel, { ns })),
  )
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 0, label: () => 'bilibili Toy' }, ToyPanelIcon),
  )
  ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register(
      { name: 'plugins.bundle.config', key: PACKAGE_NAME },
      (props) => {
        const view = (props as { readonly view?: 'summary' | 'page' }).view ?? 'page'
        return h(ToyBundleSummary, { ns, view, onOpenPanel })
      },
    ),
  )
}
