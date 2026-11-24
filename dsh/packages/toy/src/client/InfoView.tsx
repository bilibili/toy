/**
 * "更多信息": the official docs and the developer FAQ as embedded public pages.
 *
 * The page does not scrape unpublished APIs or host a second login. Each entry
 * is a public URL opened in an in-panel iframe, with an explicit open-in-browser
 * fallback for sites that refuse framing.
 */

import { createElement as h, useState } from 'react'
import type { ReactNode } from 'react'

import { EmbedView } from './EmbedView.tsx'
import type { Copy } from './i18n.ts'
import { TOY_LINKS } from './links.ts'
import { SectionHead } from './ui.tsx'

type EntryId = 'faq' | 'sdk' | 'cli' | 'guide' | 'whitepaper' | 'square'

interface Entry {
  readonly id: EntryId
  readonly title: string
  readonly desc: string
  readonly url: string
}

export function InfoView({
  copy,
  active,
}: {
  readonly copy: Copy
  readonly active: boolean
}): ReactNode {
  const [selected, setSelected] = useState<EntryId>('faq')
  const entries: readonly Entry[] = [
    { id: 'faq', title: copy.infoFaq, desc: copy.infoFaqDesc, url: TOY_LINKS.faq },
    { id: 'sdk', title: copy.infoSdk, desc: copy.infoSdkDesc, url: TOY_LINKS.sdk },
    { id: 'cli', title: copy.infoCli, desc: copy.infoCliDesc, url: TOY_LINKS.cli },
    { id: 'guide', title: copy.infoGuide, desc: copy.infoGuideDesc, url: TOY_LINKS.guide },
    { id: 'whitepaper', title: copy.infoWhitepaper, desc: copy.infoWhitepaperDesc, url: TOY_LINKS.whitepaper },
    { id: 'square', title: copy.infoSquare, desc: copy.infoSquareDesc, url: TOY_LINKS.square },
  ]
  const current: Entry = entries.find((entry) => entry.id === selected) ?? {
    id: 'faq',
    title: copy.infoFaq,
    desc: copy.infoFaqDesc,
    url: TOY_LINKS.faq,
  }

  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h(SectionHead, { title: copy.infoTitle, sub: copy.infoSubtitle }),
    h(
      'div',
      { className: 'toy-info-layout' },
      h(
        'nav',
        { className: 'toy-info-nav', 'aria-label': copy.infoTitle },
        entries.map((entry) =>
          h(
            'button',
            {
              key: entry.id,
              type: 'button',
              className: 'toy-info-nav-item',
              'aria-current': entry.id === selected ? 'page' : undefined,
              onClick: () => setSelected(entry.id),
            },
            h('span', { className: 'toy-info-nav-title' }, entry.title),
            h('span', { className: 'toy-caption' }, entry.desc),
          ),
        ),
      ),
      h(EmbedView, {
        key: selected,
        copy,
        title: current.title,
        description: copy.infoEmbedHint,
        url: current.url,
        active,
      }),
    ),
  )
}
