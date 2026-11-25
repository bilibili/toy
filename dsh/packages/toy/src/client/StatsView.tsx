/**
 * The "统计" tab.
 *
 * Default view: a ranked overview of the whole account — every Toy one row,
 * sorted by yesterday's PV (then UV), with a small trend sparkline and the
 * window totals. The ranking is built from the existing per-Toy `stats` Remote
 * method fanned out over a small pool, and cached per window for this mount.
 *
 * Selecting a Toy (row, picker, or the Toys tab shortcut) opens the detailed
 * view: KPIs, the PV/UV chart with a hovered-day readout, retention and
 * interaction totals.
 */

import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { call, formatCount, formatPercent, toyPageUrl } from './api.ts'
import type { Failure, ToyNamespace } from './api.ts'
import { chartTicks, niceMax } from './filters.js'
import type { Copy } from './i18n.ts'
import { overviewRow, sortOverviewRows, sparkHeights } from './overview.js'
import type { OverviewRow } from './overview.js'
import { sliceToyStats } from './statsAggregate.js'
import { FEED_MIN_DAYS, loadToyStats, readToyStatsCache, writeToyStatsCache } from './statsFeed.ts'
import { ToyPicker } from './ToyPicker.tsx'
import { Badge, Button, Empty, FailureBanner, Icon, Kpi, SectionHead, Toolbar } from './ui.tsx'
import type { ToyListPage, ToyStats, ToySummary } from '../shared/types.ts'

type Days = 7 | 30 | 90

const DAY_PRESETS: readonly Days[] = [7, 30, 90]
/** Gridline labels from top to bottom. */
const TICK_COUNT = 4
/** Overview rows per page. */
const OVERVIEW_PAGE_SIZE = 30

/** Normalize a CLI retention value (ratio or percent) to a percentage number. */
function retentionPercent(value: number): number {
  const percent = value > 0 && value <= 1 ? value * 100 : value
  return Number(percent.toFixed(1))
}

/** The PV/UV chart with a y axis and the hovered day's numbers. */
function Chart({
  copy,
  items,
  hovered,
  onHover,
}: {
  readonly copy: Copy
  readonly items: ToyStats['items']
  readonly hovered: string | undefined
  readonly onHover: (date: string | undefined) => void
}): ReactNode {
  if (items.length === 0) return null
  const max = niceMax(Math.max(1, ...items.map((item) => Math.max(item.pv, item.uv))))
  const ticks = chartTicks(max, TICK_COUNT)
  const first = items[0]
  const last = items[items.length - 1]
  const shown = items.find((item) => item.date === hovered) ?? last
  const retention = shown?.retention === undefined ? undefined : retentionPercent(shown.retention)
  const shownLabel = copy.dayTooltip(shown?.date ?? '', shown?.pv ?? 0, shown?.uv ?? 0, retention)
  /** PV line across the plot's percent box (0–100 in both axes). */
  const pvPoints = items
    .map((item, index) => `${(((index + 0.5) / items.length) * 100).toFixed(2)},${(100 - (item.pv / max) * 100).toFixed(2)}`)
    .join(' ')

  return h(
    'div',
    { className: 'toy-chart-wrap' },
    h(
      'div',
      { className: 'toy-chart-frame' },
      h(
        'div',
        { className: 'toy-chart-y', 'aria-hidden': true },
        ticks.map((tick, index) => h('span', { key: `${tick}-${index}` }, formatCount(tick))),
      ),
      h(
        'div',
        { className: 'toy-chart-plot' },
        h(
          'div',
          { className: 'toy-chart-grid', 'aria-hidden': true },
          ticks.map((_tick, index) => h('span', { key: String(index), className: 'toy-chart-gridline' })),
        ),
        h(
          'div',
          {
            className: 'toy-chart',
            role: 'img',
            'aria-label': copy.chartTitle(
              formatCount(items.reduce((sum, item) => sum + item.pv, 0)),
              formatCount(items.reduce((sum, item) => sum + item.uv, 0)),
            ),
            onMouseLeave: () => onHover(undefined),
          },
          items.map((item) => {
            const itemRetention = item.retention === undefined ? undefined : retentionPercent(item.retention)
            return h(
              'div',
              {
                key: item.date,
                className: 'toy-chart-col',
                'data-active': item.date === shown?.date ? 'true' : 'false',
                title: copy.dayTooltip(item.date, item.pv, item.uv, itemRetention),
                onMouseEnter: () => onHover(item.date),
              },
              h('span', {
                className: 'toy-chart-bar',
                style: { height: `${Math.max(1, (item.uv / max) * 100)}%` },
              }),
            )
          }),
          h(
            'svg',
            {
              className: 'toy-chart-line',
              viewBox: '0 0 100 100',
              preserveAspectRatio: 'none',
              'aria-hidden': true,
            },
            h('polyline', {
              points: pvPoints,
              fill: 'none',
              'vector-effect': 'non-scaling-stroke',
            }),
          ),
        ),
      ),
    ),
    h(
      'div',
      { className: 'toy-chart-axis' },
      h('span', {}, first?.date ?? ''),
      h('span', {}, last?.date ?? ''),
    ),
    h(
      'div',
      { className: 'toy-chart-day', 'aria-live': 'polite' },
      h('span', { className: 'toy-chart-day-label' }, shown?.date ?? ''),
      shown === undefined
        ? h('span', { className: 'toy-chart-day-empty' }, copy.chartHoverHint)
        : h('span', { className: 'toy-chart-day-value' }, shownLabel.replace(`${shown.date} · `, '')),
    ),
    h(
      'div',
      { className: 'toy-chart-legend' },
      h('span', {}, h('span', { className: 'toy-legend-line' }), copy.pvLabel),
      h('span', {}, h('span', { className: 'toy-legend-dot', 'data-series': 'uv' }), copy.uvLabel),
      h('span', { className: 'toy-caption' }, copy.chartHoverHint),
    ),
  )
}

