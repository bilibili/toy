/**
 * The Host operations both consumers share: the model-facing tools and the
 * browser Remote service. `src/host/service.js` implements this interface in
 * plain ESM (so the existing Tool tests keep running against JavaScript); this
 * file is the type surface the TypeScript half (Remote controller, entry)
 * compiles against.
 */

import type {
  AccountView,
  ActionResult,
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

/** Stats window: `days` ends yesterday, or an explicit `start`/`end` pair. */
export interface StatsWindow {
  readonly days?: number
  readonly start?: string
  readonly end?: string
}

/** Local precheck request. */
export interface PrecheckInput {
  readonly path: string
  readonly poster?: string
  readonly icon?: string
  readonly slug?: string
  readonly requireRootIndex?: boolean
}

/** What the tool half needs to build a readable confirmation prompt. */
export interface PendingPreview {
  readonly pendingId: string
  readonly summary: string
  readonly previewUrl?: string
  readonly action: 'create' | 'update'
  readonly path?: string
  readonly targetId?: string
  readonly title?: string
  readonly slug?: string
  /** ISO timestamp after which the intent expires. */
  readonly expiresAt: string
  /** Content fingerprint taken before the preview upload. */
  readonly fingerprint?: string
}

/** One-shot ticket for the destructive local history clear. */
export interface HistoryClearTicket {
  readonly ok: boolean
  readonly token?: string
  readonly expiresAt?: string
  readonly error?: import('../shared/types.ts').ToyError
}

/** Result of one validated read-only `toy` invocation (the `toy_run` tool). */
export interface ReadOnlyRun {
  readonly ok: boolean
  /** The argv that ran, joined for display. */
  readonly command?: string
  /** Parsed JSON answer, when the command prints one. */
  readonly data?: unknown
  /** `toy <cmd> --help-json` payload for `help: true`. */
  readonly help?: unknown
  readonly error?: ToyError
}

/** Everything the operations need from the plugin configuration. */
export interface ToyServiceConfig {
  readonly binary: string
  readonly timeoutMs: number
  readonly uploadTimeoutMs: number
  readonly loginTimeoutMs: number
  readonly maxOutputBytes: number
  readonly precheck: 'block' | 'warn' | 'off'
  readonly pendingTtlMs: number
  /** Agents home for the managed skill; empty resolves $DSH_AGENTS_HOME or ~/.agents. */
  readonly agentsHome?: string
  readonly skillAgent?: string
  readonly skillTimeoutMs?: number
  readonly env: Readonly<Record<string, string>>
}

/** Minimal logger face (Cordis `ctx.logger`). */
export interface ToyLogger {
  info?(message: string): void
  warn?(message: string): void
}

/**
 * Host operations shared by tools and the Web page.
 *
 * `preparePublish` / `submitPublish` keep the same hard rules as the model
 * tools: no `--yes` before a preview, a package fingerprint check at submit,
 * and one-shot owner-scoped pending ids. The Web page passes `'web-ui'` as the
 * owner and confirms in its own dialog before calling `submitPublish`.
 */
export interface ToyService {
  /** Read-only account probe. */
  account(): Promise<AccountView>
  /** Start the browser OAuth flow; resolves once the CLI returns. */
  login(noOpen: boolean): Promise<AccountView>
  /** Clear the local session. */
  logout(): Promise<AccountView>
  /** One page of my Toys. */
  listToys(page: number, size: number): Promise<ToyListPage>
  /** One Toy's visit stats. */
  stats(id: number, window: StatsWindow): Promise<ToyStats>
  /** Local publish/update history, optionally filtered by path. */
  history(path: string): Promise<readonly HistoryRecord[]>
  /** Bundled vs managed skill state, for the page's skill card. */
  skillStatus(): Promise<SkillStatus>
  /** Install or update the managed skill via the fixed `npx skills` command. */
  installSkill(): Promise<SkillActionResult>

  /** Issue a one-shot ticket after the human confirmation (page/tool). */
  prepareHistoryClear(ownerId: string): Promise<HistoryClearTicket>
  /** Delete all local publish records, consuming a ticket. */
  clearHistory(token: string, ownerId: string): Promise<ActionResult>
  /** Host paths from the local history, newest first (UI suggestions). */
  historyPaths(): Promise<readonly string[]>
  /** Local package precheck; never uploads. */
  precheck(input: PrecheckInput): Promise<ToyPrecheck>
  /** Upload once for a preview (or plan a metadata-only update). */
  preparePublish(input: PublishInput, ownerId: string): Promise<PublishPreparation>
  /** Submit a prepared publish with `--yes`. */
  submitPublish(pendingId: string, ownerId: string): Promise<SubmitResult>
  /** Drop a prepared publish the page abandoned. */
  cancelPending(pendingId: string, ownerId: string): Promise<ActionResult>
  /** Read a pending intent without consuming it (the tool half builds its prompt). */
  inspectPending(pendingId: string, ownerId: string): Promise<PendingPreview | null>
  /** Run one validated read-only `toy` command (`toy_run`). */
  runReadOnly(command: readonly string[], help: boolean, signal?: AbortSignal): Promise<ReadOnlyRun>
}
