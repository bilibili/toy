/**
 * The "通知" tab: the creator notifications `toy notify` returns. Read-only —
 * the CLI deliberately never clears the platform's unread badge.
 */

import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { call, formatUnixTime } from './api.ts'
import type { Failure, ToyNamespace } from './api.ts'
import type { Copy } from './i18n.ts'
import { TOY_LINKS } from './links.ts'
import { Badge, Button, Empty, FailureBanner, Icon, Loading, SectionHead, Toolbar } from './ui.tsx'
import type { NotifyFeed, ToyNotification } from '../shared/types.ts'

type Category = 0 | 1 | 2 | 3

/** Human label for a notification category number. */
function categoryLabel(value: number | undefined, copy: Copy): string {
  if (value === 1) return copy.notifyCategoryAchievement
  if (value === 2) return copy.notifyCategoryWork
  if (value === 3) return copy.notifyCategoryActivity
  return copy.notifyCategoryOther
}

export function NotifyView({
  copy,
  ns,
  active,
  onRead,
}: {
  readonly copy: Copy
  readonly ns: ToyNamespace
  readonly active: boolean
  readonly onRead?: (latestCtime: number) => void
}): ReactNode {
  const [category, setCategory] = useState<Category>(0)
  const [feed, setFeed] = useState<NotifyFeed | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [tick, setTick] = useState(0)
  const loadSeq = useRef(0)
  const onReadRef = useRef(onRead)
  onReadRef.current = onRead

  const load = useCallback(async (): Promise<void> => {
    const run = loadSeq.current + 1
    loadSeq.current = run
    setBusy(true)
    setError(undefined)
    setFeed(undefined)
    const outcome = await call<NotifyFeed>('notifications', () => ns.notifications(category))
    if (loadSeq.current !== run) return
    setBusy(false)
    if (!outcome.ok) {
      setError(outcome.failure)
      return
    }
    setFeed(outcome.value)
    const latest = outcome.value.items.reduce((max, item) => Math.max(max, item.time ?? 0), 0)
    if (latest > 0) onReadRef.current?.(latest)
  }, [ns, category])

  useEffect(() => {
    if (!active) return
    void load()
  }, [active, load, tick])

  const items: readonly ToyNotification[] = feed?.items ?? []
  const categories: readonly { readonly value: Category; readonly label: string }[] = [
    { value: 0, label: copy.notifyCategoryAll },
    { value: 1, label: copy.notifyCategoryAchievement },
    { value: 2, label: copy.notifyCategoryWork },
    { value: 3, label: copy.notifyCategoryActivity },
  ]

  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h(SectionHead, {
      title: copy.notifyTitle,
      sub: copy.notifySubtitle,
      actions: h(
        Toolbar,
        {},
        feed?.newCount === undefined || feed.newCount <= 0 ? null : h(Badge, { tone: 'info' }, copy.notifyNew(feed.newCount)),
        h(
          'a',
          { className: 'toy-btn', href: feed?.notificationUrl ?? TOY_LINKS.notifications, target: '_blank', rel: 'noreferrer', 'data-size': 'sm' },
          h(Icon, { name: 'external' }),
          copy.notifyOpenPlatform,
        ),
        h(Button, { size: 'sm', onClick: () => setTick((value) => value + 1), disabled: busy }, h(Icon, { name: 'refresh' }), copy.refresh),
      ),
    }),
    h(
      'div',
      { className: 'toy-filters' },
      h(
        'div',
        { className: 'toy-tabs', role: 'tablist', 'aria-label': copy.notifyTitle },
        categories.map((entry) =>
          h(
            'button',
            {
              key: entry.value,
              type: 'button',
              className: 'toy-tab',
              role: 'tab',
              'aria-selected': category === entry.value,
              onClick: () => setCategory(entry.value),
            },
            entry.label,
          ),
        ),
      ),
    ),
    error === undefined ? null : h(FailureBanner, { failure: error, copy }),
    busy && feed === undefined ? h(Loading, { label: copy.notifyLoading }) : null,
    feed !== undefined && items.length === 0 && !busy
      ? h(
          Empty,
          {},
          h('span', {}, copy.notifyEmpty),
          h('span', { className: 'toy-caption' }, copy.notifyEmptyHint),
          h(
            'a',
            { className: 'toy-btn', href: TOY_LINKS.notifications, target: '_blank', rel: 'noreferrer', 'data-size': 'sm' },
            h(Icon, { name: 'external' }),
            copy.notifyOpenPlatform,
          ),
        )
      : null,
    items.length === 0
      ? null
      : h(
          'div',
          { className: 'toy-notify-list' },
          items.map((item) =>
            h(
              'article',
              { key: String(item.id), className: 'toy-notify-item' },
              h(
                'div',
                { className: 'toy-notify-head' },
                h(Badge, { tone: 'info' }, categoryLabel(item.category, copy)),
                h('h3', { className: 'toy-notify-title' }, item.title),
                h('span', { className: 'toy-caption' }, formatUnixTime(item.time)),
              ),
              item.body === undefined || item.body === ''
                ? null
                : h('p', { className: 'toy-notify-body' }, item.body),
              item.actionUrl === undefined || item.actionUrl === ''
                ? null
                : h(
                    'a',
                    { className: 'toy-link', href: item.actionUrl, target: '_blank', rel: 'noreferrer' },
                    h(Icon, { name: 'external' }),
                    ' ',
                    item.actionText ?? copy.notifyOpenAction,
                  ),
            ),
          ),
        ),
    feed?.hasMore !== true
      ? null
      : h(
          'div',
          { className: 'toy-caption' },
          copy.notifyHasMore,
          ' ',
          h(
            'a',
            { className: 'toy-link', href: feed?.notificationUrl ?? TOY_LINKS.notifications, target: '_blank', rel: 'noreferrer' },
            copy.notifyOpenPlatform,
          ),
        ),
    h('div', { className: 'toy-caption' }, copy.notifyReadOnlyHint),
  )
}
