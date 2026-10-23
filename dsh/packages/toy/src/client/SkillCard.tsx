/**
 * The skill card: shows the skill installed by the skills CLI (version,
 * content hash, update time) and offers an explicit install/update. The Host
 * runs a fixed `npx skills` command after the confirmation dialog; the Remote
 * endpoint takes no arguments, so the page cannot inject flags.
 */

import { createElement as h, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { call } from './api.ts'
import type { Failure, ToyNamespace } from './api.ts'
import type { Copy } from './i18n.ts'
import { Badge, Button, FailureBanner, Icon, Loading, Dialog } from './ui.tsx'
import type { SkillActionResult, SkillStatus } from '../shared/types.ts'

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
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [output, setOutput] = useState<string | undefined>(undefined)

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

  const run = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    const outcome = await call<SkillActionResult>('installSkill', () => ns.installSkill())
    setBusy(false)
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
  }, [ns, copy.skillFailed, load])

  const installed = status?.installed === true
  const actionLabel = installed ? copy.skillUpdate : copy.skillInstall
  const command = status === undefined ? '' : (installed ? status.updateCommand : status.installCommand)
  const managed = status?.managed

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
              busy ? copy.skillBusy : actionLabel,
            ),
            h(Button, { onClick: () => void load(), disabled: busy }, h(Icon, { name: 'refresh' }), copy.skillRefresh),
          ),
          h('div', { className: 'toy-caption' }, copy.skillManagedHint),
        ),
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
            footer: h(
              'div',
              { className: 'toy-skill-actions' },
              h(Button, { onClick: () => setConfirmOpen(false), disabled: busy }, copy.skillConfirmCancel),
              h(Button, { variant: 'primary', onClick: () => void run(), disabled: busy }, busy ? copy.skillBusy : copy.skillConfirmRun),
            ),
          },
          h('p', {}, copy.skillConfirmBody),
          h('pre', { className: 'toy-output toy-skill-command' }, command),
          h('p', { className: 'toy-caption' }, copy.skillConfirmWarn),
        )
      : null,
  )
}
