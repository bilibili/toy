/**
 * The "我的 Toy" tab: a searchable, filterable Toy workspace.
 *
 * The left column holds the toolbar, card grid and pager; the selected Toy's
 * details and actions live in a sticky side panel so selecting a card never
 * pushes the list around. Data paging is local: the panel loads the whole
 * catalogue once (see ToyPanel) and this view slices the filtered result.
 */

import { createElement as h, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'

import type { Failure } from './api.ts'
import { formatUnixTime, statusTone, toyPageUrl, visibilityLabel } from './api.ts'
import { filterToys } from './filters.js'
import type { SortBy } from './filters.js'
import type { Copy } from './i18n.ts'
import { TOY_LINKS } from './links.ts'
import { slicePage } from './paging.js'
import { Badge, Button, CopyButton, Empty, FailureBanner, Icon, Skeleton } from './ui.tsx'
import type { ToySummary } from '../shared/types.ts'

/** Cards per page. */
const PAGE_SIZE = 20

type StatusFilter = 'all' | 'published' | 'review' | 'rejected' | 'other'

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
      h('span', { className: 'toy-card-sub' }, `${copy.lastUpdatedLabel} ${formatUnixTime(toy.mtime)}`),
    ),
  )
}

/** The selected Toy's detail card with actions, rendered in the side column. */
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
  // The Host normalizes the server's enum to the lowercase create flag.
  const passwordProtected = toy.visibility?.toLowerCase() === 'password'
  const passwordView = !passwordProtected
    ? null
    : h(
        'div',
        { className: 'toy-password-error' },
        h('span', { className: 'toy-caption' }, copy.passwordLocked),
        h('span', { className: 'toy-caption' }, copy.passwordLockedHint),
        h(Button, { size: 'sm', onClick: onUpdate }, copy.passwordReset),
        h(
          'a',
          {
            className: 'toy-btn',
            href: TOY_LINKS.publishRecords,
            target: '_blank',
            rel: 'noreferrer',
            'data-size': 'sm',
          },
          h(Icon, { name: 'external' }),
          copy.infoOpenPlatform,
        ),
      )

  const line = (label: string, value: ReactNode): ReactNode =>
    h(
      'div',
      { className: 'toy-field-line' },
      h('span', { className: 'toy-field-line-label' }, label),
      h('span', { className: 'toy-field-line-value', title: typeof value === 'string' ? value : undefined }, value),
    )
  return h(
    'div',
    { className: 'toy-panel toy-detail-card' },
    h(
      'div',
      { className: 'toy-maintenance-head' },
      h('span', { className: 'toy-section-title' }, copy.detailTitle),
      h(Badge, { tone: statusTone(toy.status) }, toy.status ?? copy.none),
    ),
    h(Poster, {
      ...(toy.posterUrl === undefined ? {} : { src: toy.posterUrl }),
      alt: copy.posterAlt,
      className: 'toy-detail-poster',
      iconSize: 32,
    }),
    h('div', { className: 'toy-strong', style: { overflowWrap: 'anywhere' } }, toy.title),
    h(
      'div',
      { className: 'toy-badges' },
      toy.visibility === undefined ? null : h(Badge, {}, visibilityLabel(toy.visibility, zh)),
      toy.category === undefined ? null : h(Badge, {}, toy.category),
      toy.watermark === true ? h(Badge, {}, copy.watermarkLabel) : null,
    ),
    passwordProtected
      ? h(
          'div',
          { className: 'toy-password' },
          h('span', { className: 'toy-field-line-label' }, copy.passwordLabel),
          passwordView,
        )
      : null,
    h(
      'div',
      { className: 'toy-detail-fields-compact' },
      line(copy.idLabel, h('span', { className: 'toy-mono' }, String(toy.id))),
      line(copy.slugLabel, h('span', { className: 'toy-mono' }, toy.slug ?? '—')),
      line(copy.themeLabel, toy.theme ?? '—'),
      line(copy.createdAt, formatUnixTime(toy.ctime)),
      line(copy.updatedAt, formatUnixTime(toy.mtime)),
    ),
    h('div', { className: 'toy-divider' }),
    h(
      'div',
      { className: 'toy-detail-actions-row' },
      url === undefined
        ? null
        : h(
            'a',
            { className: 'toy-btn', href: url, target: '_blank', rel: 'noreferrer', 'data-size': 'sm' },
            h(Icon, { name: 'external' }),
            copy.openToyPage,
          ),
      h(Button, { size: 'sm', onClick: onOpenStats }, h(Icon, { name: 'chart' }), copy.viewStats),
      h(Button, { size: 'sm', variant: 'primary', onClick: onUpdate }, h(Icon, { name: 'plus' }), copy.updateToy),
      url === undefined ? null : h(CopyButton, { value: url, label: copy.copyLink, copiedLabel: copy.copiedToClipboard, icon: 'link' }),
      h(CopyButton, { value: String(toy.id), label: copy.copyId, copiedLabel: copy.copiedToClipboard }),
      toy.slug === undefined || toy.slug === '' ? null : h(CopyButton, { value: toy.slug, label: copy.copySlug, copiedLabel: copy.copiedToClipboard }),
    ),
  )
}

