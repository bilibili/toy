/**
 * Browser-side helpers for the `toyPublisher` Remote namespace.
 *
 * Every Typert Remote method resolves to an envelope, never to the business
 * value directly:
 *
 * - `{ ok: true, value: T }` for a handled call;
 * - `{ ok: false, error: { code, message } }` for a carrier or thrown Host
 *   failure (foreign session, CLI crash, gateway problem).
 *
 * A few Host methods also use `ok` inside their business value (`AccountView`,
 * `PublishPreparation`, `SubmitResult`) to report an expected failure without
 * throwing. `call()` normalizes both layers so the views only deal with
 * `Outcome<T>` and a flat `Failure`.
 */

import type {
  AccountView,
  ActionResult,
  HistoryClearTicket,
  HistoryRecord,
  PublishInput,
  PublishPreparation,
  SkillActionResult,
  SkillStatus,
  SubmitResult,
  ToyError,
  ToyListPage,
  ToyPrecheck,
  ToyStats,
} from '../shared/types.ts'

/** The mounted `remote.toyPublisher` namespace, as seen by the browser. */
export type { HistoryClearTicket }

export interface ToyNamespace {
  account(): Promise<unknown>
  login(noOpen: boolean): Promise<unknown>
  logout(): Promise<unknown>
  listToys(page: number, size: number): Promise<unknown>
  stats(id: number, days: number, start: string, end: string): Promise<unknown>
  history(path: string): Promise<unknown>
  prepareHistoryClear(): Promise<unknown>
  clearHistory(token: string): Promise<unknown>
  skillStatus(): Promise<unknown>
  installSkill(): Promise<unknown>
  historyPaths(): Promise<unknown>
  precheck(path: string, poster: string, icon: string, slug: string): Promise<unknown>
  preparePublish(input: PublishInput): Promise<unknown>
  submitPublish(pendingId: string): Promise<unknown>
  cancelPending(pendingId: string): Promise<unknown>
}

/** A flat failure the views can render: business kind, message, optional hint. */
export type Failure = ToyError

/** The two-layer result `call()` returns. */
export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: Failure }

