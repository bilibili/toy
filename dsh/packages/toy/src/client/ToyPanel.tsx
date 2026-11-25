/**
 * The full bilibili Toy page: a compact account bar, four tabs (My Toys, Stats,
 * Publish/Update, History) and a maintenance dialog for the host CLI and skill.
 *
 * Every tab stays mounted so a prepared preview and a half-filled publish form
 * survive tab switches; data loading is gated on the tab being visible. The page
 * never uploads on mount: the only CLI writes happen after explicit user
 * actions in the Publish tab.
 */

import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { call } from './api.ts'
import type { Failure, ToyNamespace } from './api.ts'
import { ExternalView } from './ExternalView.tsx'
import { HomeView } from './HomeView.tsx'
import { useCopy } from './i18n.ts'
import { InfoView } from './InfoView.tsx'
import { TOY_LINKS, openLink } from './links.ts'
import { NotifyView } from './NotifyView.tsx'
import { readNotifySeen, writeNotifySeen } from './notifySeen.ts'
import { HistoryView } from './HistoryView.tsx'
import { PublishView } from './PublishView.tsx'
import { SkillCard } from './SkillCard.tsx'
import type { PublishPrefill } from './PublishView.tsx'
import { StatsView } from './StatsView.tsx'
import { setStatsAccount } from './statsFeed.ts'
import { useToyStyles } from './styles.ts'
import { ToysView } from './ToysView.tsx'
import { ToyMark } from './ToyMark.tsx'
import { Banner, Badge, Button, Dialog, FailureBanner, Icon, Toolbar } from './ui.tsx'
import type {
  AccountView,
  CliUpdateView,
  CliUpgradeResult,
  HistoryRecord,
  NotifyFeed,
  ToyListPage,
  ToySummary,
} from '../shared/types.ts'

type Tab = 'publish' | 'toys' | 'stats' | 'history' | 'notify' | 'forum' | 'support' | 'info'
type View = Tab | 'home'

/** Cards requested per Host call; the platform caps a `mylist` page at 50. */
const FETCH_SIZE = 50
/** Safety stop for the catalogue load: 20 calls × 50 = 1000 Toys. */
const MAX_FETCH_PAGES = 20

/** The loaded account catalogue, as this page keeps it. */
interface Catalogue {
  readonly total: number
  readonly items: readonly ToySummary[]
  readonly truncated: boolean
}