/** The "我的 Toy" tab. */
export function ToysView({
  copy,
  zh,
  items,
  total,
  busy,
  error,
  selected,
  resetSignal,
  onRefresh,
  onSelect,
  onOpenStats,
  onUpdate,
  onGoPublish,
}: {
  readonly copy: Copy
  readonly zh: boolean
  /** The whole loaded catalogue, or undefined while the first load runs. */
  readonly items: readonly ToySummary[] | undefined
  /** Account total reported by the platform (may exceed the loaded cards). */
  readonly total?: number
  readonly busy: boolean
  readonly error: Failure | undefined
  readonly selected: ToySummary | undefined
  /** Incremented by the panel when the list should jump back to page one. */
  readonly resetSignal: number
  readonly onRefresh: () => void
  readonly onSelect: (toy: ToySummary) => void
  readonly onOpenStats: (toy: ToySummary) => void
  readonly onUpdate: (toy: ToySummary) => void
  readonly onGoPublish: () => void
}): ReactNode {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortBy>('updated')
  const [page, setPage] = useState(1)

  // A login, submit or manual refresh request returns the list to page one.
  useEffect(() => {
    setPage(1)
  }, [resetSignal])

  // On narrow layouts the detail sheet sits above the grid: reveal it when a
  // card is selected instead of leaving the change off-screen.
  const asideRef = useRef<HTMLElement | null>(null)
  const previousSelected = useRef<number | undefined>(undefined)
  useEffect(() => {
    const id = selected?.id
    if (id === undefined || id === previousSelected.current) return
    previousSelected.current = id
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1100px)').matches) {
      asideRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [selected?.id])

  const filtered = useMemo<readonly ToySummary[]>(
    () => filterToys(items ?? [], { query, status, sort, locale: zh ? 'zh' : 'en' }),
    [items, query, status, sort, zh],
  )
  const pageData = slicePage({ total: filtered.length, items: filtered, truncated: false }, page, PAGE_SIZE)
  const pages = pageData.pages
  const currentPage = pageData.page
  const pageItems = pageData.items
  const hasPrev = currentPage > 1
  const hasNext = pageData.hasNext
  const filteredActive = query.trim() !== '' || status !== 'all'
  const loaded = items?.length

  return h(
    'div',
    { className: 'toy-workspace', 'data-selected': selected === undefined ? 'false' : 'true' },
    h(
      'div',
      { className: 'toy-workspace-main' },
      h(
        'div',
        { className: 'toy-viewbar' },
        h(
          'span',
          { className: 'toy-caption' },
          total === undefined ? copy.toysLoading : loaded !== undefined && filteredActive ? copy.toysFilteredCount(filtered.length, loaded) : copy.toysCount(total),
        ),
        h('span', { className: 'toy-viewbar-spacer' }),
        h(Button, { size: 'sm', onClick: onRefresh, disabled: busy, title: copy.refreshToys }, h(Icon, { name: 'refresh' }), busy ? copy.loading : copy.refresh),
      ),
      loaded !== undefined && total !== undefined && loaded < total
        ? h('div', { className: 'toy-caption' }, copy.toysTruncated(loaded, total))
        : null,
      error === undefined ? null : h(FailureBanner, { failure: error, copy }),
      h(
        'div',
        { className: 'toy-filters' },
        h(
          'div',
          { className: 'toy-search' },
          h('span', { className: 'toy-search-icon' }, h(Icon, { name: 'search', size: 14 })),
          h('input', {
            className: 'toy-input',
            value: query,
            type: 'search',
            placeholder: copy.toysSearchPlaceholder,
            'aria-label': copy.toysSearchPlaceholder,
            spellCheck: false,
            onChange: (event: ChangeEvent<HTMLInputElement>) => {
              setQuery(event.target.value)
              setPage(1)
            },
          }),
        ),
        h(
          'select',
          {
            className: 'toy-select toy-filter-select',
            value: status,
            'aria-label': copy.statusLabel,
            onChange: (event: ChangeEvent<HTMLSelectElement>) => {
              setStatus(event.target.value as StatusFilter)
              setPage(1)
            },
          },
          h('option', { value: 'all' }, copy.toysStatusAll),
          h('option', { value: 'published' }, copy.toysStatusPublished),
          h('option', { value: 'review' }, copy.toysStatusReview),
          h('option', { value: 'rejected' }, copy.toysStatusRejected),
          h('option', { value: 'other' }, copy.toysStatusOther),
        ),
        h(
          'select',
          {
            className: 'toy-select toy-filter-select',
            value: sort,
            'aria-label': copy.toysSortLabel,
            onChange: (event: ChangeEvent<HTMLSelectElement>) => setSort(event.target.value as SortBy),
          },
          h('option', { value: 'updated' }, copy.toysSortUpdated),
          h('option', { value: 'created' }, copy.toysSortCreated),
          h('option', { value: 'title' }, copy.toysSortTitle),
        ),
        filteredActive
          ? h(
              Button,
              {
                size: 'sm',
                onClick: () => {
                  setQuery('')
                  setStatus('all')
                  setPage(1)
                },
              },
              h(Icon, { name: 'close' }),
              copy.clearFilters,
            )
          : null,
        loaded === undefined ? null : h('span', { className: 'toy-caption toy-result-count' }, copy.toysFilteredCount(filtered.length, loaded)),
      ),
      busy && items === undefined ? h(Skeleton, { rows: 6, variant: 'cards' }) : null,
      items !== undefined && items.length === 0
        ? h(
            Empty,
            {},
            h('span', {}, copy.toysEmpty),
            h('span', { className: 'toy-caption' }, copy.toysEmptyHint),
            h(Button, { size: 'sm', variant: 'primary', onClick: onGoPublish }, h(Icon, { name: 'plus' }), copy.goPublish),
          )
        : null,
      items !== undefined && items.length > 0 && filtered.length === 0
        ? h(
            Empty,
            {},
            h('span', {}, copy.toysNoMatch),
            h('span', { className: 'toy-caption' }, copy.toysNoMatchHint),
            h(
              Button,
              {
                size: 'sm',
                onClick: () => {
                  setQuery('')
                  setStatus('all')
                  setPage(1)
                },
              },
              copy.clearFilters,
            ),
          )
        : null,
      pageItems.length === 0
        ? null
        : h(
            'div',
            { className: 'toy-grid' },
            pageItems.map((toy) =>
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
      filtered.length === 0
        ? null
        : h(
            'nav',
            { className: 'toy-toolbar', 'aria-label': copy.pageNavLabel },
            h(
              Button,
              { size: 'sm', onClick: () => setPage(Math.max(1, currentPage - 1)), disabled: busy || !hasPrev },
              h(Icon, { name: 'chevronLeft' }),
              copy.pagePrev,
            ),
            h('span', { className: 'toy-caption', 'aria-live': 'polite' }, copy.pageLabel(currentPage, pages, filtered.length)),
            h(
              Button,
              { size: 'sm', onClick: () => setPage(currentPage + 1), disabled: busy || !hasNext },
              copy.pageNext,
              h(Icon, { name: 'chevronRight' }),
            ),
          ),
    ),
    selected === undefined
      ? null
      : h(
          'aside',
          { className: 'toy-workspace-side', ref: asideRef },
          h(ToyDetail, {
            toy: selected,
            copy,
            zh,
            onOpenStats: () => onOpenStats(selected),
            onUpdate: () => onUpdate(selected),
          }),
        ),
  )
}
