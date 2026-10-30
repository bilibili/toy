/**
 * The full bilibili Toy page: account header plus four tabs (My Toys, Stats,
 * Publish/Update, History). Every tab stays mounted so a prepared preview and a
 * half-filled publish form survive tab switches; data loading is gated on the
 * tab being visible.
 *
 * The page never uploads on mount: the only CLI writes happen after explicit
 * user actions in the Publish tab.
 */

import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { call } from './api.ts'
import type { Failure, ToyNamespace } from './api.ts'
import { useCopy } from './i18n.ts'
import { HistoryView } from './HistoryView.tsx'
import { PublishView } from './PublishView.tsx'
import { SkillCard } from './SkillCard.tsx'
import type { PublishPrefill } from './PublishView.tsx'
import { StatsView } from './StatsView.tsx'
import { useToyStyles } from './styles.ts'
import { ToysView } from './ToysView.tsx'
import { Badge, Banner, Button, Dialog, FailureBanner, Icon, Loading } from './ui.tsx'
import type {
  AccountView,
  CliUpdateView,
  CliUpgradeResult,
  HistoryRecord,
  ToyListPage,
  ToySummary,
} from '../shared/types.ts'

type Tab = 'toys' | 'stats' | 'publish' | 'history'

/** Toys per list page. */
const PAGE_SIZE = 20

