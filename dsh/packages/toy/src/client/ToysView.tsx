/**
 * The "我的 Toy" tab: a refreshable card grid, the selected Toy's detail card,
 * and shortcuts into Stats and the update form.
 */

import { createElement as h, useState } from 'react'
import type { ReactNode } from 'react'

import type { Failure } from './api.ts'
import { formatUnixTime, statusTone, toyPageUrl, visibilityLabel } from './api.ts'
import type { Copy } from './i18n.ts'
import { Badge, Button, Empty, FailureBanner, Icon, Loading, SectionHead, Toolbar } from './ui.tsx'
import type { ToyListPage, ToySummary } from '../shared/types.ts'

/** Poster with a graceful fallback when the CDN image fails or is absent. */
function Poster({
  src,
  alt,
  className = 'toy-poster',
  iconSize = 20,
}: {
  readonly src?: string
  readonly alt: string
  readonly className?: string
  readonly iconSize?: number
}): ReactNode {
  const [failed, setFailed] = useState(false)
  if (src !== undefined && src !== '' && !failed) {
    return h('img', {
      className,
      src,
      alt,
      loading: 'lazy',
      referrerPolicy: 'no-referrer',
      onError: () => setFailed(true),
    })
  }
  return h(
    'div',
    { className, 'data-fallback': 'true', role: 'img', 'aria-label': alt },
    h(Icon, { name: 'box', size: iconSize }),
  )
}

/** One grid card. */
function ToyCard({
  toy,
  copy,
  zh,
  selected,
  onSelect,
}: {
  readonly toy: ToySummary
  readonly copy: Copy
  readonly zh: boolean
  readonly selected: boolean
  readonly onSelect: () => void
}): ReactNode {
  return h(
    'button',
    {
      type: 'button',
      className: 'toy-card',
      'data-selected': selected ? 'true' : 'false',
      'aria-pressed': selected,
      onClick: onSelect,
    },
    h(Poster, { ...(toy.posterUrl === undefined ? {} : { src: toy.posterUrl }), alt: copy.posterAlt }),
    h(
      'span',
      { className: 'toy-card-body' },
      h('span', { className: 'toy-card-title', title: toy.title }, toy.title),
      h('span', { className: 'toy-card-sub' }, `${copy.idLabel} ${toy.id}${toy.slug === undefined ? '' : ` · ${toy.slug}`}`),
      h(
        'span',
        { className: 'toy-badges' },
        toy.status === undefined ? null : h(Badge, { tone: statusTone(toy.status) }, toy.status),
        toy.visibility === undefined ? null : h(Badge, {}, visibilityLabel(toy.visibility, zh)),
        toy.watermark === true ? h(Badge, {}, copy.watermarkLabel) : null,
      ),
      h(
        'span',
        { className: 'toy-card-sub' },
        `${copy.updatedAt} ${formatUnixTime(toy.mtime)}`,
      ),
    ),
  )
}

/** The selected Toy's detail card with actions. */
function ToyDetail({
  toy,
  copy,
  zh,
  onOpenStats,
  onUpdate,
}: {
  readonly toy: ToySummary
  readonly copy: Copy
  readonly zh: boolean
  readonly onOpenStats: () => void
  readonly onUpdate: () => void
}): ReactNode {
  const url = toyPageUrl(toy)
  const line = (label: string, value: ReactNode): ReactNode =>
    h(
      'div',
      { className: 'toy-field-line' },
      h('span', { className: 'toy-field-line-label' }, label),
      h('span', { className: 'toy-field-line-value', title: typeof value === 'string' ? value : undefined }, value),
    )
  return h(
    'div',
    { className: 'toy-panel', style: { display: 'flex', flexDirection: 'column', gap: 12 } },
    h(SectionHead, { title: copy.detailTitle, sub: toy.title }),
    h(
      'div',
      { className: 'toy-detail' },
      h(
        'div',
        { className: 'toy-detail-main' },
        h(Poster, {
          ...(toy.posterUrl === undefined ? {} : { src: toy.posterUrl }),
          alt: copy.posterAlt,
          className: 'toy-detail-poster',
          iconSize: 32,
        }),
        h(
          'div',
          { className: 'toy-detail-fields' },
          line(copy.idLabel, String(toy.id)),
          line(copy.slugLabel, toy.slug ?? '—'),
          line(copy.statusLabel, h(Badge, { tone: statusTone(toy.status) }, toy.status ?? '—')),
          line(copy.visibilityLabel, visibilityLabel(toy.visibility, zh)),
          line(copy.categoryLabel, toy.category ?? '—'),
          line(copy.themeLabel, toy.theme ?? '—'),
          line(copy.watermarkLabel, toy.watermark === true ? copy.watermarkOn : toy.watermark === false ? copy.watermarkOff : '—'),
          line(copy.createdAt, formatUnixTime(toy.ctime)),
          line(copy.updatedAt, formatUnixTime(toy.mtime)),
        ),
      ),
      h(
        'div',
        { className: 'toy-detail-actions' },
        url === undefined
          ? null
          : h(
              'a',
              { className: 'toy-link', href: url, target: '_blank', rel: 'noreferrer' },
              h(Icon, { name: 'external' }),
              ' ',
              copy.openToyPage,
            ),
        h(Button, { onClick: onOpenStats }, h(Icon, { name: 'chart' }), copy.viewStats),
        h(Button, { variant: 'primary', onClick: onUpdate }, h(Icon, { name: 'plus' }), copy.updateToy),
      ),
    ),
  )
}