/** A tiny trend inside one overview row: UV bars with a PV line. */
function Spark({ stats }: { readonly stats: ToyStats | undefined }): ReactNode {
  const heights = sparkHeights(stats)
  if (heights.length === 0) return h('span', { className: 'toy-spark-empty' }, '—')
  const step = 100 / heights.length
  return h(
    'svg',
    {
      className: 'toy-spark',
      viewBox: '0 0 100 28',
      preserveAspectRatio: 'none',
      'aria-hidden': true,
    },
    heights.map((height, index) =>
      h('rect', {
        key: `bar-${index}`,
        className: 'toy-spark-bar',
        x: index * step + step * 0.22,
        y: 28 - Math.max(1, height.uv * 28),
        width: step * 0.56,
        height: Math.max(1, height.uv * 28),
        rx: 0.6,
      }),
    ),
    h('polyline', {
      className: 'toy-spark-line',
      points: heights.map((height, index) => `${index * step + step / 2},${28 - Math.max(1, height.pv * 28)}`).join(' '),
      fill: 'none',
      'vector-effect': 'non-scaling-stroke',
    }),
  )
}

/** One ranked row of the overview. */
function OverviewRowView({
  row,
  rank,
  copy,
  onOpen,
}: {
  readonly row: OverviewRow
  readonly rank: number
  readonly copy: Copy
  readonly onOpen: () => void
}): ReactNode {
  return h(
    'button',
    { type: 'button', className: 'toy-overview-row', onClick: onOpen, title: copy.statsRowHint },
    h('span', { className: 'toy-overview-rank' }, String(rank)),
    h(
      'span',
      { className: 'toy-overview-main' },
      h('span', { className: 'toy-overview-title', title: row.toy.title }, row.toy.title),
      h(
        'span',
        { className: 'toy-overview-meta' },
        `#${row.toy.id}`,
        row.toy.status === undefined || row.toy.status === '' ? null : h(Badge, { tone: 'info' }, row.toy.status),
        row.date === undefined ? null : h('span', { className: 'toy-caption' }, copy.statsYesterday(row.date)),
      ),
    ),
    h(Spark, { stats: row.stats }),
    h(
      'span',
      { className: 'toy-overview-numbers' },
      h('span', { className: 'toy-overview-cell' }, h('span', { className: 'toy-caption' }, copy.statsYesterdayPv), h('strong', {}, formatCount(row.pv))),
      h('span', { className: 'toy-overview-cell' }, h('span', { className: 'toy-caption' }, copy.statsYesterdayUv), h('strong', {}, formatCount(row.uv))),
      h('span', { className: 'toy-overview-cell' }, h('span', { className: 'toy-caption' }, copy.statsWindowPv), h('span', {}, formatCount(row.totalPv))),
    ),
    h(Icon, { name: 'chevronRight', size: 14 }),
  )
}

