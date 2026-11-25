/**
 * Small presentational primitives shared by the panel's views. Plain DOM
 * elements plus the stylesheet in `./styles.ts`; no framework components.
 */

import { createElement as h, useEffect, useRef, useState } from 'react'
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
  download: 'M12 4v11m-5-5 5 5 5-5M5 20h14',
  terminal: 'M4 5h16v14H4zM8 10l2 2-2 2M13 14h3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.5-1.5L21 21',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5a8 8 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2-1.2L15 3h-6l-.4 2.7a8 8 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5a8 8 0 0 0 0 2.4l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2 1.2L9 21h6l.4-2.7a8 8 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z',
  link: 'M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 1 0-5.7-5.7l-1 1M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 1 0 5.7 5.7l1-1',
  chevronDown: 'm6 9 6 6 6-6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13h.01M11 12h1v5h1',
  home: 'M4 11.2 12 4l8 7.2M6 9.8V20h12V9.8M10 20v-5h4v5',
  bell: 'M18 15V10a6 6 0 1 0-12 0v5l-2 3h16l-2-3ZM10 21h4',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 2V11.5a8.5 8.5 0 0 1 8.5-8.5h1A8.5 8.5 0 0 1 21 11.5Z',
  headset: 'M4 14a8 8 0 0 1 16 0M4 14v4a2 2 0 0 0 2 2h1v-6H4m16 0v4a2 2 0 0 1-2 2h-1v-6h3',
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
export function FailureBanner({
  failure,
  copy,
  actions,
}: {
  readonly failure: Failure
  readonly copy: Copy
  /** Optional next step, e.g. the permission application link. */
  readonly actions?: ReactNode
}): ReactNode {
  return h(
    Banner,
    {
      tone: 'error',
      title: copy.operationFailed(failure.message),
      ...(actions === undefined ? {} : { actions }),
    },
    h('span', { className: 'toy-caption' }, copy.errorKind(failure.kind)),
    failure.hint === undefined ? null : h('div', { className: 'toy-field-hint' }, `${copy.hintLabel}: ${failure.hint}`),
  )
}

/**
 * An official link that opens in a new tab, with the shared external glyph.
 * Pass `className: 'toy-btn'` where it should read as a button.
 */
export function ExternalLink({
  href,
  label,
  className = 'toy-link',
}: {
  readonly href: string
  readonly label: string
  readonly className?: string
}): ReactNode {
  return h('a', { className, href, target: '_blank', rel: 'noreferrer' }, h(Icon, { name: 'external' }), label)
}

/** Empty state. */
export function Empty({ children }: { readonly children?: ReactNode }): ReactNode {
  return h('div', { className: 'toy-empty' }, children ?? null)
}

/** A shimmer placeholder for content that is still loading. */
export function Skeleton({
  rows = 3,
  variant = 'lines',
}: {
  readonly rows?: number
  readonly variant?: 'lines' | 'cards'
}): ReactNode {
  if (variant === 'cards') {
    return h(
      'div',
      { className: 'toy-grid toy-grid-skeleton', 'aria-hidden': true },
      Array.from({ length: rows }, (_unused, index) =>
        h(
          'div',
          { key: String(index), className: 'toy-card toy-skeleton-card' },
          h('span', { className: 'toy-skeleton toy-skeleton-poster' }),
          h(
            'span',
            { className: 'toy-card-body' },
            h('span', { className: 'toy-skeleton toy-skeleton-line', style: { width: '72%' } }),
            h('span', { className: 'toy-skeleton toy-skeleton-line', style: { width: '52%' } }),
            h('span', { className: 'toy-skeleton toy-skeleton-line', style: { width: '38%' } }),
          ),
        ),
      ),
    )
  }
  return h(
    'div',
    { className: 'toy-skeleton-lines', 'aria-hidden': true },
    Array.from({ length: rows }, (_unused, index) =>
      h('span', {
        key: String(index),
        className: 'toy-skeleton toy-skeleton-line',
        style: { width: `${Math.max(35, 96 - index * 14)}%` },
      }),
    ),
  )
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

/** A copy-to-clipboard button that confirms for a moment after copying. */
export function CopyButton({
  value,
  label,
  copiedLabel,
  icon = 'copy',
  size = 'sm',
}: {
  readonly value: string
  readonly label: string
  readonly copiedLabel: string
  readonly icon?: 'copy' | 'link'
  readonly size?: 'sm'
}): ReactNode {
  const [copied, setCopied] = useState(false)
  const onCopy = (): void => {
    void navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      },
      () => {
        // Clipboard unavailable (non-secure context): the value stays selectable.
      },
    )
  }
  return h(
    Button,
    { size, onClick: onCopy, title: label },
    h(Icon, { name: copied ? 'check' : icon }),
    copied ? copiedLabel : label,
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

/**
 * Open dialogs, bottom-most first. Escape closes only the top one, so a
 * confirmation opened from the maintenance dialog does not also close it.
 */
const dialogStack: symbol[] = []

/** Focusable descendants of a dialog card. */
function focusableIn(card: HTMLElement | null): readonly HTMLElement[] {
  if (card === null) return []
  const selectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  return Array.from(card.querySelectorAll<HTMLElement>(selectors)).filter((element) => !element.hasAttribute('disabled'))
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
  const cardRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const id = Symbol('toy-dialog')
    dialogStack.push(id)
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = focusableIn(cardRef.current)[0]
    ;(first ?? cardRef.current)?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (dialogStack[dialogStack.length - 1] !== id) return
        event.stopImmediatePropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const list = focusableIn(cardRef.current)
      if (list.length === 0) return
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const index = active === null ? -1 : list.indexOf(active)
      if (event.shiftKey) {
        if (index <= 0) {
          event.preventDefault()
          list[list.length - 1]?.focus()
        }
      } else if (index === -1 || index === list.length - 1) {
        event.preventDefault()
        list[0]?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      const position = dialogStack.indexOf(id)
      if (position >= 0) dialogStack.splice(position, 1)
      previous?.focus()
    }
  }, [])

  return h(
    'div',
    {
      className: 'toy-dialog',
      role: 'presentation',
      onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) closeRef.current()
      },
    },
    h(
      'div',
      {
        className: 'toy-dialog-card',
        role: 'dialog',
        'aria-modal': true,
        'aria-label': title,
        tabIndex: -1,
        ref: cardRef,
      },
      h(
        'div',
        { className: 'toy-dialog-head' },
        h('strong', {}, title),
        h(
          'button',
          { type: 'button', className: 'toy-icon-btn', onClick: () => closeRef.current(), 'aria-label': closeLabel, title: closeLabel },
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