/** The panel. `ns` is the mounted `remote.toyPublisher` namespace. */
export function ToyPanel({ ns }: { readonly ns: ToyNamespace }): ReactNode {
  const { copy, zh } = useCopy()
  useToyStyles()

  const [tab, setTab] = useState<Tab>('toys')
  const [account, setAccount] = useState<AccountView | undefined>(undefined)
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountError, setAccountError] = useState<Failure | undefined>(undefined)
  const [toys, setToys] = useState<ToyListPage | undefined>(undefined)
  const [toysBusy, setToysBusy] = useState(false)
  const [toysError, setToysError] = useState<Failure | undefined>(undefined)
  const [selected, setSelected] = useState<ToySummary | undefined>(undefined)
  const [prefill, setPrefill] = useState<PublishPrefill | undefined>(undefined)
  const [note, setNote] = useState<string | undefined>(undefined)
  const [copiedKey, setCopiedKey] = useState<string | undefined>(undefined)
  const [cliBusy, setCliBusy] = useState(false)
  const [cliResult, setCliResult] = useState<{ readonly kind: 'latest' | 'upgraded'; readonly version?: string } | undefined>(undefined)
  const [cliError, setCliError] = useState<Failure | undefined>(undefined)
  const [cliUpdate, setCliUpdate] = useState<CliUpdateView | undefined>(undefined)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [cliOutput, setCliOutput] = useState<string | undefined>(undefined)
  const installCommands = [
    { key: 'unix', label: copy.installMacLinux, command: 'curl -fsSL https://boss.hdslb.com/toy-cli/toy/install.sh | bash' },
    { key: 'windows', label: copy.installWindows, command: 'irm https://boss.hdslb.com/toy-cli/toy/install.ps1 | iex' },
  ]
  const copyInstall = useCallback(async (key: string, command: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(undefined), 1500)
    } catch {
      // Clipboard unavailable (non-secure context): the command is selectable.
    }
  }, [])
  const cliButtonLabel = cliBusy
    ? copy.cliUpgradeChecking
    : cliResult?.kind === 'latest'
      ? copy.cliUpToDate
      : cliResult?.kind === 'upgraded'
        ? copy.cliUpgraded
        : copy.cliUpgrade
  const cliButtonIcon = cliResult === undefined ? 'download' : 'check'

  const checkCliUpdate = useCallback(async (): Promise<void> => {
    setCliBusy(true)
    setCliError(undefined)
    setCliResult(undefined)
    setCliOutput(undefined)
    const outcome = await call<CliUpdateView>('cliUpdateCheck', () => ns.cliUpdateCheck())
    setCliBusy(false)
    if (!outcome.ok) {
      setCliError(outcome.failure)
      return
    }
    const value = outcome.value
    if (!value.ok) {
      setCliError(value.error ?? { kind: 'cli', message: 'toy upgrade --check failed' })
      return
    }
    if (value.upToDate) {
      setCliResult({ kind: 'latest', ...(value.latest === undefined ? {} : { version: value.latest }) })
      return
    }
    setCliUpdate(value)
    setUpgradeOpen(true)
  }, [ns, copy])

  const pageRef = useRef(1)
  const nonceRef = useRef(0)

  const loadAccount = useCallback(async (): Promise<void> => {
    setAccountBusy(true)
    setAccountError(undefined)
    const outcome = await call<AccountView>('account', () => ns.account())
    setAccountBusy(false)
    if (!outcome.ok) {
      setAccountError(outcome.failure)
      return
    }
    setAccount(outcome.value)
    if (outcome.value.error !== undefined) setAccountError(outcome.value.error)
  }, [ns])

  const runCliUpgrade = useCallback(async (): Promise<void> => {
    setCliBusy(true)
    setCliError(undefined)
    const outcome = await call<CliUpgradeResult>('upgradeCli', () => ns.upgradeCli())
    setUpgradeOpen(false)
    if (!outcome.ok) {
      setCliBusy(false)
      setCliError(outcome.failure)
      return
    }
    const value = outcome.value
    setCliOutput(value.output)
    if (!value.ok) {
      setCliBusy(false)
      setCliError(value.error ?? { kind: 'cli', message: 'toy upgrade failed' })
      return
    }
    setCliResult({ kind: 'upgraded', ...(value.version === undefined ? {} : { version: value.version }) })
    if (value.version !== undefined) {
      setAccount((current) => (current === undefined ? current : { ...current, version: value.version }))
    }
    await loadAccount()
    setCliBusy(false)
  }, [ns, copy, loadAccount])

  const loadToys = useCallback(
    async (page: number): Promise<void> => {
      setToysBusy(true)
      setToysError(undefined)
      const outcome = await call<ToyListPage>('listToys', () => ns.listToys(page, PAGE_SIZE))
      setToysBusy(false)
      if (!outcome.ok) {
        setToysError(outcome.failure)
        return
      }
      pageRef.current = page
      setToys(outcome.value)
      const items = outcome.value.items
      setSelected((current) =>
        current === undefined ? undefined : items.find((toy) => toy.id === current.id) ?? current,
      )
    },
    [ns],
  )

  useEffect(() => {
    void loadAccount()
    void loadToys(1)
  }, [loadAccount, loadToys])

  useEffect(() => {
    if (note === undefined) return
    const timer = setTimeout(() => setNote(undefined), 6000)
    return () => clearTimeout(timer)
  }, [note])

  const notify = useCallback((message: string) => setNote(message), [])

  const login = useCallback(async (): Promise<void> => {
    setAccountBusy(true)
    setAccountError(undefined)
    setNote(copy.loggingIn)
    const outcome = await call<AccountView>('login', () => ns.login(false))
    setAccountBusy(false)
    if (!outcome.ok) {
      setAccountError(outcome.failure)
      setNote(undefined)
      return
    }
    const value = outcome.value
    setAccount(value)
    if (value.error !== undefined) {
      setAccountError(value.error)
      setNote(undefined)
      return
    }
    if (value.loggedIn) {
      setNote(copy.loginDone)
      void loadToys(1)
    } else {
      setNote(value.hint ?? copy.loginPending)
    }
  }, [ns, copy.loggingIn, copy.loginDone, copy.loginPending, loadToys])

  const logout = useCallback(async (): Promise<void> => {
    setAccountBusy(true)
    setAccountError(undefined)
    const outcome = await call<AccountView>('logout', () => ns.logout())
    setAccountBusy(false)
    if (!outcome.ok) {
      setAccountError(outcome.failure)
      return
    }
    setAccount(outcome.value)
    if (outcome.value.error !== undefined) setAccountError(outcome.value.error)
    setNote(copy.logoutDone)
  }, [ns, copy.logoutDone])

  const refreshAll = useCallback((): void => {
    void loadAccount()
    void loadToys(pageRef.current)
  }, [loadAccount, loadToys])

  const selectToy = useCallback((toy: ToySummary) => setSelected(toy), [])
  const openStats = useCallback((toy: ToySummary) => {
    setSelected(toy)
    setTab('stats')
  }, [])
  const startUpdate = useCallback((toy: ToySummary) => {
    setSelected(toy)
    nonceRef.current += 1
    setPrefill({ action: 'update', toy, nonce: nonceRef.current })
    setTab('publish')
  }, [])
  const useHistoryPath = useCallback((record: HistoryRecord) => {
    nonceRef.current += 1
    const action = record.action === 'update' && record.id !== undefined ? 'update' : 'create'
    setPrefill({
      action,
      nonce: nonceRef.current,
      ...(record.id === undefined ? {} : { id: record.id }),
      ...(record.path === undefined || record.path === '' ? {} : { path: record.path }),
      ...(record.title === undefined ? {} : { title: record.title }),
      ...(record.slug === undefined ? {} : { slug: record.slug }),
    })
    setTab('publish')
  }, [])

  const loggedIn = account?.loggedIn === true && account.user !== undefined
  const binaryMissing = accountError?.kind === 'binary-missing'
    || (account?.ok === false && account.error?.kind === 'binary-missing')
  const initial = account?.user !== undefined ? account.user.name.slice(0, 1).toUpperCase() : '?'

  const tabs: readonly { readonly id: Tab; readonly label: string }[] = [
    { id: 'toys', label: copy.tabToys },
    { id: 'stats', label: copy.tabStats },
    { id: 'publish', label: copy.tabPublish },
    { id: 'history', label: copy.tabHistory },
  ]

  return h(
    'div',
    { className: 'toy-root' },
    h(
      'div',
      { className: 'toy-shell' },
      h(
        'div',
        { className: 'toy-page-head' },
        h(
          'div',
          {},
          h('h1', { className: 'toy-title' }, copy.appTitle),
          h('p', { className: 'toy-subtitle' }, copy.appSubtitle),
        ),
        h(
          'div',
          { className: 'toy-head-actions' },
          h(
            Button,
            { onClick: refreshAll, disabled: accountBusy || toysBusy },
            h(Icon, { name: 'refresh' }),
            copy.refresh,
          ),
        ),
      ),
      h(
        'div',
        { className: 'toy-account' },
        h(
          'div',
          { className: 'toy-avatar', 'data-state': loggedIn ? 'in' : 'out', 'aria-hidden': true },
          loggedIn ? initial : h(Icon, { name: 'user', size: 20 }),
        ),
        account === undefined
          ? h(Loading, { label: copy.accountLoading })
          : h(
              'div',
              { className: 'toy-identity' },
              h(
                'span',
                { className: 'toy-identity-name', title: loggedIn ? account.user?.name : copy.notLoggedIn },
                loggedIn ? (account.user?.name ?? '') : copy.notLoggedIn,
              ),
              account.user === undefined
                ? null
                : h(
                    'span',
                    { className: 'toy-meta-row' },
                    h(Badge, {}, copy.uid(account.user.uid)),
                    account.version === undefined ? null : h(Badge, {}, `toy ${account.version}`),
                  ),
              account.binary === ''
                ? null
                : h(
                    'span',
                    { className: 'toy-meta-row' },
                    h('span', { className: 'toy-caption' }, `${copy.binaryLabel}:`),
                    h('span', { className: 'toy-mono', title: account.binary }, account.binary),
                  ),
            ),
        h('span', { className: 'toy-spacer' }),
        h(
          'div',
          { className: 'toy-head-actions' },
          account === undefined || account.version === undefined
            ? null
            : h('span', { className: 'toy-caption' }, `${copy.cliVersionLabel}: ${account.version}`),
          account === undefined || account.version === undefined
            ? null
            : h(
                Button,
                { onClick: () => void checkCliUpdate(), disabled: cliBusy || accountBusy, title: copy.cliUpgrade },
                h(Icon, { name: cliButtonIcon }),
                cliButtonLabel,
              ),
          h(
            Button,
            { onClick: () => void loadAccount(), disabled: accountBusy, title: copy.refreshAccount },
            h(Icon, { name: 'refresh' }),
            accountBusy ? copy.loading : copy.refreshAccount,
          ),
          loggedIn
            ? h(
                Button,
                { onClick: () => void logout(), disabled: accountBusy },
                h(Icon, { name: 'logout' }),
                copy.logout,
              )
            : h(
                Button,
                { variant: 'primary', onClick: () => void login(), disabled: accountBusy },
                h(Icon, { name: 'login' }),
                accountBusy ? copy.loggingIn : copy.login,
              ),
        ),
      ),
      cliOutput === undefined || cliOutput === ''
        ? null
        : h(
            'details',
            { className: 'toy-skill-output' },
            h('summary', {}, copy.cliUpgradeOutput),
            h('pre', { className: 'toy-output' }, cliOutput),
          ),
      cliError === undefined ? null : h(FailureBanner, { failure: cliError, copy }),
      accountError === undefined || binaryMissing ? null : h(FailureBanner, { failure: accountError, copy }),
      upgradeOpen && cliUpdate !== undefined
        ? h(
            Dialog,
            {
              title: copy.cliUpgradeConfirmTitle,
              closeLabel: copy.close,
              onClose: () => { if (!cliBusy) setUpgradeOpen(false) },
              footer: h(
                'div',
                { className: 'toy-skill-actions' },
                h(Button, { onClick: () => setUpgradeOpen(false), disabled: cliBusy }, copy.cliUpgradeCancel),
                h(Button, { variant: 'primary', onClick: () => void runCliUpgrade(), disabled: cliBusy }, cliBusy ? copy.cliUpgradeUpgrading : copy.cliUpgradeRun),
              ),
            },
            h('p', {}, copy.cliUpgradeConfirmBody(cliUpdate.current ?? '?', cliUpdate.latest ?? '?')),
            h('pre', { className: 'toy-output' }, cliUpdate.detail),
            h('p', { className: 'toy-caption' }, copy.cliUpgradeConfirmWarn),
          )
        : null,
      h(SkillCard, { ns, copy, active: true }),
      binaryMissing
        ? h(
            'div',
            { className: 'toy-install', role: 'region', 'aria-label': copy.installTitle },
            h('div', { className: 'toy-install-head' },
              h(Icon, { name: 'terminal', size: 22 }),
              h('h2', { className: 'toy-install-title' }, copy.installTitle),
            ),
            h('p', { className: 'toy-install-body' }, copy.installBody),
            installCommands.map(entry =>
              h('div', { key: entry.key, className: 'toy-code-row' },
                h('span', { className: 'toy-install-platform' }, entry.label),
                h('code', { className: 'toy-code' }, entry.command),
                h(
                  Button,
                  { onClick: () => void copyInstall(entry.key, entry.command), title: copy.installCopy },
                  h(Icon, { name: copiedKey === entry.key ? 'check' : 'copy' }),
                  copiedKey === entry.key ? copy.installCopied : copy.installCopy,
                ),
              ),
            ),
            h('p', { className: 'toy-caption' }, copy.installHint),
            h('div', { className: 'toy-install-actions' },
              h(
                Button,
                { variant: 'primary', onClick: () => void loadAccount(), disabled: accountBusy },
                h(Icon, { name: 'refresh' }),
                accountBusy ? copy.installRefreshing : copy.installRecheck,
              ),
            ),
          )
        : h(
            'div',
            { className: 'toy-install-tabs' },
            account !== undefined && !loggedIn && !accountBusy
              ? h(Banner, { tone: 'info', title: copy.notLoggedIn }, copy.loginHint)
              : null,
            note === undefined ? null : h(Banner, { tone: 'success' }, note),
            h(
              'div',
              { className: 'toy-tabs', role: 'tablist', 'aria-label': copy.appTitle, style: { alignSelf: 'flex-start' } },
              tabs.map((entry) =>
                h(
                  'button',
                  {
                    key: entry.id,
                    type: 'button',
                    className: 'toy-tab',
                    role: 'tab',
                    'aria-selected': tab === entry.id,
                    onClick: () => setTab(entry.id),
                  },
                  entry.label,
                  entry.id === 'toys' && toys !== undefined ? h('span', { className: 'toy-caption', style: { marginLeft: 6 } }, String(toys.total)) : null,
                ),
              ),
            ),
            h(
              'div',
              { hidden: tab !== 'toys' },
              h(ToysView, {
                copy,
                zh,
                page: toys,
                busy: toysBusy,
                error: toysError,
                selected,
                onRefresh: () => void loadToys(pageRef.current),
                onSelect: selectToy,
                onOpenStats: openStats,
                onUpdate: startUpdate,
                onPage: (page) => void loadToys(page),
              }),
            ),
            h(
              'div',
              { hidden: tab !== 'stats' },
              h(StatsView, {
                copy,
                ns,
                toys,
                selected,
                active: tab === 'stats',
                onSelectToy: selectToy,
              }),
            ),
            h(
              'div',
              { hidden: tab !== 'publish' },
              h(PublishView, {
                copy,
                zh,
                ns,
                toys,
                prefill,
                active: tab === 'publish',
                onSubmitted: () => void loadToys(pageRef.current),
                onNotify: notify,
                onGoToToys: () => setTab('toys'),
              }),
            ),
            h(
              'div',
              { hidden: tab !== 'history' },
              h(HistoryView, {
                copy,
                zh,
                ns,
                active: tab === 'history',
                onUsePath: useHistoryPath,
                onNotify: notify,
              }),
            ),
          ),
    ),
  )
}
