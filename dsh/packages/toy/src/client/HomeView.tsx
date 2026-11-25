/**
 * The panel home: one prominent publish/update action plus the account-level
 * dashboard (yesterday's traffic, week-over-week, the last seven days, the
 * portfolio and cumulative interactions). The duplicated shortcut cards and
 * doc links that used to sit here are gone — the tabs and "更多信息" own those.
 */

import { createElement as h, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { formatCount } from './api.ts'
import type { Failure, ToyNamespace } from './api.ts'
import type { Copy } from './i18n.ts'
import { FEED_MIN_DAYS, loadToyStats } from './statsFeed.ts'
import type { FeedProgress } from './statsFeed.ts'
import { accountSummary } from './statsAggregate.js'
import type { AccountSummary } from './statsAggregate.js'
import { Badge, Button, Empty, FailureBanner, Icon, Skeleton } from './ui.tsx'
import type { AccountView, ToySummary } from '../shared/types.ts'

/** One KPI card in the dashboard. */
function DashCard({
  label,
  value,
  sub,
  aside,
}: {
  readonly label: string
  readonly value: ReactNode
  readonly sub?: ReactNode
  readonly aside?: ReactNode
}): ReactNode {
  return h(
    'div',
    { className: 'toy-dash-card' },
    h('div', { className: 'toy-dash-head' }, h('span', { className: 'toy-caption' }, label), aside ?? null),
    h('div', { className: 'toy-dash-value' }, value),
    sub === undefined ? null : h('div', { className: 'toy-dash-sub' }, sub),
  )
}

/**
 * One App Store-style card: a 4:3 cover on top, then a frosted 4:1 bar with the
 * 1:1 icon, the name and four actions. Images keep their own ratio (cover is
 * cropped, never stretched).
 */
function WallCard({
  toy,
  copy,
  onStats,
  onUpdate,
  onManage,
  onView,
}: {
  readonly toy: ToySummary
  readonly copy: Copy
  readonly onStats: () => void
  readonly onUpdate: () => void
  /** Open this Toy on the My Toys tab with its detail selected. */
  readonly onManage: () => void
  /** Kept as a separate label, but also opens the in-panel detail. */
  readonly onView: () => void
}): ReactNode {
  const [coverFailed, setCoverFailed] = useState(false)
  const [iconFailed, setIconFailed] = useState(false)
  const cover = toy.posterUrl === undefined || toy.posterUrl === '' || coverFailed ? undefined : toy.posterUrl
  const icon = toy.iconUrl === undefined || toy.iconUrl === '' || iconFailed ? undefined : toy.iconUrl
  const initial = toy.title.slice(0, 1).toUpperCase()
  const actions: readonly { readonly key: string; readonly label: string; readonly icon: 'chart' | 'plus' | 'settings' | 'external'; readonly onClick: () => void }[] = [
    { key: 'stats', label: copy.wallStats, icon: 'chart', onClick: onStats },
    { key: 'update', label: copy.wallUpdate, icon: 'plus', onClick: onUpdate },
    { key: 'manage', label: copy.wallManage, icon: 'settings', onClick: onManage },
    { key: 'view', label: copy.wallView, icon: 'external', onClick: onView },
  ]
  return h(
    'article',
    { className: 'toy-wall-card' },
    h(
      'button',
      {
        type: 'button',
        className: 'toy-wall-cover',
        onClick: onManage,
        title: `${copy.wallManage}: ${toy.title}`,
        'aria-label': `${copy.wallManage}: ${toy.title}`,
      },
      cover === undefined
        ? h('span', { className: 'toy-wall-cover-fallback', 'aria-hidden': true }, h(Icon, { name: 'box', size: 28 }))
        : h('img', {
            src: cover,
            alt: toy.title,
            loading: 'lazy',
            referrerPolicy: 'no-referrer',
            onError: () => setCoverFailed(true),
          }),
    ),
    h(
      'div',
      { className: 'toy-wall-info' },
      cover === undefined
        ? null
        : h('img', {
            className: 'toy-wall-info-bg',
            src: cover,
            alt: '',
            'aria-hidden': true,
            loading: 'lazy',
            referrerPolicy: 'no-referrer',
          }),
      h('span', { className: 'toy-wall-info-tint', 'aria-hidden': true }),
      h(
        'span',
        { className: 'toy-wall-app' },
        icon === undefined
          ? h('span', { className: 'toy-wall-app-icon toy-wall-app-icon-fallback', 'aria-hidden': true }, initial)
          : h('img', {
              className: 'toy-wall-app-icon',
              src: icon,
              alt: '',
              loading: 'lazy',
              referrerPolicy: 'no-referrer',
              onError: () => setIconFailed(true),
            }),
        h('span', { className: 'toy-wall-app-text' }, h('span', { className: 'toy-wall-app-name', title: toy.title }, toy.title)),
      ),
      h(
        'span',
        { className: 'toy-wall-actions' },
        actions.map((action) =>
          h(
            'button',
            {
              key: action.key,
              type: 'button',
              className: 'toy-wall-action',
              title: action.label,
              'aria-label': action.label,
              onClick: action.onClick,
            },
            h(Icon, { name: action.icon, size: 13 }),
            h('span', {}, action.label),
          ),
        ),
      ),
    ),
  )
}

/** The panel home view. */
export function HomeView({
  copy,
  ns,
  account,
  toys,
  active,
  onPublish,
  onOpenToy,
  onStatsToy,
  onUpdateToy,
  onLogin,
  toysError,
  onRetryToys,
  onNavigate,
}: {
  readonly copy: Copy
  readonly ns: ToyNamespace
  readonly account: AccountView | undefined
  readonly toys: readonly ToySummary[] | undefined
  readonly active: boolean
  readonly onPublish: () => void
  /** Open a Toy on the My Toys tab (used by the works wall). */
  readonly onOpenToy: (toy: ToySummary) => void
  /** Open this Toy's data detail. */
  readonly onStatsToy: (toy: ToySummary) => void
  /** Start an update for this Toy. */
  readonly onUpdateToy: (toy: ToySummary) => void
  /** Start the B站 OAuth login. */
  readonly onLogin: () => void
  /** The catalogue load failure, when the first `mylist` attempt failed. */
  readonly toysError?: Failure
  readonly onRetryToys?: () => void
  readonly onNavigate: (target: 'publish' | 'toys' | 'stats' | 'history' | 'notify' | 'forum' | 'support' | 'info') => void
}): ReactNode {
  const [summary, setSummary] = useState<AccountSummary | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<FeedProgress | undefined>(undefined)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [tick, setTick] = useState(0)
  const seq = useRef(0)
  /** Set by the Refresh button so the next load skips both cache layers. */
  const forceNext = useRef(false)

  useEffect(() => {
    if (!active) return
    if (toys === undefined || toys.length === 0) return
    const run = seq.current + 1
    seq.current = run
    const force = forceNext.current
    forceNext.current = false
    setBusy(true)
    setError(undefined)
    void loadToyStats(
      ns,
      toys,
      FEED_MIN_DAYS,
      (next) => {
        if (seq.current === run) setProgress(next)
      },
      force,
    )
      .then((statsById) => {
        if (seq.current !== run) return
        setSummary(accountSummary(toys, statsById))
        setBusy(false)
      })
      .catch((reason: unknown) => {
        if (seq.current !== run) return
        setBusy(false)
        setError({ kind: 'stats', message: reason instanceof Error ? reason.message : copy.homeNoStats })
      })
    return () => {
      seq.current += 1
    }
  }, [active, ns, toys, tick, copy.homeNoStats])

  /** The works wall: the newest-updated Toys first, capped for the home page. */
  const wall = useMemo<readonly ToySummary[]>(
    () => [...(toys ?? [])].sort((left, right) => (right.mtime ?? 0) - (left.mtime ?? 0)).slice(0, 12),
    [toys],
  )

  const dash = summary
  const wow = dash?.wowPercent
  const catalogueLoading = toys === undefined && toysError === undefined
  const showSkeleton = dash === undefined && (catalogueLoading || busy)
  const loggedIn = account?.loggedIn === true
  const emptyWorkspace = toys !== undefined && toys.length === 0

  return h(
    'div',
    { className: 'toy-home' },
    h(
      'section',
      { className: 'toy-hero' },
      h('div', { className: 'toy-hero-kicker' }, copy.homeKicker),
      h('h2', { className: 'toy-hero-title' }, copy.homeTitle),
      h('p', { className: 'toy-hero-sub' }, copy.homeSubtitle),
      h(
        'div',
        { className: 'toy-hero-actions' },
        h(
          'button',
          { type: 'button', className: 'toy-btn toy-hero-cta', 'data-variant': 'primary', onClick: onPublish },
          h(Icon, { name: 'plus', size: 18 }),
          copy.homePublish,
        ),
        h(
          'button',
          { type: 'button', className: 'toy-btn toy-hero-secondary', onClick: () => onNavigate('toys') },
          h(Icon, { name: 'box', size: 15 }),
          account?.user === undefined ? copy.homeBrowse : copy.homeBrowseSignedIn(account.user.name),
        ),
      ),
    ),
    toysError !== undefined && toys === undefined
      ? h(
          'section',
          { className: 'toy-panel' },
          h(FailureBanner, { failure: toysError, copy }),
          h(
            Button,
            { size: 'sm', onClick: onRetryToys },
            h(Icon, { name: 'refresh' }),
            copy.refresh,
          ),
        )
      : null,
    account !== undefined && !loggedIn
      ? h(
          'section',
          { className: 'toy-onboarding' },
          h(
            'div',
            { className: 'toy-onboarding-head' },
            h('span', { className: 'toy-onboarding-icon' }, h(Icon, { name: 'user', size: 20 })),
            h(
              'div',
              {},
              h('h3', { className: 'toy-onboarding-title' }, copy.homeLoginTitle),
              h('p', { className: 'toy-caption', style: { margin: '4px 0 0' } }, copy.homeLoginSubtitle),
            ),
          ),
          h(
            'div',
            { className: 'toy-onboarding-actions' },
            h(Button, { variant: 'primary', onClick: onLogin }, h(Icon, { name: 'login' }), copy.onboardingLoginCta),
          ),
        )
      : emptyWorkspace
        ? h(
            'section',
            { className: 'toy-onboarding' },
            h(
              'div',
              { className: 'toy-onboarding-head' },
              h('span', { className: 'toy-onboarding-icon' }, h(Icon, { name: 'plus', size: 20 })),
              h(
                'div',
                {},
                h('h3', { className: 'toy-onboarding-title' }, copy.onboardingTitle),
                h('p', { className: 'toy-caption', style: { margin: '4px 0 0' } }, copy.onboardingSubtitle),
              ),
            ),
            h(
              'ol',
              { className: 'toy-onboarding-steps' },
              [copy.onboardingStepLogin, copy.onboardingStepCli, copy.onboardingStepPublish, copy.onboardingStepData].map((step, index) =>
                h('li', { key: String(index) }, step),
              ),
            ),
            h(
              'div',
              { className: 'toy-onboarding-actions' },
              h(Button, { variant: 'primary', onClick: onPublish }, h(Icon, { name: 'plus' }), copy.onboardingPublishCta),
              h(Button, { onClick: () => onNavigate('info') }, h(Icon, { name: 'info' }), copy.onboardingDocsCta),
            ),
          )
        : null,
    loggedIn && !emptyWorkspace && toysError === undefined ? h(
      'section',
      { className: 'toy-dashboard' },
      h(
        'div',
        { className: 'toy-dashboard-head' },
        h(
          'div',
          {},
          h('div', { className: 'toy-section-title' }, copy.homeDashboard),
          h(
            'div',
            { className: 'toy-caption' },
            dash?.date === undefined ? copy.homeDataHint : copy.homeDataAsOf(dash.date),
          ),
        ),
        h(
          'div',
          { className: 'toy-toolbar' },
          busy || catalogueLoading
            ? h(
                'span',
                { className: 'toy-caption' },
                catalogueLoading
                  ? copy.homeDataHint
                  : progress === undefined
                    ? copy.loading
                    : copy.homeLoading(progress.done, progress.total),
              )
            : null,
          h(
            Button,
            {
              size: 'sm',
              disabled: busy || catalogueLoading,
              onClick: () => {
                forceNext.current = true
                setTick((value) => value + 1)
              },
            },
            h(Icon, { name: 'refresh' }),
            copy.homeRefresh,
          ),
        ),
      ),
      busy && progress !== undefined && progress.total > 0
        ? h(
            'div',
            { className: 'toy-overview-progress', 'aria-hidden': true },
            h('span', { style: { width: `${Math.round((progress.done / progress.total) * 100)}%` } }),
          )
        : null,
      error === undefined ? null : h(FailureBanner, { failure: error, copy }),
      showSkeleton
        ? h(
            'div',
            { className: 'toy-dash-grid' },
            Array.from({ length: 4 }, (_unused, index) =>
              h(
                'div',
                { key: String(index), className: 'toy-dash-card' },
                h('span', { className: 'toy-skeleton toy-skeleton-line', style: { width: '52%' } }),
                h('span', { className: 'toy-skeleton toy-skeleton-line', style: { width: '34%', height: 24 } }),
                h('span', { className: 'toy-skeleton toy-skeleton-line', style: { width: '66%' } }),
              ),
            ),
          )
        : h(
            'div',
            { className: 'toy-dash-grid' },
            h(DashCard, {
              label: copy.homeYesterday,
              value: formatCount(dash?.yesterdayPv ?? 0),
              aside:
                wow === undefined
                  ? h('span', { className: 'toy-caption' }, copy.homeWowNoData)
                  : h(
                      Badge,
                      { tone: wow >= 0 ? 'ok' : 'error' },
                      copy.homeWow(wow),
                    ),
              sub: h(
                'span',
                {},
                `${copy.statsYesterdayUv} ${formatCount(dash?.yesterdayUv ?? 0)}`,
                dash === undefined ? null : h('span', { className: 'toy-caption' }, ` · ${copy.homeWeekAgoPv} ${formatCount(dash.weekAgoPv)}`),
              ),
            }),
            h(DashCard, {
              label: copy.homeLast7,
              value: formatCount(dash?.last7Pv ?? 0),
              aside:
                dash?.wow7PvPercent === undefined
                  ? h('span', { className: 'toy-caption' }, copy.homeWow7NoData)
                  : h(Badge, { tone: dash.wow7PvPercent >= 0 ? 'ok' : 'error' }, copy.homeWow7(dash.wow7PvPercent)),
              sub: h(
                'span',
                { className: 'toy-dash-sub' },
                `${copy.homeUvAvg} ${formatCount(dash?.last7UvAvg ?? 0)} · ${copy.homeUvPeak} ${formatCount(dash?.last7UvPeak ?? 0)}`,
                dash?.wow7UvPercent === undefined
                  ? null
                  : h(Badge, { tone: dash.wow7UvPercent >= 0 ? 'ok' : 'error' }, copy.homeWow7(dash.wow7UvPercent)),
              ),
            }),
            h(DashCard, {
              label: copy.homePortfolio,
              value: formatCount(dash?.portfolio.total ?? toys?.length ?? 0),
              sub:
                dash === undefined
                  ? null
                  : h('span', {}, copy.homePortfolioSub(dash.portfolio.published, dash.portfolio.total - dash.portfolio.published)),
            }),
            h(DashCard, {
              label: copy.homeInteractions,
              value: formatCount(dash?.interactions.total ?? 0),
              sub:
                dash === undefined
                  ? null
                  : h(
                      'span',
                      { className: 'toy-caption' },
                      copy.homeInteractionsSub(
                        dash.interactions.like,
                        dash.interactions.favorite,
                        dash.interactions.comment,
                        dash.interactions.share,
                      ),
                    ),
            }),
          ),
      dash !== undefined && dash.missing > 0
        ? h('div', { className: 'toy-caption' }, copy.homeMissing(dash.missing))
        : null,
      dash !== undefined && dash.measured === 0 && !busy
        ? h('div', { className: 'toy-caption' }, copy.homeNoStats)
        : null,
      dash !== undefined && dash.measured > 0 && dash.yesterdayPv === 0 && dash.last7Pv === 0 && !busy
        ? h('div', { className: 'toy-caption' }, copy.homeNoDataHint)
        : null,
    ) : null,
    loggedIn && toysError === undefined ? h(
      'section',
      { className: 'toy-works' },
      h(
        'div',
        { className: 'toy-works-head' },
        h(
          'div',
          {},
          h('div', { className: 'toy-section-title' }, copy.homeWorks),
          h('div', { className: 'toy-caption' }, copy.homeWorksHint),
        ),
        h(
          Button,
          { size: 'sm', onClick: () => onNavigate('toys') },
          copy.homeViewAll,
          h(Icon, { name: 'chevronRight', size: 14 }),
        ),
      ),
      toys === undefined
        ? h(
            'div',
            { className: 'toy-wall-grid' },
            Array.from({ length: 8 }, (_unused, index) =>
              h(
                'div',
                { key: String(index), className: 'toy-wall-card toy-wall-skeleton' },
                h('span', { className: 'toy-skeleton toy-skeleton-cover' }),
                h('span', { className: 'toy-skeleton toy-skeleton-line', style: { width: '60%' } }),
              ),
            ),
          )
        : wall.length === 0
          ? h(
              Empty,
              {},
              h('span', {}, copy.homeWorksEmpty),
              h(Button, { size: 'sm', variant: 'primary', onClick: onPublish }, h(Icon, { name: 'plus' }), copy.onboardingPublishCta),
            )
          : h(
              'div',
              { className: 'toy-wall-grid' },
              wall.map((toy) =>
                h(WallCard, {
                  key: String(toy.id),
                  toy,
                  copy,
                  onStats: () => onStatsToy(toy),
                  onUpdate: () => onUpdateToy(toy),
                  onManage: () => onOpenToy(toy),
                  onView: () => onOpenToy(toy),
                }),
              ),
            ),
    ) : null,
  )
}

