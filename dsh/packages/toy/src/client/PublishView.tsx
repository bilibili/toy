/**
 * The "发布 / 更新" wizard.
 *
 * Safety model (mirrors the Host):
 * 1. the local package precheck is read-only and blocks nothing by itself;
 * 2. "生成预览" uploads once without `--yes` and stores a one-shot pending id in
 *    the Host (or, for a metadata-only update, only plans the command);
 * 3. "提交审核" is disabled until the user ticks the explicit confirmation box,
 *    then asks again in an in-page dialog before calling `submitPublish`.
 *
 * Abandoning a preview calls `cancelPending`; a mount never touches the network.
 */

import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'

import { actionLabel, call, changeFieldLabel, changeValue, countdown, failureOf, toyPageUrl } from './api.ts'
import type { Failure, ToyNamespace } from './api.ts'
import type { Copy } from './i18n.ts'
import { Badge, Banner, Button, Dialog, Empty, FailureBanner, Field, Icon, Loading, SectionHead, Toolbar } from './ui.tsx'
import { ToyPicker } from './ToyPicker.tsx'
import type {
  ActionResult,
  PublishInput,
  PublishPreparation,
  SubmitResult,
  ToyChange,
  ToyListPage,
  ToyPrecheck,
  ToySummary,
} from '../shared/types.ts'

/** A request from another tab to prefill the form. `nonce` makes repeats distinct. */
export interface PublishPrefill {
  readonly action: 'create' | 'update'
  readonly toy?: ToySummary
  /** Target id when the request comes from a history record instead of a Toy card. */
  readonly id?: number
  readonly path?: string
  readonly title?: string
  readonly slug?: string
  readonly nonce: number
}

type WatermarkChoice = '' | 'on' | 'off'

/** The prefill snapshot used to turn Host changes into a real display diff. */
interface PrefillBaseline {
  readonly title: string
  readonly category: string
  readonly theme: string
  readonly visibility: string
  readonly watermark: WatermarkChoice
}

/** Baseline captured when an update target is picked from the Toy list. */
function baselineOfToy(toy: ToySummary): PrefillBaseline {
  return {
    title: toy.title,
    category: toy.category ?? '',
    theme: toy.theme ?? '',
    visibility: toy.visibility ?? '',
    watermark: toy.watermark === true ? 'on' : toy.watermark === false ? 'off' : '',
  }
}

/** Whether one Host change is already represented by the prefill baseline. */
function matchesBaseline(change: ToyChange, baseline: PrefillBaseline | undefined): boolean {
  if (baseline === undefined) return false
  const value = typeof change.value === 'boolean' ? (change.value ? 'on' : 'off') : String(change.value)
  switch (change.field) {
    case 'title':
      return value === baseline.title
    case 'category':
      return value === baseline.category
    case 'theme':
      return value === baseline.theme
    case 'visibility':
      return value === baseline.visibility
    case 'watermark':
      return value === baseline.watermark
    default:
      return false
  }
}

/** The CLI's category enum, sent verbatim. */
const CATEGORIES = ['GAME', 'INTERACTIVE_PLAY', 'TOOL', 'TEST', 'GUIDE', 'COLLECTION', 'OTHER'] as const
/** The CLI's theme enum, sent verbatim. */
const THEMES = ['dark', 'light'] as const

/** Grouped precheck findings. */
function PrecheckReport({ report, copy, zh }: { readonly report: ToyPrecheck; readonly copy: Copy; readonly zh: boolean }): ReactNode {
  const errors = report.findings.filter((finding) => finding.severity === 'ERROR')
  const warnings = report.findings.filter((finding) => finding.severity === 'WARN')
  const group = (title: string, items: ToyPrecheck['findings']): ReactNode =>
    items.length === 0
      ? null
      : h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          h('div', { className: 'toy-finding-group-title' }, title),
          h(
            'div',
            { className: 'toy-findings' },
            items.map((finding, index) =>
              h(
                'div',
                { key: `${finding.severity}-${index}-${finding.file}`, className: 'toy-finding', 'data-severity': finding.severity },
                h(Badge, { tone: finding.severity === 'ERROR' ? 'error' : 'warn' }, finding.severity),
                h(
                  'div',
                  { className: 'toy-finding-body' },
                  h('span', {}, finding.message),
                  finding.file === '' ? null : h('span', { className: 'toy-finding-file' }, finding.file),
                ),
              ),
            ),
          ),
        )
  return h(
    'div',
    { className: 'toy-panel', style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    h(
      'div',
      { className: 'toy-toolbar' },
      h(Badge, { tone: report.errors > 0 ? 'error' : 'ok' }, copy.precheckSummary(report.errors, report.warnings)),
      h('span', { className: 'toy-caption' }, `${report.kind} · ${copy.findingCount(errors.length, warnings.length)}`),
    ),
    report.errors === 0 && report.warnings === 0
      ? h(Banner, { tone: 'success' }, copy.precheckPassed)
      : null,
    group(copy.findingsErrors(report.errors), errors),
    group(copy.findingsWarnings(report.warnings), warnings),
  )
}