/** The panel. `ns` is the mounted `remote.toyPublisher` namespace. */
export function ToyPanel({ ns }: { readonly ns: ToyNamespace }): ReactNode {
  const { copy, zh } = useCopy()
  useToyStyles()

  const [tab, setTab] = useState<View>('home')
  const [account, setAccount] = useState<AccountView | undefined>(undefined)
  const statsAccountUid = account?.loggedIn === true ? account.user?.uid : undefined
  useEffect(() => { setStatsAccount(statsAccountUid) }, [statsAccountUid])
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountError, setAccountError] = useState<Failure | undefined>(undefined)
  const [catalogue, setCatalogue] = useState<Catalogue | undefined>(undefined)
  const [toysBusy, setToysBusy] = useState(false)
  const [toysError, setToysError] = useState<Failure | undefined>(undefined)
  const [toysReset, setToysReset] = useState(0)
  const [notifyNewCount, setNotifyNewCount] = useState(0)
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
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)
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
  }, [ns])

  /** Generation of the running catalogue load; stale runs drop their results. */
  const loadSeq = useRef(0)
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
  }, [ns, loadAccount])

  /**
   * Read the whole account once: page through `mylist` and keep every card, so
   * the grid filters locally and the Stats / Publish pickers can reach a Toy
   * that is not on the visible page.
   */
  const loadToys = useCallback(async (): Promise<void> => {
    // Only the newest run may touch the grid: login, submit and refresh can
    // overlap, and a slower older run must not overwrite newer cards.
    loadSeq.current += 1
    const seq = loadSeq.current
    setToysBusy(true)
    setToysError(undefined)
    const byId = new Map<number, ToySummary>()
    let total = 0
    let failure: Failure | undefined
    for (let index = 1; index <= MAX_FETCH_PAGES; index += 1) {
      const outcome = await call<ToyListPage>('listToys', () => ns.listToys(index, FETCH_SIZE))
      if (seq !== loadSeq.current) return
      if (!outcome.ok) {
        failure = outcome.failure
        break
      }
      total = outcome.value.total
      for (const toy of outcome.value.items) byId.set(toy.id, toy)
      if (!outcome.value.hasNext || outcome.value.items.length === 0) break
    }
    setToysBusy(false)
    if (failure !== undefined) {
      setToysError(failure)
      return
    }
    const items = [...byId.values()]
    const accountTotal = Math.max(total, items.length)
    setCatalogue({ total: accountTotal, items, truncated: items.length < accountTotal })
    setSelected((current) =>
      current === undefined ? undefined : items.find((toy) => toy.id === current.id) ?? current,
    )
  }, [ns])

  useEffect(() => {
    void loadAccount()
    void loadToys()
  }, [loadAccount, loadToys])

  useEffect(() => {
    if (note === undefined) return
    const timer = setTimeout(() => setNote(undefined), 4200)
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
      // A login may be a different account: start from its first page.
      setToysReset((token) => token + 1)
      void loadToys()
      setMaintenanceOpen(false)
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
    // The catalogue belongs to the account that just logged out.
    loadSeq.current += 1
    setCatalogue(undefined)
    setSelected(undefined)
    setToysBusy(false)
    setToysError(undefined)
    setToysReset((token) => token + 1)
    setNote(copy.logoutDone)
  }, [ns, copy.logoutDone])

  /** Switch一级入口; the two external entries also open their site. */
  const selectTab = useCallback((next: Tab): void => {
    // Re-clicking the active entry must not open the browser again; the tab's
    // fallback card still has its own link for that.
    if (next === tab) return
    // External destinations open in the browser; the panel keeps only the
    // fallback link card for popup-blocked cases.
    if (next === 'forum') openLink(TOY_LINKS.forum)
    else if (next === 'support') openLink(TOY_LINKS.support)
    setTab(next)
  }, [tab])

  const refreshAll = useCallback((): void => {
    setToysReset((token) => token + 1)
    void loadAccount()
    void loadToys()
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

  // Fetch the unread count once per account sign-in so the Notifications tab
  // can advertise new items before the user opens it.
  useEffect(() => {
    if (!loggedIn) {
      setNotifyNewCount(0)
      return
    }
    let disposed = false
    void call<NotifyFeed>('notifications', () => ns.notifications(0)).then((outcome) => {
      if (disposed || !outcome.ok) return
      const latest = outcome.value.items.reduce((max, item) => Math.max(max, item.time ?? 0), 0)
      const seen = readNotifySeen(statsAccountUid)
      if (seen === undefined) {
        writeNotifySeen(statsAccountUid, latest)
        setNotifyNewCount(0)
        return
      }
      setNotifyNewCount(outcome.value.items.filter((item) => (item.time ?? 0) > seen).length)
    })
    return () => {
      disposed = true
    }
  }, [ns, loggedIn, statsAccountUid])
  const binaryMissing = accountError?.kind === 'binary-missing'
    || (account?.ok === false && account.error?.kind === 'binary-missing')
  const initial = account?.user !== undefined ? account.user.name.slice(0, 1).toUpperCase() : '?'

  /** The whole account, for the Toy pickers of Stats and Publish (stable identity). */
  const allToys = useMemo<ToyListPage | undefined>(
    () => catalogue === undefined
      ? undefined
      : {
          total: catalogue.total,
          page: 1,
          size: catalogue.items.length,
          pages: 1,
          hasNext: false,
          items: [...catalogue.items],
        },
    [catalogue],
  )

  const tabs: readonly {
    readonly id: Tab
    readonly icon: 'plus' | 'box' | 'chart' | 'clock' | 'bell' | 'chat' | 'headset' | 'info'
    readonly label: string
  }[] = [
    { id: 'publish', icon: 'plus', label: copy.tabPublish },
    { id: 'toys', icon: 'box', label: copy.tabToys },
    { id: 'stats', icon: 'chart', label: copy.tabStats },
    { id: 'history', icon: 'clock', label: copy.tabHistory },
    { id: 'notify', icon: 'bell', label: copy.tabNotify },
    { id: 'forum', icon: 'chat', label: copy.tabForum },
    { id: 'support', icon: 'headset', label: copy.tabSupport },
    { id: 'info', icon: 'info', label: copy.tabInfo },
  ]

  /** The一级 entries; the header stays put while the body switches views. */
  const tabbar = h(
    'div',
    { className: 'toy-tabbar' },
    h(
      'div',
      { className: 'toy-tabs', role: 'tablist', 'aria-label': copy.appTitle },
      h(
        'button',
        {
          type: 'button',
          className: 'toy-tab toy-tab-home',
          role: 'tab',
          'aria-selected': tab === 'home',
          onClick: () => setTab('home'),
          title: copy.home,
        },
        h(Icon, { name: 'home', size: 14 }),
        copy.home,
      ),
      tabs.map((entry) =>
        h(
          'button',
          {
            key: entry.id,
            type: 'button',
            className: 'toy-tab',
            role: 'tab',
            'aria-selected': tab === entry.id,
            onClick: () => selectTab(entry.id),
          },
          h(Icon, { name: entry.icon, size: 14 }),
          entry.label,
          entry.id === 'toys' && catalogue !== undefined
            ? h('span', { className: 'toy-tab-count' }, String(catalogue.total))
            : null,
          entry.id === 'notify' && notifyNewCount > 0
            ? h('span', { className: 'toy-tab-badge', title: copy.notifyBadgeHint }, notifyNewCount > 99 ? '99+' : String(notifyNewCount))
            : null,
        ),
      ),
    ),
    h('span', { className: 'toy-caption' }, copy.readOnlyNote),
  )

  return h(
    'div',
    { className: 'toy-root' },
    h(
      'div',
      { className: 'toy-shell' },
      h(
        'div',
        { className: 'toy-header' },
        h(
          'div',
          { className: 'toy-topbar' },
          h(
            'button',
            { type: 'button', className: 'toy-brand', onClick: () => setTab('home'), title: copy.home },
            h('span', { className: 'toy-brand-mark' }, h(ToyMark, { size: 30 })),
            h(
              'div',
              { className: 'toy-brand-text' },
              h('h1', { className: 'toy-title' }, copy.appTitle),
              h('p', { className: 'toy-topbar-sub', title: copy.appSubtitle }, copy.appSubtitle),
            ),
          ),
          h(
            'div',
            { className: 'toy-topbar-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'toy-account-chip',
                title: copy.accountChipHint,
                'aria-label': copy.accountChipHint,
                onClick: () => setMaintenanceOpen(true),
              },
              h(
                'span',
                { className: 'toy-avatar', 'data-state': loggedIn ? 'in' : 'out', 'aria-hidden': true },
                loggedIn ? initial : h(Icon, { name: 'user', size: 14 }),
              ),
              h(
                'span',
                { className: 'toy-account-chip-text' },
                h(
                  'span',
                  { className: 'toy-account-chip-name' },
                  account === undefined ? copy.accountLoading : loggedIn ? (account.user?.name ?? '') : copy.notLoggedIn,
                ),
                h(
                  'span',
                  { className: 'toy-account-chip-meta' },
                  loggedIn && account.user !== undefined ? copy.uid(account.user.uid) : copy.maintenance,
                ),
              ),
            ),
            h(
              Button,
              { size: 'sm', onClick: refreshAll, disabled: accountBusy || toysBusy, title: copy.refresh },
              h(Icon, { name: 'refresh' }),
              copy.refresh,
            ),
            loggedIn
              ? h(
                  Button,
                  { size: 'sm', onClick: () => void logout(), disabled: accountBusy },
                  h(Icon, { name: 'logout' }),
                  copy.logout,
                )
              : h(
                  Button,
                  { size: 'sm', variant: 'primary', onClick: () => void login(), disabled: accountBusy },
                  h(Icon, { name: 'login' }),
                  accountBusy ? copy.loggingIn : copy.login,
                ),
            h(
              Button,
              { size: 'sm', onClick: () => setMaintenanceOpen(true), title: copy.maintenanceTitle },
              h(Icon, { name: 'settings' }),
              copy.maintenance,
            ),
          ),
        ),
        binaryMissing ? null : tabbar,
      ),
      accountError === undefined || binaryMissing || maintenanceOpen ? null : h(FailureBanner, { failure: accountError, copy }),
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
                {
                  variant: 'primary',
                  disabled: accountBusy,
                  onClick: () => {
                    void loadAccount()
                    void loadToys()
                  },
                },
                h(Icon, { name: 'refresh' }),
                accountBusy ? copy.installRefreshing : copy.installRecheck,
              ),
            ),
          )
        : h(
            'div',
            { className: 'toy-body' },
            account !== undefined && !loggedIn && !accountBusy
              ? h(
                  Banner,
                  {
                    tone: 'info',
                    title: copy.notLoggedIn,
                    actions: h(
                      Button,
                      { size: 'sm', variant: 'primary', onClick: () => void login() },
                      h(Icon, { name: 'login' }),
                      copy.onboardingLoginCta,
                    ),
                  },
                  copy.loginHint,
                )
              : null,
            h(
              'div',
              { hidden: tab !== 'home' },
              h(HomeView, {
                copy,
                ns,
                account,
                statsUid: statsAccountUid,
                toys: catalogue?.items,
                active: tab === 'home',
                onPublish: () => setTab('publish'),
                onOpenToy: (toy) => {
                  setSelected(toy)
                  setTab('toys')
                },
                onStatsToy: openStats,
                onUpdateToy: startUpdate,
                onLogin: () => void login(),
                toysError,
                onRetryToys: () => void loadToys(),
                onNavigate: selectTab,
              }),
            ),
            h(
              'div',
              { hidden: tab !== 'toys' },
              h(ToysView, {
                copy,
                zh,
                items: catalogue?.items,
                ...(catalogue === undefined ? {} : { total: catalogue.total }),
                busy: toysBusy,
                error: toysError,
                selected,
                resetSignal: toysReset,
                onRefresh: () => void loadToys(),
                onSelect: selectToy,
                onOpenStats: openStats,
                onUpdate: startUpdate,
                onGoPublish: () => setTab('publish'),
              }),
            ),
            h(
              'div',
              { hidden: tab !== 'stats' },
              h(StatsView, {
                copy,
                zh,
                ns,
                statsUid: statsAccountUid,
                toys: allToys,
                selected,
                active: tab === 'stats',
                onSelectToy: selectToy,
                onClearToy: () => setSelected(undefined),
                onGoPublish: () => setTab('publish'),
                catalogueError: toysError,
                onRetryCatalogue: () => void loadToys(),
              }),
            ),
            h(
              'div',
              { hidden: tab !== 'publish' },
              h(PublishView, {
                copy,
                zh,
                ns,
                toys: allToys,
                catalogueError: toysError,
                onRetryCatalogue: () => void loadToys(),
                prefill,
                active: tab === 'publish',
                onSubmitted: () => {
                  // A new/updated Toy sorts first: show it once the list reloads.
                  setToysReset((token) => token + 1)
                  void loadToys()
                },
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
                onGoPublish: () => setTab('publish'),
              }),
            ),
            h(
              'div',
              { hidden: tab !== 'notify' },
              h(NotifyView, {
                copy,
                ns,
                active: tab === 'notify',
                onRead: (latest) => {
                  setNotifyNewCount(0)
                  writeNotifySeen(statsAccountUid, latest)
                },
              }),
            ),
            h(
              'div',
              { hidden: tab !== 'forum' },
              h(ExternalView, {
                copy,
                title: copy.tabForum,
                description: copy.forumDesc,
                href: TOY_LINKS.forum,
                buttonLabel: copy.forumOpen,
              }),
            ),
            h(
              'div',
              { hidden: tab !== 'support' },
              h(ExternalView, {
                copy,
                title: copy.tabSupport,
                description: copy.supportDesc,
                href: TOY_LINKS.support,
                buttonLabel: copy.supportOpen,
              }),
            ),
            h(
              'div',
              { hidden: tab !== 'info' },
              h(InfoView, { copy }),
            ),
          ),
      note === undefined
        ? null
        : h(
            'div',
            { className: 'toy-toast', 'data-tone': 'success', role: 'status', 'aria-live': 'polite' },
            h(Icon, { name: 'check', size: 14 }),
            h('span', {}, note),
            h(
              'button',
              {
                type: 'button',
                className: 'toy-icon-btn',
                onClick: () => setNote(undefined),
                'aria-label': copy.dismiss,
                title: copy.dismiss,
              },
              h(Icon, { name: 'close', size: 13 }),
            ),
          ),
      maintenanceOpen
        ? h(
            Dialog,
            {
              title: copy.maintenanceTitle,
              closeLabel: copy.close,
              onClose: () => { if (!cliBusy && !accountBusy) setMaintenanceOpen(false) },
              footer: h(
                Toolbar,
                {},
                h(Button, { onClick: () => setMaintenanceOpen(false), disabled: cliBusy || accountBusy }, copy.close),
              ),
            },
            h(
              'div',
              { className: 'toy-maintenance' },
              h('p', { className: 'toy-caption', style: { margin: 0 } }, copy.maintenanceSubtitle),
              cliError === undefined ? null : h(FailureBanner, { failure: cliError, copy }),
              accountError === undefined || binaryMissing ? null : h(FailureBanner, { failure: accountError, copy }),
              h(
                'div',
                { className: 'toy-maintenance-section' },
                h(
                  'div',
                  { className: 'toy-maintenance-head' },
                  h('span', { className: 'toy-maintenance-title' }, h(Icon, { name: 'user', size: 15 }), copy.maintenanceAccount),
                  h(
                    'div',
                    { className: 'toy-toolbar' },
                    h(Button, { size: 'sm', onClick: () => void loadAccount(), disabled: accountBusy }, h(Icon, { name: 'refresh' }), copy.refreshAccount),
                    loggedIn
                      ? h(Button, { size: 'sm', onClick: () => void logout(), disabled: accountBusy }, h(Icon, { name: 'logout' }), copy.logout)
                      : h(Button, { size: 'sm', variant: 'primary', onClick: () => void login(), disabled: accountBusy }, h(Icon, { name: 'login' }), accountBusy ? copy.loggingIn : copy.login),
                  ),
                ),
                h(
                  'div',
                  { className: 'toy-meta-row' },
                  account === undefined
                    ? h('span', {}, copy.accountLoading)
                    : account.user === undefined
                      ? h('span', {}, copy.notLoggedIn)
                      : h(Badge, {}, copy.signedInAs(account.user.name)),
                  account?.user === undefined ? null : h(Badge, {}, copy.uid(account.user.uid)),
                  account?.version === undefined ? null : h(Badge, {}, `toy ${account.version}`),
                ),
                account?.binary === undefined || account.binary === ''
                  ? null
                  : h(
                      'div',
                      { className: 'toy-kv' },
                      h('span', { className: 'toy-kv-label' }, copy.binaryLabel),
                      h('span', { className: 'toy-mono', title: account.binary }, account.binary),
                    ),
                h('div', { className: 'toy-caption' }, copy.readOnlyNote),
              ),
              h(
                'div',
                { className: 'toy-maintenance-section' },
                h(
                  'div',
                  { className: 'toy-maintenance-head' },
                  h('span', { className: 'toy-maintenance-title' }, h(Icon, { name: 'terminal', size: 15 }), copy.maintenanceCli),
                  h(
                    'div',
                    { className: 'toy-toolbar' },
                    cliResult?.kind === 'latest'
                      ? h(Badge, { tone: 'ok' }, copy.cliLatestShort)
                      : null,
                    h(
                      Button,
                      { size: 'sm', onClick: () => void checkCliUpdate(), disabled: cliBusy || accountBusy },
                      h(Icon, { name: cliButtonIcon }),
                      cliButtonLabel,
                    ),
                  ),
                ),
                account?.version === undefined
                  ? h('div', { className: 'toy-caption' }, copy.accountLoading)
                  : h('div', { className: 'toy-caption' }, `${copy.cliVersionLabel}: ${account.version}`),
                cliOutput === undefined || cliOutput === ''
                  ? null
                  : h(
                      'details',
                      { className: 'toy-skill-output' },
                      h('summary', {}, copy.cliUpgradeOutput),
                      h('pre', { className: 'toy-output' }, cliOutput),
                    ),
              ),
              h(SkillCard, { ns, copy, active: maintenanceOpen }),
            ),
          )
        : null,
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
    ),
  )
}
