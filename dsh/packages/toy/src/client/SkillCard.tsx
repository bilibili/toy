/**
 * The skill card: shows the skill installed by the skills CLI (version,
 * content hash, update time) and offers an explicit install/update. The Host
 * runs a fixed `npx skills` command after the confirmation dialog; the Remote
 * endpoint takes no arguments, so the page cannot inject flags.
 *
 * The command can take a while on a cold npx cache, so the dialog shows the
 * elapsed time, allows the page to stop waiting, and enforces a client-side
 * deadline: a host bug must never leave the page on "running" forever.
 */

import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { call } from './api.ts'
import type { Failure, ToyNamespace } from './api.ts'
import type { Copy } from './i18n.ts'
import { Badge, Banner, Button, FailureBanner, Icon, Loading, Dialog } from './ui.tsx'
import type { SkillActionResult, SkillStatus } from '../shared/types.ts'

/** Stop waiting after this long; the Host times the command out at 180 s. */
const WAIT_LIMIT_MS = 190_000

function shortTime(iso: string | undefined): string | undefined {
  if (iso === undefined) return undefined
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function SkillCard({
  ns,
  copy,
  active,
}: {
  readonly ns: ToyNamespace
  readonly copy: Copy
  readonly active: boolean
}): ReactNode {
  const [status, setStatus] = useState<SkillStatus | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [cancelled, setCancelled] = useState(false)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [output, setOutput] = useState<string | undefined>(undefined)
  const busySince = useRef(0)
  /** Generation of the running command; stale results are ignored. */
  const runSeq = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const outcome = await call<SkillStatus>('skillStatus', () => ns.skillStatus())
    if (!outcome.ok) {
      setError(outcome.failure)
      return
    }
    const value = outcome.value
    if (value.error !== undefined) {
      setError(value.error)
      return
    }
    setError(undefined)
    setStatus(value)
  }, [ns])

  useEffect(() => {
    if (!active) return
    void load()
  }, [active, load])

  // A running command updates the elapsed counter instead of freezing the text.
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - busySince.current) / 1000)))
    }, 1000)
    return () => clearInterval(timer)
  }, [busy])

  // Even if the Host never settles, the page leaves "running" with an error.
  useEffect(() => {
    if (!busy) return
    const seq = runSeq.current
    const timer = setTimeout(() => {
      if (runSeq.current !== seq) return
      runSeq.current += 1
      setBusy(false)
      setConfirmOpen(false)
      setElapsed(0)
      setError({ kind: 'timeout', message: copy.skillTimeoutHint })
      void load()
    }, WAIT_LIMIT_MS)
    return () => clearTimeout(timer)
  }, [busy, copy.skillTimeoutHint, load])

  const run = useCallback(async (): Promise<void> => {
    const seq = runSeq.current + 1
    runSeq.current = seq
    busySince.current = Date.now()
    setBusy(true)
    setElapsed(0)
    setCancelled(false)
    setError(undefined)
    const outcome = await call<SkillActionResult>('installSkill', () => ns.installSkill())
    if (runSeq.current !== seq) return
    setBusy(false)
    setElapsed(0)
    setConfirmOpen(false)
    if (!outcome.ok) {
      setError(outcome.failure)
      return
    }
    const value = outcome.value
    setOutput(value.output)
    if (value.status !== undefined) setStatus(value.status)
    else void load()
    if (!value.ok) {
      setError(value.error ?? { kind: 'skills-cli', message: `${copy.skillFailed}: ${value.command}` })
    }
  }, [ns, copy.skillFailed, copy.skillTimeoutHint, load])

  /** Leave the modal without cancelling the Host run. */
  const stopWaiting = useCallback((): void => {
    runSeq.current += 1
    setBusy(false)
    setElapsed(0)
    setConfirmOpen(false)
    setCancelled(true)
    void load()
  }, [load])

  const installed = status?.installed === true
  const actionLabel = installed ? copy.skillUpdate : copy.skillInstall
  const command = status === undefined ? '' : (installed ? status.updateCommand : status.installCommand)
  const managed = status?.managed
  const busyLabel = elapsed > 0 ? copy.skillBusyElapsed(elapsed) : copy.skillBusy

  return h(
    'div',
    { className: 'toy-skill', role: 'region', 'aria-label': copy.skillTitle },
    h(
      'div',
      { className: 'toy-skill-head' },
      h(Icon, { name: 'terminal', size: 16 }),
      h('strong', { className: 'toy-skill-title' }, copy.skillTitle),
      status === undefined ? null : h(Badge, { tone: installed ? 'info' : 'ok' }, installed ? copy.skillInstalled : copy.skillNotInstalled),
    ),
    status === undefined
      ? h(Loading, { label: copy.loading })
      : h(
          'div',
          { className: 'toy-skill-body' },
          managed === undefined
            ? h('div', { className: 'toy-caption' }, copy.skillNoManaged)
            : h(
                'div',
                { className: 'toy-skill-row' },
                h('span', { className: 'toy-skill-source' }, copy.skillManaged),
                h('span', { className: 'toy-caption' }, copy.skillVersion(managed.version)),
                h('span', { className: 'toy-caption' }, copy.skillContent(managed.contentHash)),
                shortTime(managed.updatedAt) === undefined ? null : h('span', { className: 'toy-caption' }, copy.skillUpdatedAt(shortTime(managed.updatedAt) as string)),
              ),
          h(
            'div',
            { className: 'toy-skill-actions' },
            h(
              Button,
              { variant: 'primary', onClick: () => setConfirmOpen(true), disabled: busy },
              h(Icon, { name: 'refresh' }),
              busy ? busyLabel : actionLabel,
            ),
            h(Button, { onClick: () => void load(), disabled: busy }, h(Icon, { name: 'refresh' }), copy.skillRefresh),
          ),
          h('div', { className: 'toy-caption' }, copy.skillManagedHint),
        ),
    cancelled ? h(Banner, { tone: 'info' }, copy.skillWaitCancelled) : null,
    error === undefined ? null : h(FailureBanner, { failure: error, copy }),
    output === undefined || output === ''
      ? null
      : h(
          'details',
          { className: 'toy-skill-output' },
          h('summary', {}, copy.skillOutput),
          h('pre', { className: 'toy-output' }, output),
        ),
    confirmOpen
      ? h(
          Dialog,
          {
            title: copy.skillConfirmTitle,
            closeLabel: copy.close,
            onClose: () => { if (!busy) setConfirmOpen(false) },
            footer: busy
              ? h(
                  'div',
                  { className: 'toy-skill-actions' },
                  h(Button, { onClick: stopWaiting }, copy.skillCancelWait),
                  h(Button, { variant: 'primary', disabled: true }, h(Icon, { name: 'refresh' }), busyLabel),
                )
              : h(
                  'div',
                  { className: 'toy-skill-actions' },
                  h(Button, { onClick: () => setConfirmOpen(false) }, copy.skillConfirmCancel),
                  h(Button, { variant: 'primary', onClick: () => void run() }, copy.skillConfirmRun),
                ),
          },
          h('p', {}, copy.skillConfirmBody),
          h('pre', { className: 'toy-output toy-skill-command' }, command),
          h('p', { className: 'toy-caption' }, copy.skillConfirmWarn),
          busy ? h('p', { className: 'toy-caption' }, copy.skillRunningHint) : null,
        )
      : null,
  )
}