/** The "我的 Toy" tab. */
export function ToysView({
  copy,
  zh,
  page,
  busy,
  error,
  selected,
  onRefresh,
  onSelect,
  onOpenStats,
  onUpdate,
  onPage,
}: {
  readonly copy: Copy
  readonly zh: boolean
  readonly page: ToyListPage | undefined
  readonly busy: boolean
  readonly error: Failure | undefined
  readonly selected: ToySummary | undefined
  /** Kept for symmetry with the other views; the grid is always mounted. */
  readonly active?: boolean
  readonly onRefresh: () => void
  readonly onSelect: (toy: ToySummary) => void
  readonly onOpenStats: (toy: ToySummary) => void
  readonly onUpdate: (toy: ToySummary) => void
  readonly onPage: (page: number) => void
}): ReactNode {
  const items = page?.items ?? []
  const total = page?.total ?? 0
  const pageNumber = page?.page ?? 1
  const pageSize = page?.size ?? items.length
  const hasPrev = pageNumber > 1
  const hasNext = pageSize > 0 && pageNumber * pageSize < total
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h(SectionHead, {
      title: copy.toysTitle,
      ...(page === undefined ? {} : { sub: copy.toysCount(total) }),
      actions: h(Button, { onClick: onRefresh, disabled: busy, title: copy.refreshToys }, h(Icon, { name: 'refresh' }), busy ? copy.loading : copy.refresh),
    }),
    h('div', { className: 'toy-caption' }, copy.toysHint),
    error === undefined ? null : h(FailureBanner, { failure: error, copy }),
    busy && page === undefined ? h(Loading, { label: copy.toysLoading }) : null,
    page !== undefined && items.length === 0 ? h(Empty, {}, copy.toysEmpty) : null,
    items.length === 0
      ? null
      : h(
          'div',
          { className: 'toy-grid' },
          items.map((toy) =>
            h(ToyCard, {
              key: String(toy.id),
              toy,
              copy,
              zh,
              selected: selected?.id === toy.id,
              onSelect: () => onSelect(toy),
            }),
          ),
        ),
    selected === undefined
      ? null
      : h(ToyDetail, {
          toy: selected,
          copy,
          zh,
          onOpenStats: () => onOpenStats(selected),
          onUpdate: () => onUpdate(selected),
        }),
    total > 0
      ? h(
          Toolbar,
          {},
          h(
            Button,
            { onClick: () => onPage(Math.max(1, pageNumber - 1)), disabled: busy || !hasPrev, size: 'sm' },
            h(Icon, { name: 'chevronLeft' }),
            copy.pagePrev,
          ),
          h('span', { className: 'toy-caption' }, copy.pageLabel(pageNumber, total)),
          h(
            Button,
            { onClick: () => onPage(pageNumber + 1), disabled: busy || !hasNext, size: 'sm' },
            copy.pageNext,
            h(Icon, { name: 'chevronRight' }),
          ),
        )
      : null,
  )
}
