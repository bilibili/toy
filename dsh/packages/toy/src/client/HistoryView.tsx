/**
 * The "历史" tab: the local publish/update records with a path shortcut and a
 * typed-confirmation clear action (never `confirm()`).
 */

import { createElement as h, useCallback, useEffect, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'

import { actionLabel, call, failureOf, formatHistoryTime } from './api.ts'
import type { Failure, ToyNamespace } from './api.ts'
import type { Copy } from './i18n.ts'
import { Badge, Button, Dialog, Empty, FailureBanner, Field, Icon, Loading, SectionHead, Toolbar } from './ui.tsx'
import type { ActionResult, HistoryClearTicket, HistoryRecord } from '../shared/types.ts'

/** The "历史" tab. */
export function HistoryView({
  copy,
  zh,
  ns,
  active,
  onUsePath,
  onNotify,
}: {
  readonly copy: Copy
  readonly zh: boolean
  readonly ns: ToyNamespace
  readonly active: boolean
  readonly onUsePath: (record: HistoryRecord) => void
  readonly onNotify: (message: string) => void
}): ReactNode {
  const [records, setRecords] = useState<readonly HistoryRecord[] | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [tick, setTick] = useState(0)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearWord, setClearWord] = useState('')
  const [clearBusy, setClearBusy] = useState(false)
  const [clearError, setClearError] = useState<Failure | undefined>(undefined)

  useEffect(() => {
    if (!active) return
    let disposed = false
    setBusy(true)
    setError(undefined)
    void call<readonly HistoryRecord[]>('history', () => ns.history('')).then((outcome) => {
      if (disposed) return
      if (outcome.ok) {
        setRecords(Array.isArray(outcome.value) ? outcome.value : [])
      } else {
        setError(outcome.failure)
      }
      setBusy(false)
    })
    return () => {
      disposed = true
    }
  }, [active, ns, tick])

  const closeClearDialog = useCallback(() => {
    setClearOpen(false)
    setClearWord('')
    setClearError(undefined)
  }, [])

  const confirmClear = useCallback(async (): Promise<void> => {
    if (clearWord.trim() !== copy.clearHistoryWord || clearBusy) return
    setClearBusy(true)
    setClearError(undefined)
    // The Host requires a one-shot ticket issued after this typed confirmation.
    const ticketResult = await call<HistoryClearTicket>('prepareHistoryClear', () => ns.prepareHistoryClear())
    if (!ticketResult.ok) {
      setClearBusy(false)
      setClearError(ticketResult.failure)
      return
    }
    const ticket = ticketResult.value
    if (ticket === undefined || ticket.token === undefined) {
      setClearBusy(false)
      setClearError({ kind: 'confirmation-required', message: ticket?.error?.message ?? 'could not obtain a clear ticket' })
      return
    }
    const token = ticket.token
    const outcome = await call<ActionResult>('clearHistory', () => ns.clearHistory(token))
    setClearBusy(false)
    if (!outcome.ok) {
      setClearError(outcome.failure)
      return
    }
    const failure = failureOf(outcome.value)
    if (failure !== undefined) {
      setClearError(failure)
      return
    }
    closeClearDialog()
    setTick((value) => value + 1)
    onNotify(copy.clearHistoryDone)
  }, [clearWord, clearBusy, copy.clearHistoryWord, copy.clearHistoryDone, ns, closeClearDialog, onNotify])

  const items = records ?? []
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h(SectionHead, {
      title: copy.historyTitle,
      ...(records === undefined ? {} : { sub: copy.historyCount(items.length) }),
      actions: h(
        Toolbar,
        {},
        h(Button, { onClick: () => setTick((value) => value + 1), disabled: busy }, h(Icon, { name: 'refresh' }), copy.refresh),
        h(
          Button,
          { variant: 'danger', onClick: () => setClearOpen(true), disabled: busy || items.length === 0 },
          h(Icon, { name: 'trash' }),
          copy.clearHistory,
        ),
      ),
    }),
    h('div', { className: 'toy-caption' }, copy.historyHint),
    error === undefined ? null : h(FailureBanner, { failure: error, copy }),
    busy && records === undefined ? h(Loading, { label: copy.historyLoading }) : null,
    records !== undefined && items.length === 0 ? h(Empty, {}, copy.historyEmpty) : null,
    items.length === 0
      ? null
      : h(
          'div',
          { className: 'toy-table-wrap' },
          h(
            'table',
            { className: 'toy-table' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', {}, copy.colTime),
                h('th', {}, copy.colTitle),
                h('th', {}, copy.colId),
                h('th', {}, copy.colAction),
                h('th', {}, copy.colPath),
                h('th', {}, ''),
              ),
            ),
            h(
              'tbody',
              {},
              items.map((record, index) =>
                h(
                  'tr',
                  { key: `${record.path ?? 'record'}-${record.time ?? ''}-${index}` },
                  h('td', { style: { whiteSpace: 'nowrap' } }, formatHistoryTime(record.time)),
                  h('td', {}, record.title ?? '—'),
                  h('td', { className: 'toy-mono' }, record.id === undefined ? '—' : String(record.id)),
                  h('td', {}, h(Badge, { tone: record.action === 'update' ? 'info' : 'ok' }, actionLabel(record.action, zh))),
                  h(
                    'td',
                    { className: 'toy-col-path' },
                    h('div', { className: 'toy-mono' }, record.path ?? '—'),
                    record.cliVersion === undefined ? null : h('div', { className: 'toy-caption' }, `CLI ${record.cliVersion}`),
                  ),
                  h(
                    'td',
                    {},
                    record.path === undefined || record.path === ''
                      ? null
                      : h(
                          Button,
                          { size: 'sm', onClick: () => onUsePath(record) },
                          copy.usePath,
                        ),
                  ),
                ),
              ),
            ),
          ),
        ),
    clearOpen
      ? h(Dialog, {
          title: copy.clearHistoryTitle,
          closeLabel: copy.close,
          onClose: closeClearDialog,
          children: h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            h('div', {}, copy.clearHistoryBody(copy.clearHistoryWord)),
            clearError === undefined ? null : h(FailureBanner, { failure: clearError, copy }),
            h(
              Field,
              { label: copy.clearHistoryInput },
              h('input', {
                className: 'toy-input',
                value: clearWord,
                autoFocus: true,
                onChange: (event: ChangeEvent<HTMLInputElement>) => setClearWord(event.target.value),
                onKeyDown: (event: { readonly key: string }) => {
                  if (event.key === 'Enter') void confirmClear()
                },
              }),
            ),
          ),
          footer: h(
            Toolbar,
            {},
            h(Button, { onClick: closeClearDialog }, copy.cancel),
            h(
              Button,
              { variant: 'danger', onClick: () => void confirmClear(), disabled: clearWord.trim() !== copy.clearHistoryWord || clearBusy },
              clearBusy ? copy.loading : copy.clearHistoryConfirm,
            ),
          ),
        })
      : null,
  )
}
