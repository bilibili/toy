/**
 * Small presentational primitives shared by the panel's views. Plain DOM
 * elements plus the stylesheet in `./styles.ts`; no framework components.
 */

import { createElement as h, useEffect } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'

import type { Failure } from './api.ts'
import type { Copy } from './i18n.ts'

/** A stroked 24x24 glyph path, rendered in `currentColor`. */
const GLYPHS = {
  refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  check: 'm5 13 4 4L19 7',
  warn: 'M12 3 2.6 19.5h18.8L12 3Zm0 6v5M12 17h.01',
  close: 'm6 6 12 12M18 6 6 18',
  chart: 'M4 20V10M10 20V5M16 20v-7M22 20H2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2',
  box: 'M12 3.2 20 7.4v9.2L12 20.8 4 16.6V7.4zM4 7.4l8 4.2 8-4.2M12 11.6v9.2',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  login: 'M14 4h5v16h-5M10 8l4 4-4 4M3 12h11',
  logout: 'M10 4H5v16h5M14 8l4 4-4 4M21 12H10',
  chevronLeft: 'm14 6-6 6 6 6',
  chevronRight: 'm10 6 6 6-6 6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0',
  copy: 'M9 9h11v11H9zM4 15V4h11',
  terminal: 'M4 5h16v14H4zM8 10l2 2-2 2M13 14h3',
} as const

/** Glyph names available to {@link Icon}. */
export type GlyphName = keyof typeof GLYPHS

/** One inline stroked icon. */
export function Icon({ name, size = 15 }: { readonly name: GlyphName; readonly size?: number }): ReactNode {
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': true,
      focusable: false,
      style: { flex: '0 0 auto' },
    },
    h('path', {
      d: GLYPHS[name],
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  )
}

/** Busy spinner plus an optional label. */
export function Loading({ label }: { readonly label?: string }): ReactNode {
  return h(
    'div',
    { className: 'toy-loading', role: 'status', 'aria-live': 'polite' },
    h('span', { className: 'toy-spinner', 'aria-hidden': true }),
    h('span', {}, label ?? ''),
  )
}

/** A small status pill. */
export function Badge({ children, tone }: { readonly children?: ReactNode; readonly tone?: 'ok' | 'warn' | 'error' | 'info' }): ReactNode {
  return h('span', { className: 'toy-badge', ...(tone === undefined ? {} : { 'data-tone': tone }) }, children ?? null)
}

/** An inline message banner. */
export function Banner({
  tone = 'info',
  title,
  children,
  actions,
}: {
  readonly tone?: 'info' | 'warn' | 'error' | 'success'
  readonly title?: string
  readonly children?: ReactNode
  readonly actions?: ReactNode
}): ReactNode {
  return h(
    'div',
    { className: 'toy-banner', 'data-tone': tone, role: tone === 'error' ? 'alert' : undefined },
    title === undefined ? null : h('div', { className: 'toy-banner-title' }, title),
    children === undefined || children === null ? null : h('div', {}, children),
    actions === undefined ? null : h('div', { className: 'toy-banner-actions' }, actions),
  )
}

/** Render a normalized failure with its kind and hint. */
export function FailureBanner({ failure, copy }: { readonly failure: Failure; readonly copy: Copy }): ReactNode {
  return h(
    Banner,
    { tone: 'error', title: copy.operationFailed(failure.message) },
    h('span', { className: 'toy-caption' }, copy.errorKind(failure.kind)),
    failure.hint === undefined ? null : h('div', { className: 'toy-field-hint' }, `${copy.hintLabel}: ${failure.hint}`),
  )
}

/** Empty state. */
export function Empty({ children }: { readonly children?: ReactNode }): ReactNode {
  return h('div', { className: 'toy-empty' }, children ?? null)
}

