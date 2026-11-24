/**
 * An in-panel embedded public page (the Q&A forum and each More-info entry):
 * a live iframe with refresh and an open-in-browser fallback. The iframe only
 * mounts once the enclosing tab is actually visited.
 */

import { createElement as h, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import type { Copy } from './i18n.ts'
import { Button, Icon } from './ui.tsx'

export function EmbedView({
  copy,
  title,
  description,
  url,
  active,
}: {
  readonly copy: Copy
  readonly title: string
  readonly description: string
  readonly url: string
  readonly active: boolean
}): ReactNode {
  const [mounted, setMounted] = useState(false)
  const [bump, setBump] = useState(0)

  useEffect(() => {
    if (active) setMounted(true)
  }, [active])

  if (!mounted) return null
  return h(
    'div',
    { className: 'toy-doc-pane toy-doc-pane-embed' },
    h(
      'div',
      { className: 'toy-doc-head' },
      h('div', { className: 'toy-section-title' }, title),
      h('span', { className: 'toy-caption' }, description),
      h('span', { className: 'toy-spacer' }),
      h(Button, { size: 'sm', onClick: () => setBump((value) => value + 1) }, h(Icon, { name: 'refresh' }), copy.refresh),
      h(
        'a',
        { className: 'toy-btn', href: url, target: '_blank', rel: 'noreferrer', 'data-size': 'sm' },
        h(Icon, { name: 'external' }),
        copy.infoOpenExternal,
      ),
    ),
    h('iframe', {
      key: `embed-${bump}`,
      className: 'toy-doc-frame',
      src: url,
      title,
      loading: 'lazy',
      referrerPolicy: 'no-referrer',
    }),
  )
}
