/**
 * The "统计" tab: a PV/UV bar chart drawn with plain DOM elements, retention
 * and interaction totals, and a 7/30/90-day window selector.
 */

import { createElement as h, useEffect, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'

import { call, formatCount, formatPercent } from './api.ts'
import type { Failure, ToyNamespace } from './api.ts'
import type { Copy } from './i18n.ts'
import { Button, Empty, FailureBanner, Kpi, Loading, SectionHead, Toolbar } from './ui.tsx'
import type { ToyListPage, ToyStats, ToySummary } from '../shared/types.ts'

type Days = 7 | 30 | 90

const DAY_PRESETS: readonly Days[] = [7, 30, 90]

/** Normalize a CLI retention value (ratio or percent) to a percentage number. */
function retentionPercent(value: number): number {
  const percent = value > 0 && value <= 1 ? value * 100 : value
  return Number(percent.toFixed(1))
}

/** The PV/UV chart. */
function Chart({ copy, items }: { readonly copy: Copy; readonly items: ToyStats['items'] }): ReactNode {
  if (items.length === 0) return h(Empty, {}, copy.statsEmpty)
  const max = Math.max(1, ...items.map((item) => Math.max(item.pv, item.uv)))
  const first = items[0]
  const last = items[items.length - 1]
  return h(
    'div',
    { className: 'toy-chart-wrap' },
    h(
      'div',
      {
        className: 'toy-chart',
        role: 'img',
        'aria-label': copy.chartTitle(formatCount(items.reduce((sum, item) => sum + item.pv, 0)), formatCount(items.reduce((sum, item) => sum + item.uv, 0))),
      },
      items.map((item) => {
        const retention = item.retention === undefined ? undefined : retentionPercent(item.retention)
        return h(
          'div',
          {
            key: item.date,
            className: 'toy-chart-col',
            title: copy.dayTooltip(item.date, item.pv, item.uv, retention),
          },
          h('span', {
            className: 'toy-chart-bar',
            'data-series': 'pv',
            style: { height: `${Math.max(1, (item.pv / max) * 100)}%` },
          }),
          h('span', {
            className: 'toy-chart-bar',
            'data-series': 'uv',
            style: { height: `${Math.max(1, (item.uv / max) * 100)}%` },
          }),
        )
      }),
    ),
    h(
      'div',
      { className: 'toy-chart-axis' },
      h('span', {}, first?.date ?? ''),
      h('span', {}, last?.date ?? ''),
    ),
    h(
      'div',
      { className: 'toy-chart-legend' },
      h('span', {}, h('span', { className: 'toy-legend-dot' }), copy.pvLabel),
      h('span', {}, h('span', { className: 'toy-legend-dot', 'data-series': 'uv' }), copy.uvLabel),
    ),
  )
}

/** The "统计" tab. */
export function StatsView({
  copy,
  ns,
  toys,
  selected,
  active,
  onSelectToy,
}: {
  readonly copy: Copy
  readonly ns: ToyNamespace
  readonly toys: ToyListPage | undefined
  readonly selected: ToySummary | undefined
  readonly active: boolean
  readonly onSelectToy: (toy: ToySummary) => void
}): ReactNode {
  const [days, setDays] = useState<Days>(7)
  const [stats, setStats] = useState<ToyStats | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [refreshTick, setRefreshTick] = useState(0)

  const selectedId = selected?.id

  useEffect(() => {
    if (!active || selectedId === undefined) return
    let disposed = false
    setBusy(true)
    setError(undefined)
    void call<ToyStats>('stats', () => ns.stats(selectedId, days, '', '')).then((outcome) => {
      if (disposed) return
      if (outcome.ok) {
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

  const picker =
    toys === undefined || toys.items.length === 0
      ? null
      : h(
          'select',
          {
            className: 'toy-select',
            style: { maxWidth: 260 },
            value: selectedId === undefined ? '' : String(selectedId),
            'aria-label': copy.selectToy,
            onChange: (event: ChangeEvent<HTMLSelectElement>) => {
              const next = toys.items.find((toy) => String(toy.id) === event.target.value)
              if (next !== undefined) onSelectToy(next)
            },
          },
          h('option', { value: '' }, copy.selectToy),
          toys.items.map((toy) => h('option', { key: String(toy.id), value: String(toy.id) }, `${toy.title} (#${toy.id})`)),
        )

  if (selected === undefined) {
    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
      h(SectionHead, { title: copy.statsTitle }),
      h(Empty, {}, copy.selectToyForStats),
      picker,
    )
  }

  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h(SectionHead, {
      title: copy.statsFor(selected.title),
      sub: copy.statsRangeHint,
      actions: h(
        Toolbar,
        {},
        picker,
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
        h(Button, { size: 'sm', onClick: () => setRefreshTick((tick) => tick + 1), disabled: busy }, copy.refresh),
      ),
    }),
    error === undefined ? null : h(FailureBanner, { failure: error, copy }),
    busy ? h(Loading, { label: copy.statsLoading }) : null,
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
    !busy
      ? h('div', { className: 'toy-panel' }, h(Chart, { copy, items }))
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