/** A labelled form field. */
export function Field({
  label,
  hint,
  error,
  span = false,
  children,
}: {
  readonly label?: string
  readonly hint?: string
  readonly error?: string
  readonly span?: boolean
  readonly children?: ReactNode
}): ReactNode {
  return h(
    'div',
    { className: span ? 'toy-field toy-span-2' : 'toy-field' },
    label === undefined ? null : h('label', {}, label),
    children,
    hint === undefined ? null : h('div', { className: 'toy-field-hint' }, hint),
    error === undefined ? null : h('div', { className: 'toy-field-error', role: 'alert' }, error),
  )
}

/** A flex row of controls/buttons. */
export function Toolbar({ children }: { readonly children?: ReactNode }): ReactNode {
  return h('div', { className: 'toy-toolbar' }, children ?? null)
}

/** Section head with optional description and trailing controls. */
export function SectionHead({
  title,
  sub,
  actions,
}: {
  readonly title: ReactNode
  readonly sub?: ReactNode
  readonly actions?: ReactNode
}): ReactNode {
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' } },
    h(
      'div',
      { style: { minWidth: 0 } },
      h('div', { className: 'toy-section-title' }, title),
      sub === undefined ? null : h('div', { className: 'toy-section-sub' }, sub),
    ),
    actions === undefined ? null : h('div', { className: 'toy-toolbar' }, actions),
  )
}

/** A label/value line. */
export function KeyValue({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return h(
    'div',
    { className: 'toy-kv' },
    h('span', { className: 'toy-kv-label' }, label),
    h('span', { className: 'toy-kv-value' }, children),
  )
}

/** A KPI tile. */
export function Kpi({ label, value, sub }: { readonly label: string; readonly value: ReactNode; readonly sub?: string }): ReactNode {
  return h(
    'div',
    { className: 'toy-kpi' },
    h('span', { className: 'toy-kpi-label' }, label),
    h('span', { className: 'toy-kpi-value' }, value),
    sub === undefined ? null : h('span', { className: 'toy-kpi-sub' }, sub),
  )
}

/** In-page modal dialog: no `alert()`/`confirm()`, Escape and backdrop close. */
export function Dialog({
  title,
  closeLabel,
  children,
  footer,
  onClose,
}: {
  readonly title: string
  readonly closeLabel: string
  readonly children?: ReactNode
  readonly footer?: ReactNode
  readonly onClose: () => void
}): ReactNode {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return h(
    'div',
    {
      className: 'toy-dialog',
      role: 'presentation',
      onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose()
      },
    },
    h(
      'div',
      { className: 'toy-dialog-card', role: 'dialog', 'aria-modal': true, 'aria-label': title },
      h(
        'div',
        { className: 'toy-dialog-head' },
        h('strong', {}, title),
        h(
          'button',
          { type: 'button', className: 'toy-icon-btn', onClick: onClose, 'aria-label': closeLabel, title: closeLabel },
          h(Icon, { name: 'close' }),
        ),
      ),
      h('div', { className: 'toy-dialog-body' }, children),
      footer === undefined ? null : h('div', { className: 'toy-dialog-foot' }, footer),
    ),
  )
}

/** A plain button with icon support. */
export function Button({
  children,
  onClick,
  variant,
  size,
  disabled,
  title,
  type = 'button',
  pressed,
}: {
  readonly children?: ReactNode
  readonly onClick?: () => void
  readonly variant?: 'primary' | 'danger'
  readonly size?: 'sm'
  readonly disabled?: boolean
  readonly title?: string
  readonly type?: 'button' | 'submit'
  readonly pressed?: boolean
}): ReactNode {
  return h(
    'button',
    {
      type,
      className: 'toy-btn',
      onClick: onClick === undefined ? undefined : () => onClick(),
      ...(variant === undefined ? {} : { 'data-variant': variant }),
      ...(size === undefined ? {} : { 'data-size': size }),
      ...(pressed === undefined ? {} : { 'data-pressed': pressed ? 'true' : 'false', 'aria-pressed': pressed }),
      ...(disabled === true ? { disabled: true } : {}),
      ...(title === undefined ? {} : { title }),
    },
    children,
  )
}
