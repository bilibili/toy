/**
 * "更多信息": a hub of official public links.
 *
 * Every entry opens in the system browser. The panel intentionally does not
 * host web sessions, scrape unpublished APIs or re-layout remote page content;
 * that belongs to a future official CLI/docs capability.
 */

import { createElement as h } from 'react'
import type { ReactNode } from 'react'

import type { Copy } from './i18n.ts'
import { TOY_LINKS } from './links.ts'
import { Icon, SectionHead } from './ui.tsx'

export function InfoView({ copy }: { readonly copy: Copy }): ReactNode {
  const entries: readonly { readonly title: string; readonly desc: string; readonly url: string }[] = [
    { title: copy.infoPermission, desc: copy.infoPermissionDesc, url: TOY_LINKS.apply },
    { title: copy.infoFaq, desc: copy.infoFaqDesc, url: TOY_LINKS.faq },
    { title: copy.infoSdk, desc: copy.infoSdkDesc, url: TOY_LINKS.sdk },
    { title: copy.infoCli, desc: copy.infoCliDesc, url: TOY_LINKS.cli },
    { title: copy.infoGuide, desc: copy.infoGuideDesc, url: TOY_LINKS.guide },
    { title: copy.infoWhitepaper, desc: copy.infoWhitepaperDesc, url: TOY_LINKS.whitepaper },
    { title: copy.infoSquare, desc: copy.infoSquareDesc, url: TOY_LINKS.square },
  ]
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h(SectionHead, { title: copy.infoTitle, sub: copy.infoSubtitle }),
    h(
      'div',
      { className: 'toy-info-grid' },
      entries.map((entry) =>
        h(
          'a',
          {
            key: entry.url,
            className: 'toy-info-card',
            href: entry.url,
            target: '_blank',
            rel: 'noreferrer',
          },
          h('span', { className: 'toy-info-card-head' }, h('span', { className: 'toy-info-nav-title' }, entry.title), h(Icon, { name: 'external', size: 14 })),
          h('span', { className: 'toy-caption' }, entry.desc),
        ),
      ),
    ),
  )
}
