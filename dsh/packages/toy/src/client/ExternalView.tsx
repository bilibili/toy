/**
 * A small landing card for a一级 entry that lives on another site (the Q&A
 * forum and the WeCom review support). The tab click already opens the link;
 * this view is the fallback when the popup was blocked and the place to click
 * again later.
 */

import { createElement as h } from 'react'
import type { ReactNode } from 'react'

import type { Copy } from './i18n.ts'
import { Icon } from './ui.tsx'

export function ExternalView({
  copy,
  title,
  description,
  href,
  buttonLabel,
}: {
  readonly copy: Copy
  readonly title: string
  readonly description: string
  readonly href: string
  readonly buttonLabel: string
}): ReactNode {
  return h(
    'div',
    { className: 'toy-external' },
    h('div', { className: 'toy-external-icon' }, h(Icon, { name: 'external', size: 20 })),
    h('h2', { className: 'toy-external-title' }, title),
    h('p', { className: 'toy-external-sub' }, description),
    h(
      'a',
      { className: 'toy-btn', href, target: '_blank', rel: 'noreferrer', 'data-variant': 'primary' },
      h(Icon, { name: 'external', size: 14 }),
      buttonLabel,
    ),
    h('p', { className: 'toy-caption' }, copy.externalHint),
    h('p', { className: 'toy-mono toy-external-url' }, href),
  )
}