/** The subset of a Remote failure the page displays. */
interface RemoteFailureShape {
  readonly code?: string
  readonly message?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Peel one Remote envelope off a value.
 *
 * Values that are not envelopes (a carrier that resolves the business value
 * directly) pass through unchanged, so the helper stays useful if the wire
 * keeps the domain object bare.
 */
export function unwrap<T>(raw: unknown): T {
  if (isRecord(raw) && raw.ok === true && 'value' in raw) return raw.value as T
  return raw as T
}

/**
 * A Remote/carrier failure is an `ok: false` envelope whose `error` carries a
 * `code` (the protocol's failure branch). A bare domain failure carries a
 * `kind` instead and is returned to the caller as a value.
 */
function isEnvelopeFailure(raw: unknown): raw is { readonly ok: false; readonly error?: RemoteFailureShape } {
  if (!isRecord(raw) || raw.ok !== false) return false
  const error = raw.error
  if (!isRecord(error)) return true
  return typeof error.code === 'string' || typeof error.kind !== 'string'
}

/** Convert either failure layer into the page's `Failure` shape. */
export function toFailure(raw: unknown, fallbackKind = 'remote'): Failure {
  const error = isRecord(raw) && isRecord(raw.error) ? raw.error : {}
  const kind =
    typeof error.kind === 'string' && error.kind !== ''
      ? error.kind
      : typeof error.code === 'string' && error.code !== ''
        ? error.code
        : fallbackKind
  const message = typeof error.message === 'string' && error.message !== '' ? error.message : 'the operation failed'
  const hint = typeof error.hint === 'string' && error.hint !== '' ? error.hint : undefined
  return hint === undefined ? { kind, message } : { kind, message, hint }
}

/** Turn an expected business failure (`{ ok: false, error }`) into a `Failure`. */
export function failureOf(result: { readonly ok: boolean; readonly error?: ToyError | undefined }): Failure | undefined {
  if (result.ok) return undefined
  return result.error ?? { kind: 'unknown', message: 'the operation failed' }
}

/**
 * Invoke one Remote call, folding rejections and both failure layers into an
 * `Outcome`. `operation` only feeds the fallback message.
 */
export async function call<T>(operation: string, invoke: () => Promise<unknown>): Promise<Outcome<T>> {
  let raw: unknown
  try {
    raw = await invoke()
  } catch (error) {
    const message = error instanceof Error && error.message !== '' ? error.message : `${operation} failed`
    return { ok: false, failure: { kind: 'remote', message } }
  }
  if (isEnvelopeFailure(raw)) return { ok: false, failure: toFailure(raw) }
  return { ok: true, value: unwrap<T>(raw) }
}

/** The account endpoint's business value, kept for callers that need the type. */
export type AccountResult = AccountView
export type ListResult = ToyListPage
export type StatsResult = ToyStats
export type PrecheckResult = ToyPrecheck
export type PrepareResult = PublishPreparation
export type SubmitResultValue = SubmitResult
export type HistoryResult = readonly HistoryRecord[]
export type ActionResultValue = ActionResult

const pad = (value: number): string => String(value).padStart(2, '0')

/** `unix seconds` -> `YYYY-MM-DD HH:mm` in the viewer's timezone. */
export function formatUnixTime(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '—'
  const date = new Date(value * 1000)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** History timestamps are stored as text; show them compactly when parseable. */
export function formatHistoryTime(value?: string): string {
  if (value === undefined || value === '') return '—'
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value
  const date = new Date(parsed)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Thousands-separated integer, or an em dash when absent. */
export function formatCount(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US')
}

/** Retention/percentage value: ratios (`<= 1`) are scaled to percent. */
export function formatPercent(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  const percent = value > 0 && value <= 1 ? value * 100 : value
  return `${percent.toFixed(percent >= 10 ? 0 : 1)}%`
}

/** Short badge tone for a Toy review/publish status. */
export function statusTone(status?: string): 'ok' | 'warn' | 'error' | 'info' {
  const value = (status ?? '').toLowerCase()
  if (value === '' || value === 'published' || value === 'online' || value === 'released') return 'ok'
  if (value.includes('reject') || value.includes('fail') || value.includes('offline') || value.includes('ban')) return 'error'
  if (value.includes('review') || value.includes('audit') || value.includes('pending') || value.includes('wait')) return 'warn'
  return 'info'
}

/** Localized visibility label, falling back to the raw API value. */
export function visibilityLabel(value?: string, zh?: boolean): string {
  const labels: Record<string, readonly [string, string]> = {
    public: ['公开', 'Public'],
    'link-only': ['仅链接可见', 'Link only'],
    'link_only': ['仅链接可见', 'Link only'],
    password: ['密码访问', 'Password'],
    private: ['私密', 'Private'],
  }
  if (value === undefined || value === '') return zh === true ? '默认' : 'Default'
  const hit = labels[value.toLowerCase()]
  return hit === undefined ? value : hit[zh === true ? 0 : 1]
}

/** Localized action label for history records and publish plans. */
export function actionLabel(value?: string, zh?: boolean): string {
  if (value === 'create') return zh === true ? '新建' : 'Create'
  if (value === 'update') return zh === true ? '更新' : 'Update'
  return value ?? '—'
}

/** Localized field name used by metadata change lists. */
export function changeFieldLabel(field: string, zh?: boolean): string {
  const labels: Record<string, readonly [string, string]> = {
    title: ['标题', 'Title'],
    slug: ['链接标识', 'Slug'],
    category: ['分区', 'Category'],
    theme: ['主题', 'Theme'],
    visibility: ['可见性', 'Visibility'],
    accessPassword: ['访问密码', 'Password'],
    access_password: ['访问密码', 'Password'],
    password: ['访问密码', 'Password'],
    watermark: ['访客水印', 'Watermark'],
    activity: ['活动', 'Activity'],
    path: ['包路径', 'Package path'],
    id: ['Toy ID', 'Toy ID'],
    action: ['操作', 'Action'],
  }
  const hit = labels[field]
  return hit === undefined ? field : hit[zh === true ? 0 : 1]
}

/** Render a metadata change value for display. */
export function changeValue(value: string | number | boolean, zh?: boolean): string {
  if (typeof value === 'boolean') return value ? (zh === true ? '开启' : 'On') : (zh === true ? '关闭' : 'Off')
  return String(value)
}

/** Countdown for a preview's `expiresAt` ISO timestamp. */
export function countdown(expiresAt: string | undefined, now: number): { readonly label: string; readonly expired: boolean } {
  if (expiresAt === undefined || expiresAt === '') return { label: '', expired: false }
  const target = Date.parse(expiresAt)
  if (!Number.isFinite(target)) return { label: '', expired: false }
  const remaining = Math.max(0, target - now)
  const total = Math.ceil(remaining / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return { label: `${minutes}:${pad(seconds)}`, expired: remaining <= 0 }
}

/** The page URL of a Toy, when the list reported one. */
export function toyPageUrl(toy: { readonly url?: string; readonly slug?: string }): string | undefined {
  if (toy.url !== undefined && toy.url !== '') return toy.url
  if (toy.slug !== undefined && toy.slug !== '') return `https://www.bilibili.com/toy/${toy.slug}/index.html`
  return undefined
}