/** The planned metadata changes. */
function ChangeList({ changes, copy, zh }: { readonly changes: readonly ToyChange[]; readonly copy: Copy; readonly zh: boolean }): ReactNode {
  if (changes.length === 0) return h('div', { className: 'toy-caption' }, copy.noChanges)
  return h(
    'ul',
    { className: 'toy-list' },
    changes.map((change, index) =>
      h(
        'li',
        { key: `${change.field}-${index}` },
        h('span', { className: 'toy-list-key' }, changeFieldLabel(change.field, zh)),
        h('span', { className: 'toy-list-value' }, changeValue(change.value, zh)),
      ),
    ),
  )
}

/** The "发布 / 更新" tab. */
export function PublishView({
  copy,
  zh,
  ns,
  toys,
  catalogueError,
  onRetryCatalogue,
  prefill,
  active,
  onSubmitted,
  onNotify,
  onGoToToys,
}: {
  readonly copy: Copy
  readonly zh: boolean
  readonly ns: ToyNamespace
  readonly toys: ToyListPage | undefined
  readonly catalogueError?: Failure
  readonly onRetryCatalogue?: () => void
  readonly prefill: PublishPrefill | undefined
  readonly active: boolean
  readonly onSubmitted: () => void
  readonly onNotify: (message: string) => void
  readonly onGoToToys: () => void
}): ReactNode {
  const [action, setAction] = useState<'create' | 'update'>('create')
  const [updateId, setUpdateId] = useState('')
  const [path, setPath] = useState('')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [poster, setPoster] = useState('')
  const [icon, setIcon] = useState('')
  const [category, setCategory] = useState('')
  const [theme, setTheme] = useState('')
  const [visibility, setVisibility] = useState('')
  const [password, setPassword] = useState('')
  const [watermark, setWatermark] = useState<WatermarkChoice>('')
  const [activity, setActivity] = useState('')
  const [clearActivity, setClearActivity] = useState(false)
  const [baseline, setBaseline] = useState<PrefillBaseline | undefined>(undefined)
  const [formError, setFormError] = useState<string | undefined>(undefined)
  const [precheck, setPrecheck] = useState<ToyPrecheck | undefined>(undefined)
  const [precheckBusy, setPrecheckBusy] = useState(false)
  const [precheckError, setPrecheckError] = useState<Failure | undefined>(undefined)
  const [prep, setPrep] = useState<PublishPreparation | undefined>(undefined)
  const [prepFormKey, setPrepFormKey] = useState('')
  const [prepBusy, setPrepBusy] = useState(false)
  const [prepError, setPrepError] = useState<Failure | undefined>(undefined)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [submitError, setSubmitError] = useState<Failure | undefined>(undefined)
  const [submitResult, setSubmitResult] = useState<SubmitResult | undefined>(undefined)
  const [dialog, setDialog] = useState<'submit' | undefined>(undefined)
  const [historyPaths, setHistoryPaths] = useState<readonly string[]>([])
  const [now, setNow] = useState(() => Date.now())

  const prepRef = useRef<PublishPreparation | undefined>(undefined)
  useEffect(() => {
    prepRef.current = prep
  }, [prep])

  const appliedPrefill = useRef(0)
  const suggestionsLoaded = useRef(false)
  useEffect(() => {
    if (!active || suggestionsLoaded.current) return
    suggestionsLoaded.current = true
    void call<readonly string[]>('historyPaths', () => ns.historyPaths()).then((outcome) => {
      if (!outcome.ok) return
      setHistoryPaths(Array.isArray(outcome.value) ? outcome.value : [])
    })
  }, [active, ns])

  /** Drop the pending preview, optionally cancelling it on the Host. */
  const dropPreview = useCallback(
    (notify: boolean) => {
      const current = prepRef.current
      prepRef.current = undefined
      setPrep(undefined)
      setPrepFormKey('')
      setConfirmChecked(false)
      setSubmitError(undefined)
      if (current?.pendingId !== undefined) {
        void call<ActionResult>('cancelPending', () => ns.cancelPending(current.pendingId as string)).then((outcome) => {
          if (notify && outcome.ok) onNotify(copy.cancelPreviewDone)
        })
      } else if (notify) {
        onNotify(copy.cancelPreviewDone)
      }
    },
    [copy.cancelPreviewDone, ns, onNotify],
  )

  // Leaving the panel while a preview is pending abandons it on the Host.
  useEffect(
    () => () => {
      const current = prepRef.current
      if (current?.pendingId !== undefined) void call<ActionResult>('cancelPending', () => ns.cancelPending(current.pendingId as string))
    },
    [ns],
  )

  const applyToy = useCallback((toy: ToySummary) => {
    setUpdateId(String(toy.id))
    setTitle(toy.title)
    setSlug(toy.slug ?? '')
    setVisibility(toy.visibility ?? '')
    setCategory(toy.category ?? '')
    setTheme(toy.theme ?? '')
    setWatermark(toy.watermark === true ? 'on' : toy.watermark === false ? 'off' : '')
    setPoster('')
    setIcon('')
    setActivity('')
    setPassword('')
    setClearActivity(false)
    setBaseline(baselineOfToy(toy))
  }, [])

  // A prefill request always starts a fresh preparation flow.
  useEffect(() => {
    if (prefill === undefined || prefill.nonce === appliedPrefill.current) return
    appliedPrefill.current = prefill.nonce
    dropPreview(false)
    setSubmitResult(undefined)
    setSubmitError(undefined)
    setFormError(undefined)
    setPrecheck(undefined)
    setPrecheckError(undefined)
    setPrepError(undefined)
    setPoster('')
    setIcon('')
    setActivity('')
    setPassword('')
    setClearActivity(false)
    setPath(prefill.path ?? '')
    if (prefill.action === 'create') {
      setAction('create')
      setUpdateId('')
      setTitle(prefill.title ?? '')
      setSlug(prefill.slug ?? '')
      setVisibility('')
      setCategory('')
      setTheme('')
      setWatermark('')
      setBaseline(undefined)
    } else {
      setAction('update')
      if (prefill.toy !== undefined) {
        applyToy(prefill.toy)
      } else {
        setUpdateId(prefill.id === undefined ? '' : String(prefill.id))
        setTitle(prefill.title ?? '')
        setSlug(prefill.slug ?? '')
        setBaseline(undefined)
      }
    }
    // Consumer-supplied nonce makes every request distinct.
  }, [prefill, dropPreview, applyToy])

  const formKey = useMemo(() => {
    const trimmed = (value: string): string => value.trim()
    return JSON.stringify([
      action,
      updateId,
      trimmed(path),
      trimmed(title),
      trimmed(slug),
      trimmed(poster),
      trimmed(icon),
      trimmed(category),
      trimmed(theme),
      visibility,
      visibility === 'password' ? password : '',
      watermark,
      action === 'update' && clearActivity ? '' : trimmed(activity),
      action === 'update' && clearActivity,
    ])
  }, [action, updateId, path, title, slug, poster, icon, category, theme, visibility, password, watermark, activity, clearActivity])

  /** Fields that differ from the prefill baseline (update mode only). */
  const prePlanChanges = useMemo<readonly ToyChange[] | undefined>(() => {
    if (action !== 'update' || baseline === undefined) return undefined
    const rows: ToyChange[] = []
    if (title.trim() !== baseline.title) rows.push({ field: 'title', value: title.trim() })
    if (category !== baseline.category) rows.push({ field: 'category', value: category })
    if (theme !== baseline.theme) rows.push({ field: 'theme', value: theme })
    if (visibility !== baseline.visibility) rows.push({ field: 'visibility', value: visibility })
    if (watermark !== baseline.watermark) rows.push({ field: 'watermark', value: watermark === 'on' })
    return rows
  }, [action, baseline, title, category, theme, visibility, watermark])

  const updateNoChanges =
    action === 'update'
    && path.trim() === ''
    && prePlanChanges !== undefined
    && prePlanChanges.length === 0
    && poster.trim() === ''
    && icon.trim() === ''
    && activity.trim() === ''
    && password === ''
    && !clearActivity

  const buildInput = useCallback((): PublishInput => {
    const trimmed = (value: string): string => value.trim()
    return {
      action,
      ...(action === 'update' ? { id: Number(updateId) } : {}),
      ...(trimmed(path) === '' ? {} : { path: trimmed(path) }),
      ...(trimmed(title) === '' ? {} : { title: trimmed(title) }),
      ...(action === 'create' && trimmed(slug) !== '' ? { slug: trimmed(slug) } : {}),
      ...(trimmed(poster) === '' ? {} : { poster: trimmed(poster) }),
      ...(trimmed(icon) === '' ? {} : { icon: trimmed(icon) }),
      ...(trimmed(category) === '' ? {} : { category: trimmed(category) }),
      ...(trimmed(theme) === '' ? {} : { theme: trimmed(theme) }),
      ...(visibility === '' ? {} : { visibility }),
      ...(visibility === 'password' && password !== '' ? { accessPassword: password } : {}),
      ...(watermark === '' ? {} : { watermark: watermark === 'on' }),
      ...(action === 'update' && clearActivity
        ? { activity: '' }
        : trimmed(activity) === ''
          ? {}
          : { activity: trimmed(activity) }),
    }
  }, [action, updateId, path, title, slug, poster, icon, category, theme, visibility, password, watermark, activity, clearActivity])

  const validate = useCallback((): string | undefined => {
    if (action === 'update') {
      if (updateId.trim() === '' || !/^\d+$/.test(updateId.trim()) || Number(updateId) <= 0) return copy.formInvalidTarget
      if (visibility === 'password' && password !== '' && (password.length < 4 || password.length > 32)) return copy.formInvalidPassword
    } else {
      if (path.trim() === '') return copy.formMissingPath
      if (visibility === 'password' && (password.length < 4 || password.length > 32)) return copy.formInvalidPassword
    }
    return undefined
  }, [action, updateId, visibility, password, path, copy])

  const resetForm = useCallback(
    (notify: boolean) => {
      dropPreview(false)
      setAction('create')
      setUpdateId('')
      setPath('')
      setTitle('')
      setSlug('')
      setPoster('')
      setIcon('')
      setCategory('')
      setTheme('')
      setVisibility('')
      setPassword('')
      setWatermark('')
      setActivity('')
      setClearActivity(false)
      setBaseline(undefined)
      setFormError(undefined)
      setPrecheck(undefined)
      setPrecheckError(undefined)
      setPrepError(undefined)
      setSubmitError(undefined)
      setSubmitResult(undefined)
      if (notify) onNotify(copy.cancelPreviewDone)
    },
    [dropPreview, copy.cancelPreviewDone, onNotify],
  )

  const runPrecheck = useCallback(async (): Promise<void> => {
    if (path.trim() === '') {
      setPrecheckError({ kind: 'missing-path', message: copy.precheckNeedsPath })
      return
    }
    setPrecheckBusy(true)
    setPrecheckError(undefined)
    const outcome = await call<ToyPrecheck>('precheck', () => ns.precheck(path.trim(), poster.trim(), icon.trim(), slug.trim()))
    setPrecheckBusy(false)
    if (!outcome.ok) {
      setPrecheckError(outcome.failure)
      return
    }
    setPrecheck(outcome.value)
  }, [ns, path, poster, icon, slug, copy.precheckNeedsPath])

  const prepare = useCallback(async (): Promise<void> => {
    const problem = validate()
    if (problem !== undefined) {
      setFormError(problem)
      return
    }
    setFormError(undefined)
    setPrepBusy(true)
    setPrepError(undefined)
    setSubmitError(undefined)
    setSubmitResult(undefined)
    if (prepRef.current !== undefined) dropPreview(false)
    const outcome = await call<PublishPreparation>('preparePublish', () => ns.preparePublish(buildInput()))
    setPrepBusy(false)
    if (!outcome.ok) {
      setPrepError(outcome.failure)
      return
    }
    const value = outcome.value
    if (value.precheck !== undefined) setPrecheck(value.precheck)
    const failure = failureOf(value)
    if (failure !== undefined) {
      setPrepError(failure)
      return
    }
    prepRef.current = value
    setPrep(value)
    setPrepFormKey(formKey)
    setConfirmChecked(false)
    if (value.stage === 'preview') onNotify(copy.previewTitle)
  }, [ns, validate, buildInput, formKey, copy.previewTitle, dropPreview, onNotify])

  const submit = useCallback(async (): Promise<void> => {
    const current = prep
    if (current === undefined || current.pendingId === undefined || !confirmChecked || submitBusy) return
    const remaining = countdown(current.expiresAt, Date.now())
    if (remaining.expired) {
      setSubmitError({ kind: 'expired-pending', message: copy.previewExpired })
      setDialog(undefined)
      return
    }
    setSubmitBusy(true)
    setSubmitError(undefined)
    const outcome = await call<SubmitResult>('submitPublish', () => ns.submitPublish(current.pendingId as string))
    setSubmitBusy(false)
    setDialog(undefined)
    if (!outcome.ok) {
      setSubmitError(outcome.failure)
      return
    }
    const failure = failureOf(outcome.value)
    if (failure !== undefined) {
      setSubmitError(failure)
      return
    }
    prepRef.current = undefined
    setPrep(undefined)
    setPrepFormKey('')
    setConfirmChecked(false)
    setSubmitResult(outcome.value)
    onSubmitted()
    onNotify(copy.submitSuccess)
  }, [prep, confirmChecked, submitBusy, ns, copy.previewExpired, copy.submitSuccess, onSubmitted, onNotify])

  const expiry = countdown(prep?.expiresAt, now)
  useEffect(() => {
    if (prep?.expiresAt === undefined) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [prep?.expiresAt])

  const toyItems = toys?.items ?? []
  const selectedTarget = toyItems.find((toy) => String(toy.id) === updateId.trim())
  const stale = prep !== undefined && prepFormKey !== formKey
  /** Host changes minus the fields the prefill already had (display-only filter). */
  const displayChanges = useMemo<readonly ToyChange[]>(() => {
    const changes = prep?.changes ?? []
    if (baseline === undefined) return changes
    return changes.filter((change) => !matchesBaseline(change, baseline))
  }, [prep?.changes, baseline])
  const plannedEmpty = prep?.stage === 'planned' && displayChanges.length === 0
  const canPrepare = !prepBusy && !submitBusy && !updateNoChanges
  const canSubmit =
    prep !== undefined &&
    prep.pendingId !== undefined &&
    confirmChecked &&
    !submitBusy &&
    !expiry.expired &&
    !plannedEmpty &&
    !stale
  const previewUrl = prep?.previewUrl
  const target = prep?.target ?? (selectedTarget === undefined ? undefined : { id: selectedTarget.id, title: selectedTarget.title, slug: selectedTarget.slug, url: toyPageUrl(selectedTarget), status: selectedTarget.status })

  /** Human-readable target name for the localized summary sentence. */
  const summaryTarget = (): string => {
    const targetTitle = prep?.target?.title
    if (targetTitle !== undefined && targetTitle !== '') return targetTitle
    if (title.trim() !== '') return title.trim()
    const id = prep?.target?.id ?? (updateId.trim() === '' ? undefined : Number(updateId))
    if (id !== undefined && Number.isFinite(id)) return `#${id}`
    const trimmedPath = path.trim()
    if (trimmedPath !== '') {
      const parts = trimmedPath.split(/[\\/]/).filter((part) => part !== '')
      return parts[parts.length - 1] ?? trimmedPath
    }
    return copy.createToy
  }

  /** The primary, localized sentence the panel shows above the raw CLI summary. */
  const localizedSummary = ((): string | undefined => {
    if (prep === undefined) return undefined
    if (prep.action === 'create') return copy.summaryCreatePreview(summaryTarget())
    return prep.stage === 'planned' ? copy.summaryPlanned(summaryTarget()) : copy.summaryPreview(summaryTarget())
  })()

  /** The section the panel scrolls to after a preview is prepared. */
  const previewRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (prep === undefined) return
    previewRef.current?.scrollIntoView({ block: 'nearest' })
  }, [prep])

  const targetField =
    h(
      Field,
      { label: copy.targetLabel, hint: copy.targetManual },
      h(
        'div',
        { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
        h(ToyPicker, {
          copy,
          toys: toyItems,
          ...(selectedTarget === undefined ? {} : { value: selectedTarget.id }),
          placeholder: copy.targetPlaceholder,
          onChange: (toy) => {
            // Re-selecting the same target must not wipe the package/metadata
            // fields the creator already filled.
            if (updateId === String(toy.id)) return
            dropPreview(false)
            setSubmitResult(undefined)
            setSubmitError(undefined)
            applyToy(toy)
            setFormError(undefined)
          },
        }),
        h('input', {
          className: 'toy-input',
          style: { flex: '0 0 130px' },
          inputMode: 'numeric',
          value: updateId,
          placeholder: 'Toy ID',
          'aria-label': copy.targetManual,
          onChange: (event: ChangeEvent<HTMLInputElement>) => {
            dropPreview(false)
            setSubmitResult(undefined)
            setSubmitError(undefined)
            setUpdateId(event.target.value.replace(/[^\d]/g, ''))
            setBaseline(undefined)
          },
        }),
      ),
    )

  /** Short label for a history path so four suggestions stay distinguishable. */
  const shortPath = (value: string): string => {
    const parts = value.split(/[\\/]/).filter((part) => part !== '')
    if (parts.length <= 2) return value
    return `…/${parts.slice(-2).join('/')}`
  }

  const pathField = h(
    Field,
    { label: copy.pathLabel, hint: action === 'update' ? `${copy.pathHint} ${copy.prepareMetadataHint}` : copy.pathHint, span: true },
    h('input', {
      className: 'toy-input',
      value: path,
      list: 'toy-history-paths',
      placeholder: copy.pathPlaceholder,
      'aria-label': copy.pathLabel,
      spellCheck: false,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        setPath(event.target.value)
        setPrecheck(undefined)
        setPrecheckError(undefined)
      },
    }),
    h(
      'datalist',
      { id: 'toy-history-paths' },
      historyPaths.map((suggestion) => h('option', { key: suggestion, value: suggestion })),
    ),
    historyPaths.length === 0
      ? null
      : h(
          'div',
          { className: 'toy-toolbar', style: { marginTop: 4 } },
          h('span', { className: 'toy-caption' }, copy.pathSuggestions),
          historyPaths.slice(0, 4).map((suggestion) =>
            h(
              Button,
              { key: suggestion, size: 'sm', onClick: () => setPath(suggestion), title: `${copy.useHistoryPath}: ${suggestion}` },
              shortPath(suggestion),
            ),
          ),
        ),
  )

  const stepHead = (step: number, title: string, hint: string): ReactNode =>
    h(
      'div',
      { className: 'toy-panel-head' },
      h(
        'div',
        {},
        h('div', { className: 'toy-step-title' }, h('span', { className: 'toy-step-badge' }, String(step)), title),
        h('div', { className: 'toy-caption', style: { marginTop: 2 } }, hint),
      ),
    )

  const previewTimer = expiry.label === '' ? '—' : expiry.label
  const barTitle = ((): string => {
    if (prep !== undefined) {
      if (stale) return copy.publishBarStale
      if (expiry.expired) return copy.publishBarExpired
      if (prep.stage === 'planned') return copy.publishBarPlanned
      return copy.publishBarPreview(previewTimer)
    }
    if (action === 'create' && path.trim() === '') return copy.publishBarNeedsPath
    if (action === 'update' && updateNoChanges) return copy.noDetectedChanges
    return copy.publishBarIdle
  })()
  const barDetail = ((): string | undefined => {
    if (prep === undefined) return action === 'update' && path.trim() === '' ? copy.prepareMetadataHint : copy.prepareHint
    if (stale) return copy.publishStaleWarning
    if (expiry.expired) return undefined
    if (prep.stage === 'planned') return copy.plannedHint
    if (!confirmChecked) return copy.publishBarNeedCheck
    return copy.previewOpen
  })()
  const showPrepare = prep === undefined || expiry.expired || stale || submitError !== undefined
  const prepareLabel = prep !== undefined && expiry.expired ? copy.reprepare : copy.prepare

  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h(SectionHead, {
      title: copy.publishTitle,
      sub: copy.publishSubtitle,
      actions: h(
        Toolbar,
        {},
        h(
          'div',
          { className: 'toy-tabs', role: 'tablist', 'aria-label': copy.actionLabel },
          h(
            'button',
            {
              type: 'button',
              className: 'toy-tab',
              role: 'tab',
              'aria-selected': action === 'create',
              onClick: () => {
                dropPreview(false)
                setSubmitResult(undefined)
                setSubmitError(undefined)
                setAction('create')
                setBaseline(undefined)
                setFormError(undefined)
              },
            },
            copy.createAction,
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'toy-tab',
              role: 'tab',
              'aria-selected': action === 'update',
              onClick: () => {
                dropPreview(false)
                setSubmitResult(undefined)
                setSubmitError(undefined)
                setAction('update')
                setFormError(undefined)
              },
            },
            copy.updateAction,
          ),
        ),
      ),
    }),
    h(
      'div',
      { className: 'toy-panels' },
      h(
        'div',
        { className: 'toy-panel' },
        stepHead(1, copy.publishStep1, copy.publishStep1Hint),
        h(
          'div',
          { className: 'toy-form' },
          action === 'update' ? targetField : null,
          pathField,
        ),
        toys !== undefined && toyItems.length === 0 && action === 'update'
          ? h(
              Empty,
              {},
              h('span', {}, copy.publishNoToysHint),
              h(
                Button,
                { size: 'sm', variant: 'primary', onClick: () => setAction('create') },
                h(Icon, { name: 'plus' }),
                copy.createAction,
              ),
            )
          : null,
      ),
      h(
        'div',
        { className: 'toy-panel' },
        stepHead(2, copy.publishStep2, copy.publishStep2Hint),
        h(
          'div',
          { className: 'toy-form' },
          h(
            Field,
            { label: copy.titleLabel },
            h('input', { className: 'toy-input', value: title, placeholder: copy.titlePlaceholder, 'aria-label': copy.titleLabel, onChange: (event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value) }),
          ),
          action === 'create'
            ? h(
                Field,
                { label: copy.slugFormLabel, hint: copy.slugHint },
                h('input', { className: 'toy-input', value: slug, placeholder: 'my-toy', 'aria-label': copy.slugFormLabel, spellCheck: false, onChange: (event: ChangeEvent<HTMLInputElement>) => setSlug(event.target.value) }),
              )
            : h(
                Field,
                { label: copy.slugFormLabel, hint: copy.slugImmutable },
                h('input', { className: 'toy-input', value: slug, readOnly: true, 'aria-readonly': true, 'aria-label': copy.slugFormLabel }),
              ),
          h(
            Field,
            { label: copy.categoryFormLabel, hint: copy.categoryHint },
            h(
              'select',
              { className: 'toy-select', value: category, 'aria-label': copy.categoryFormLabel, onChange: (event: ChangeEvent<HTMLSelectElement>) => setCategory(event.target.value) },
              h('option', { value: '' }, copy.categoryKeep),
              CATEGORIES.map((value) => h('option', { key: value, value }, value)),
            ),
          ),
          h(
            Field,
            { label: copy.themeFormLabel, hint: copy.themeHint },
            h(
              'select',
              { className: 'toy-select', value: theme, 'aria-label': copy.themeFormLabel, onChange: (event: ChangeEvent<HTMLSelectElement>) => setTheme(event.target.value) },
              h('option', { value: '' }, copy.themeKeep),
              THEMES.map((value) => h('option', { key: value, value }, value)),
            ),
          ),
          h(
            Field,
            { label: copy.posterLabel, hint: copy.posterHint },
            h('input', { className: 'toy-input', value: poster, placeholder: copy.posterPlaceholder, 'aria-label': copy.posterLabel, spellCheck: false, onChange: (event: ChangeEvent<HTMLInputElement>) => setPoster(event.target.value) }),
          ),
          h(
            Field,
            { label: copy.iconLabel, hint: copy.iconHint },
            h('input', { className: 'toy-input', value: icon, placeholder: copy.iconPlaceholder, 'aria-label': copy.iconLabel, spellCheck: false, onChange: (event: ChangeEvent<HTMLInputElement>) => setIcon(event.target.value) }),
          ),
        ),
        h('div', { className: 'toy-caption' }, copy.publishAssetsHint),
      ),
      h(
        'div',
        { className: 'toy-panel' },
        stepHead(3, copy.publishStep3, copy.publishStep3Hint),
        h(
          'div',
          { className: 'toy-form' },
          h(
            Field,
            { label: copy.visibilityFormLabel },
            h(
              'select',
              { className: 'toy-select', value: visibility, 'aria-label': copy.visibilityFormLabel, onChange: (event: ChangeEvent<HTMLSelectElement>) => setVisibility(event.target.value) },
              h('option', { value: '' }, copy.visibilityKeep),
              h('option', { value: 'public' }, copy.visibilityPublic),
              h('option', { value: 'link-only' }, copy.visibilityLink),
              h('option', { value: 'password' }, copy.visibilityPassword),
            ),
          ),
          h(
            Field,
            { label: copy.watermarkFormLabel },
            h(
              'select',
              {
                className: 'toy-select',
                value: watermark,
                'aria-label': copy.watermarkFormLabel,
                onChange: (event: ChangeEvent<HTMLSelectElement>) => setWatermark(event.target.value as WatermarkChoice),
              },
              h('option', { value: '' }, copy.watermarkKeep),
              h('option', { value: 'on' }, copy.watermarkOnLabel),
              h('option', { value: 'off' }, copy.watermarkOffLabel),
            ),
          ),
          visibility === 'password' || password !== ''
            ? h(
                Field,
                { label: copy.passwordLabel, hint: copy.passwordHint },
                h('input', {
                  className: 'toy-input',
                  type: 'password',
                  value: password,
                  autoComplete: 'new-password',
                  'aria-label': copy.passwordLabel,
                  onChange: (event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value),
                }),
              )
            : null,
          h(
            Field,
            { label: copy.activityLabel, hint: copy.activityHint },
            h('input', { className: 'toy-input', value: activity, 'aria-label': copy.activityLabel, onChange: (event: ChangeEvent<HTMLInputElement>) => setActivity(event.target.value) }),
            action === 'update'
              ? h(
                  'label',
                  { className: 'toy-check', style: { marginTop: 4 } },
                  h('input', { type: 'checkbox', checked: clearActivity, onChange: (event: ChangeEvent<HTMLInputElement>) => setClearActivity(event.target.checked) }),
                  h('span', {}, copy.clearActivity),
                )
              : null,
          ),
        ),
      ),
      h(
        'div',
        { className: 'toy-panel' },
        stepHead(4, copy.publishStep4, copy.publishStep4Hint),
        updateNoChanges
          ? h(Banner, { tone: 'warn', title: copy.noDetectedChanges }, copy.noDetectedChangesHint)
          : null,
        formError === undefined ? null : h(Banner, { tone: 'error' }, formError),
        precheckError === undefined ? null : h(FailureBanner, { failure: precheckError, copy }),
        precheck !== undefined && !precheckBusy ? h(PrecheckReport, { report: precheck, copy, zh }) : null,
        precheckBusy ? h(Loading, { label: copy.prechecking }) : null,
        prepError === undefined ? null : h(FailureBanner, { failure: prepError, copy }),
        submitError === undefined ? null : h(FailureBanner, { failure: submitError, copy }),
        prepBusy ? h(Loading, { label: copy.preparing }) : null,
        prep === undefined
          ? h('div', { className: 'toy-caption' }, copy.publishStep4Hint)
          : h(
              'div',
              { className: 'toy-preview', 'data-expired': expiry.expired ? 'true' : 'false', ref: previewRef },
              h(
                'div',
                { className: 'toy-toolbar' },
                h('span', { className: 'toy-section-title' }, prep.stage === 'planned' ? copy.plannedTitle : copy.previewTitle),
                h(Badge, { tone: prep.stage === 'planned' ? 'warn' : 'ok' }, actionLabel(prep.action, zh)),
                prep.stage === 'planned'
                  ? h('span', { className: 'toy-caption' }, copy.plannedHint)
                  : h('span', { className: 'toy-caption' }, copy.prepareHint),
              ),
              localizedSummary === undefined
                ? null
                : h(
                    'div',
                    { className: 'toy-kv' },
                    h('span', { className: 'toy-kv-label' }, copy.previewSummary),
                    h('span', { className: 'toy-kv-value toy-strong' }, localizedSummary),
                  ),
              prep.summary === undefined || prep.summary === ''
                ? null
                : h('div', { className: 'toy-caption', title: prep.summary }, `${copy.rawSummaryLabel}: ${prep.summary}`),
              target === undefined
                ? null
                : h(
                    'div',
                    { className: 'toy-kv' },
                    h('span', { className: 'toy-kv-label' }, copy.targetCurrent),
                    h(
                      'span',
                      { className: 'toy-kv-value' },
                      `${target.title ?? '—'}${target.id === undefined ? '' : ` (#${target.id})`}${target.status === undefined ? '' : ` · ${target.status}`}`,
                    ),
                  ),
              prep.stage === 'planned' && displayChanges.length === 0
                ? h(Banner, { tone: 'warn', title: copy.noDetectedChanges }, copy.noDetectedChangesHint)
                : displayChanges.length === 0
                  ? null
                  : h(
                      'div',
                      {},
                      h('div', { className: 'toy-kv-label' }, copy.changesTitle),
                      h(ChangeList, { changes: displayChanges, copy, zh }),
                    ),
              previewUrl === undefined
                ? null
                : h(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                    h(
                      'a',
                      { className: 'toy-link', href: previewUrl, target: '_blank', rel: 'noreferrer' },
                      h(Icon, { name: 'external' }),
                      ' ',
                      copy.previewOpen,
                    ),
                    h('span', { className: 'toy-finding-file' }, previewUrl),
                  ),
              expiry.expired
                ? h(Banner, { tone: 'warn' }, copy.previewExpired)
                : expiry.label === ''
                  ? null
                  : h(
                      'div',
                      { className: 'toy-caption', style: { display: 'flex', alignItems: 'center', gap: 6 } },
                      h(Icon, { name: 'clock' }),
                      copy.previewExpiresIn(expiry.label),
                    ),
              stale
                ? h(Banner, { tone: 'warn' }, copy.publishStaleWarning)
                : null,
              h('div', { className: 'toy-divider' }),
              h(
                'label',
                { className: 'toy-check' },
                h('input', {
                  type: 'checkbox',
                  checked: confirmChecked,
                  disabled: expiry.expired,
                  onChange: (event: ChangeEvent<HTMLInputElement>) => setConfirmChecked(event.target.checked),
                }),
                h('span', {}, prep.stage === 'planned' ? copy.confirmCheckPlanned : copy.confirmCheck),
              ),
            ),
        submitResult === undefined || submitResult.ok !== true
          ? null
          : h(
              Banner,
              {
                tone: 'success',
                title: copy.submitSuccess,
                actions: h(
                  Toolbar,
                  {},
                  h(Button, { size: 'sm', onClick: () => resetForm(false) }, copy.createToy),
                  h(Button, { size: 'sm', onClick: onGoToToys }, copy.toysTitle),
                ),
              },
              h(
                'div',
                { className: 'toy-toolbar' },
                submitResult.id === undefined ? null : h(Badge, {}, copy.submitResultId(submitResult.id)),
                submitResult.status === undefined ? null : h(Badge, { tone: 'info' }, copy.submitResultStatus(submitResult.status)),
                h('span', { className: 'toy-caption' }, copy.submittedRefreshHint),
              ),
            ),
      ),
    ),
    h(
      'div',
      { className: 'toy-actionbar' },
      h(
        'div',
        { className: 'toy-actionbar-status' },
        h('span', { className: 'toy-actionbar-title' }, barTitle),
        barDetail === undefined ? null : h('span', { className: 'toy-caption' }, barDetail),
      ),
      h(
        'div',
        { className: 'toy-actionbar-actions' },
        h(Button, { size: 'sm', onClick: () => resetForm(true), disabled: prepBusy || submitBusy }, copy.resetForm),
        h(
          Button,
          { size: 'sm', onClick: () => void runPrecheck(), disabled: precheckBusy || prepBusy || path.trim() === '', title: path.trim() === '' ? copy.precheckNeedsPath : copy.precheck },
          h(Icon, { name: 'check' }),
          precheckBusy ? copy.prechecking : copy.precheck,
        ),
        showPrepare
          ? h(
              Button,
              {
                variant: prep === undefined ? 'primary' : undefined,
                onClick: () => void prepare(),
                disabled: !canPrepare || !active,
              },
              h(Icon, { name: 'external' }),
              prepBusy ? copy.preparing : prepareLabel,
            )
          : null,
        prep === undefined
          ? null
          : h(Button, { size: 'sm', onClick: () => dropPreview(true), disabled: submitBusy }, copy.cancelPreview),
        prep === undefined
          ? null
          : h(
              Button,
              {
                variant: 'primary',
                onClick: () => setDialog('submit'),
                disabled: !canSubmit,
                title: prep.stage === 'planned' ? copy.submitPlanned : copy.submit,
              },
              h(Icon, { name: 'check' }),
              submitBusy ? copy.submitting : prep.stage === 'planned' ? copy.submitPlanned : copy.submit,
            ),
      ),
    ),
    dialog === undefined
      ? null
      : h(Dialog, {
          title: copy.submitDialogTitle,
          closeLabel: copy.close,
          onClose: () => setDialog(undefined),
          children: h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            h('div', {}, prep?.stage === 'planned' ? copy.submitDialogPlannedBody : copy.submitDialogBody),
            prep?.stage === 'planned' || displayChanges.length === 0
              ? null
              : h(ChangeList, { changes: displayChanges, copy, zh }),
          ),
          footer: h(
            Toolbar,
            {},
            h(Button, { onClick: () => setDialog(undefined) }, copy.cancel),
            h(
              Button,
              { variant: 'primary', onClick: () => void submit(), disabled: submitBusy || !canSubmit },
              submitBusy ? copy.submitting : copy.submitDialogConfirm,
            ),
          ),
        }),
  )
}
