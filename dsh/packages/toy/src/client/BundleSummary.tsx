/**
 * The bundle's own configuration page (`plugins.bundle.config`).
 *
 * The full publisher lives in the sidebar panel; on the Plugins page we render
 * a compact account summary with a refresh control and a shortcut to the panel,
 * never the full multi-tab page.
 */

import { createElement as h, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { call } from './api.ts'
import type { Failure, ToyNamespace } from './api.ts'
import { useCopy } from './i18n.ts'
import type { Copy } from './i18n.ts'
import { useToyStyles } from './styles.ts'
import { Badge, Button, FailureBanner, Icon, Loading } from './ui.tsx'
import type { AccountView } from '../shared/types.ts'

/** One-line summary rendered where the Plugins page asks for `view: 'summary'`. */
function summaryLine(copy: Copy, account: AccountView | undefined): ReactNode {
  if (account === undefined) {
    return h(
      'span',
      { className: 'toy-summary-line' },
      h('span', { className: 'toy-summary-dot', 'data-state': 'out' }),
      copy.bundleLoading,
    )
  }
  if (account.ok === false && account.error?.kind === 'binary-missing') {
    return h(
      'span',
      { className: 'toy-summary-line' },
      h('span', { className: 'toy-summary-dot', 'data-state': 'out' }),
      copy.bundleBinaryMissing,
    )
  }
  if (account.loggedIn && account.user !== undefined) {
    return h(
      'span',
      { className: 'toy-summary-line' },
      h('span', { className: 'toy-summary-dot' }),
      copy.bundleSignedIn(account.user.name, account.user.uid, account.version),
    )
  }
  return h(
    'span',
    { className: 'toy-summary-line' },
    h('span', { className: 'toy-summary-dot', 'data-state': 'out' }),
    copy.bundleLoggedOut,
  )
}

/** The compact bundle page. */
export function ToyBundleSummary({
  ns,
  view,
  onOpenPanel,
}: {
  readonly ns: ToyNamespace
  readonly view: 'summary' | 'page'
  readonly onOpenPanel?: () => void
}): ReactNode {
  const { copy } = useCopy()
  useToyStyles()
  const [account, setAccount] = useState<AccountView | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Failure | undefined>(undefined)

  const loadAccount = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    const outcome = await call<AccountView>('account', () => ns.account())
    setBusy(false)
    if (!outcome.ok) {
      setError(outcome.failure)
      return
    }
    setAccount(outcome.value)
    if (outcome.value.error !== undefined) setError(outcome.value.error)
  }, [ns])

  useEffect(() => {
    void loadAccount()
  }, [loadAccount])

  if (view === 'summary') return summaryLine(copy, account)

  const loggedIn = account?.loggedIn === true && account.user !== undefined
  const version = account?.version
  return h(
    'div',
    { className: 'toy-bundle-card' },
    h(
      'div',
      { className: 'toy-bundle-row' },
      h('span', { className: 'toy-section-title' }, copy.bundleTitle),
      loggedIn ? h(Badge, { tone: 'ok' }, copy.signedInAs(account.user?.name ?? '')) : h(Badge, { tone: 'warn' }, copy.notLoggedIn),
      version === undefined ? null : h(Badge, {}, `toy ${version}`),
      h('span', { className: 'toy-spacer' }),
      h(Button, { size: 'sm', onClick: () => void loadAccount(), disabled: busy }, h(Icon, { name: 'refresh' }), busy ? copy.loading : copy.refresh),
      onOpenPanel === undefined
        ? null
        : h(
            Button,
            { size: 'sm', variant: 'primary', onClick: onOpenPanel, disabled: busy },
            h(Icon, { name: 'box' }),
            copy.bundleOpen,
          ),
    ),
    h('div', { className: 'toy-caption' }, copy.bundleHint),
    busy && account === undefined ? h(Loading, { label: copy.bundleLoading }) : null,
    busy && account !== undefined ? null : null,
    error === undefined ? null : h(FailureBanner, { failure: error, copy }),
    account === undefined
      ? null
      : h(
          'div',
          { className: 'toy-meta-row' },
          account.user === undefined ? null : h('span', {}, copy.uid(account.user.uid)),
          account.binary === '' ? null : h('span', { className: 'toy-mono', title: account.binary }, account.binary),
        ),
    h('div', { className: 'toy-caption' }, copy.bundleShortcutHint),
  )
}