/** The "统计" tab. */
export function StatsView({
  copy,
  zh,
  ns,
  toys,
  selected,
  active,
  onSelectToy,
  onClearToy,
  onGoPublish,
}: {
  readonly copy: Copy
  readonly zh: boolean
  readonly ns: ToyNamespace
  readonly toys: ToyListPage | undefined
  readonly selected: ToySummary | undefined
  readonly active: boolean
  readonly onSelectToy: (toy: ToySummary) => void
  /** Return to the ranked overview from the detail view. */
  readonly onClearToy?: () => void
  /** Jump to the publish form (cold-start empty states). */
  readonly onGoPublish?: () => void
}): ReactNode {
  const [days, setDays] = useState<Days>(7)
  const [hovered, setHovered] = useState<string | undefined>(undefined)
  const [refreshTick, setRefreshTick] = useState(0)

  // ---- detail view state ---------------------------------------------------
  const [stats, setStats] = useState<ToyStats | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Failure | undefined>(undefined)

  // ---- overview state ------------------------------------------------------
  const [overview, setOverview] = useState<readonly OverviewRow[] | undefined>(undefined)
  const [overviewBusy, setOverviewBusy] = useState(false)
  const [overviewError, setOverviewError] = useState<Failure | undefined>(undefined)
  const [overviewDone, setOverviewDone] = useState(0)
  const [overviewTotal, setOverviewTotal] = useState(0)
  const [overviewFailed, setOverviewFailed] = useState(0)
  const [overviewTick, setOverviewTick] = useState(0)
  const [overviewPage, setOverviewPage] = useState(1)
  const overviewSeq = useRef(0)
  /** Set by Refresh so the next load skips the shared cache. */
  const forceOverview = useRef(false)
  /** Set by the detail Refresh button so the next load skips the detail cache. */
  const forceDetail = useRef(false)

  const selectedId = selected?.id
  const toyItems = toys?.items ?? []
  /** The effect must not re-run per render: the panel rebuilds this array. */
  const itemsRef = useRef(toyItems)
  itemsRef.current = toyItems
  const toyIds = toyItems.map((toy) => toy.id).join(',')
  const locale = zh ? 'zh' : 'en'

  // The detail view loads one Toy's stats when a Toy is selected. A fresh
  // memory/persistent entry (or a wider cached feed) renders instantly; the
  // Refresh button bypasses it.
  useEffect(() => {
    if (!active || selectedId === undefined) return
    const force = forceDetail.current
    forceDetail.current = false
    if (!force) {
      const cached = readToyStatsCache(selectedId, days)
      if (cached !== undefined) {
        setStats(cached)
        setError(undefined)
        setBusy(false)
        return
      }
    }
    let disposed = false
    // Clear the old Toy's KPIs so the new title cannot briefly show stale
    // interactions/chart values while the fetch is in flight.
    setStats(undefined)
    setBusy(true)
    setError(undefined)
    void call<ToyStats>('stats', () => ns.stats(selectedId, days, '', '')).then((outcome) => {
      if (disposed) return
      if (outcome.ok) {
        writeToyStatsCache(selectedId, days, outcome.value)
        setStats(outcome.value)
      } else {
        setStats(undefined)
        setError(outcome.failure)
      }
      setBusy(false)
    })
    return () => {
      disposed = true
    }
  }, [active, ns, selectedId, days, refreshTick])

  // The overview ranks every Toy by yesterday's traffic. It asks the shared
  // feed for at least 14 days so the home dashboard can reuse the same load.
  useEffect(() => {
    if (!active || selectedId !== undefined) return
    const items = itemsRef.current
    if (items.length === 0) return
    const run = overviewSeq.current + 1
    overviewSeq.current = run
    const force = forceOverview.current
    forceOverview.current = false
    const windowDays = Math.max(days, FEED_MIN_DAYS)
    setOverview(undefined)
    setOverviewBusy(true)
    setOverviewError(undefined)
    setOverviewDone(0)
    setOverviewFailed(0)
    setOverviewTotal(items.length)
    setOverviewPage(1)
    void loadToyStats(
      ns,
      items,
      windowDays,
      (progress) => {
        if (overviewSeq.current !== run) return
        setOverviewDone(progress.done)
        setOverviewFailed(progress.failed)
      },
      force,
    )
      .then((statsById) => {
        if (overviewSeq.current !== run) return
        const rows = items.map((toy) => overviewRow(toy, sliceToyStats(statsById.get(toy.id), days)))
        setOverview(sortOverviewRows(rows, locale))
        setOverviewDone(items.length)
        setOverviewFailed(items.filter((toy) => statsById.get(toy.id) === undefined).length)
        setOverviewBusy(false)
      })
      .catch((reason: unknown) => {
        if (overviewSeq.current !== run) return
        setOverviewBusy(false)
        setOverviewError({ kind: 'stats', message: reason instanceof Error ? reason.message : copy.statsOverviewEmpty })
      })
    return () => {
      overviewSeq.current += 1
    }
    // `toyIds` stands in for the item identities; the array itself is rebuilt
    // by the panel on every render.
  }, [active, selectedId, days, overviewTick, toyIds, ns, locale, copy.statsOverviewEmpty])

  const refreshOverview = useCallback((): void => {
    forceOverview.current = true
    setOverviewTick((tick) => tick + 1)
  }, [])

  const picker =
    toys === undefined || toyItems.length === 0
      ? null
      : h(ToyPicker, {
          copy,
          toys: toyItems,
          ...(selectedId === undefined ? {} : { value: selectedId }),
          onChange: onSelectToy,
          placeholder: copy.statsSelectHint,
        })

  const windowChips = h(
    'span',
    { className: 'toy-segmented' },
    DAY_PRESETS.map((preset) =>
      h(
        Button,
        {
          key: String(preset),
          size: 'sm',
          pressed: preset === days,
          onClick: () => setDays(preset),
        },
        preset === 7 ? copy.days7 : preset === 30 ? copy.days30 : copy.days90,
      ),
    ),
  )

  // ---- detail view ---------------------------------------------------------
  if (selected !== undefined) {
    const items = stats?.items ?? []
    const totalPv = items.reduce((sum, item) => sum + item.pv, 0)
    const totalUv = items.reduce((sum, item) => sum + item.uv, 0)
    const retentionValues = items.filter((item) => item.retention !== undefined).map((item) => retentionPercent(item.retention as number))
    const avgRetention = retentionValues.length === 0 ? undefined : retentionValues.reduce((sum, value) => sum + value, 0) / retentionValues.length
    const dyn = stats?.dynStat
    const dynEntries: readonly { readonly label: string; readonly value: number | undefined }[] = [
      { label: copy.likeLabel, value: dyn?.like },
      { label: copy.favoriteLabel, value: dyn?.favorite },
      { label: copy.commentLabel, value: dyn?.comment },
      { label: copy.shareLabel, value: dyn?.share },
    ]
    const pageUrl = toyPageUrl(selected)

    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
      h(SectionHead, {
        title: copy.statsFor(selected.title),
        sub: copy.statsRangeHint,
        actions: h(
          Toolbar,
          {},
          onClearToy === undefined
            ? null
            : h(Button, { size: 'sm', onClick: onClearToy }, h(Icon, { name: 'chevronLeft' }), copy.statsBackToOverview),
          windowChips,
          h(
            Button,
            {
              size: 'sm',
              disabled: busy,
              onClick: () => {
                forceDetail.current = true
                setRefreshTick((tick) => tick + 1)
              },
            },
            h(Icon, { name: 'refresh' }),
            copy.statsRefresh,
          ),
          pageUrl === undefined
            ? null
            : h(
                'a',
                { className: 'toy-btn', href: pageUrl, target: '_blank', rel: 'noreferrer', 'data-size': 'sm' },
                h(Icon, { name: 'external' }),
                copy.statsOpenPage,
              ),
        ),
      }),
      error === undefined ? null : h(FailureBanner, { failure: error, copy }),
      busy && stats === undefined
        ? h(
            'div',
            { className: 'toy-panel', 'aria-busy': true },
            h(
              'div',
              { className: 'toy-chart-skeleton', 'aria-hidden': true },
              Array.from({ length: 14 }, (_unused, index) => h('span', {
                key: String(index),
                className: 'toy-chart-skeleton-col',
                style: { height: `${20 + ((index * 37) % 70)}%` },
              })),
            ),
            h('div', { className: 'toy-loading' }, copy.statsLoading),
          )
        : null,
      !busy && items.length === 0 && error === undefined ? h(Empty, {}, copy.statsEmpty) : null,
      !busy && items.length > 0
        ? h(
            'div',
            { className: 'toy-kpis' },
            h(Kpi, { label: copy.totalPv, value: formatCount(totalPv), sub: copy.pvLabel }),
            h(Kpi, { label: copy.totalUv, value: formatCount(totalUv), sub: copy.uvLabel }),
            avgRetention === undefined
              ? null
              : h(Kpi, { label: copy.avgRetention, value: formatPercent(avgRetention), sub: copy.retentionLabel }),
          )
        : null,
      !busy && items.length > 0 ? h('div', { className: 'toy-caption' }, copy.statsUvHint) : null,
      !busy && items.length > 0
        ? h(
            'div',
            { className: 'toy-panel' },
            h(
              'div',
              { className: 'toy-panel-head' },
              h('div', { className: 'toy-step-title' }, copy.statsDayDetail),
              h('span', { className: 'toy-caption' }, copy.statsRangeHint),
            ),
            h(Chart, { copy, items, hovered, onHover: setHovered }),
          )
        : null,
      dynEntries.some((entry) => entry.value !== undefined)
        ? h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            h('div', { className: 'toy-section-title' }, copy.dynTitle),
            h(
              'div',
              { className: 'toy-kpis' },
              dynEntries.map((entry) => h(Kpi, { key: entry.label, label: entry.label, value: formatCount(entry.value) })),
            ),
          )
        : null,
    )
  }

  // ---- overview ------------------------------------------------------------
  const rows = overview ?? []
  const pageCount = Math.max(1, Math.ceil(rows.length / OVERVIEW_PAGE_SIZE))
  const page = Math.min(Math.max(1, overviewPage), pageCount)
  const pageRows = rows.slice((page - 1) * OVERVIEW_PAGE_SIZE, page * OVERVIEW_PAGE_SIZE)
  const progress = overviewTotal === 0 ? 0 : Math.round((overviewDone / overviewTotal) * 100)

  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h(SectionHead, {
      title: copy.statsTitle,
      sub: overviewBusy ? copy.statsOverviewProgress(overviewDone, overviewTotal) : copy.statsOverviewHint,
      actions: h(
        Toolbar,
        {},
        picker,
        windowChips,
        h(Button, { size: 'sm', onClick: refreshOverview, disabled: overviewBusy }, h(Icon, { name: 'refresh' }), copy.statsRefresh),
      ),
    }),
    overviewError === undefined ? null : h(FailureBanner, { failure: overviewError, copy }),
    overviewBusy
      ? h(
          'div',
          { className: 'toy-panel', 'aria-busy': true },
          h('div', { className: 'toy-overview-progress' }, h('span', { style: { width: `${progress}%` } })),
          h('div', { className: 'toy-caption', style: { marginTop: 8 } }, copy.statsOverviewProgress(overviewDone, overviewTotal)),
        )
      : null,
    overviewBusy && pageRows.length === 0
      ? h(
          'div',
          { className: 'toy-overview-list' },
          Array.from({ length: 8 }, (_unused, index) =>
            h('div', { key: String(index), className: 'toy-overview-row toy-overview-skeleton' },
              h('span', { className: 'toy-skeleton toy-skeleton-line', style: { width: '70%' } }),
            ),
          ),
        )
      : null,
    toys !== undefined && toyItems.length === 0
      ? h(
          Empty,
          {},
          h('span', {}, copy.statsNoToysTitle),
          h('span', { className: 'toy-caption' }, copy.statsNoToysHint),
          onGoPublish === undefined
            ? null
            : h(Button, { size: 'sm', variant: 'primary', onClick: onGoPublish }, h(Icon, { name: 'plus' }), copy.onboardingPublishCta),
        )
      : null,
    !overviewBusy && rows.length === 0 && toyItems.length > 0
      ? h(Empty, {}, copy.statsOverviewEmpty)
      : null,
    rows.length === 0
      ? null
      : h(
          'div',
          { className: 'toy-overview-list' },
          pageRows.map((row, index) =>
            h(OverviewRowView, {
              key: String(row.toy.id),
              row,
              rank: (page - 1) * OVERVIEW_PAGE_SIZE + index + 1,
              copy,
              onOpen: () => onSelectToy(row.toy),
            }),
          ),
        ),
    rows.length > 0 && rows.every((row) => row.pv === 0 && row.totalPv === 0)
      ? h('div', { className: 'toy-caption' }, copy.statsNoTrafficHint)
      : null,
    rows.length === 0
      ? null
      : h(
          'div',
          { className: 'toy-toolbar' },
          h(
            Button,
            { size: 'sm', onClick: () => setOverviewPage(Math.max(1, page - 1)), disabled: page <= 1 },
            h(Icon, { name: 'chevronLeft' }),
            copy.pagePrev,
          ),
          h('span', { className: 'toy-caption', 'aria-live': 'polite' }, copy.pageLabel(page, pageCount, rows.length)),
          h(
            Button,
            { size: 'sm', onClick: () => setOverviewPage(page + 1), disabled: page >= pageCount },
            copy.pageNext,
            h(Icon, { name: 'chevronRight' }),
          ),
          overviewFailed === 0
            ? null
            : h('span', { className: 'toy-caption' }, copy.statsOverviewFailed(overviewFailed)),
        ),
  )
}
