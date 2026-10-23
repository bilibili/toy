/**
 * Wire types shared by the Host Remote service, the model-facing tools, and the
 * browser page. Everything here is lossless JSON so the generated Typert
 * codecs can carry it unchanged.
 */

/** The logged-in toy account. */
export interface ToyUser {
  /** Bilibili uid. */
  readonly uid: number
  /** Display name. */
  readonly name: string
}

/** One Toy as the creator list reports it. */
export interface ToySummary {
  readonly id: number
  readonly title: string
  /** Shareable page URL, with `index.html`, as the CLI reports it. */
  readonly url?: string
  /** URL slug parsed out of `url`. */
  readonly slug?: string
  /** Review/publish state, e.g. `published`. */
  readonly status?: string
  /** Lowercase visibility: `public`, `link-only` or `password`. */
  readonly visibility?: string
  readonly category?: string
  readonly theme?: string
  readonly watermark?: boolean
  readonly posterUrl?: string
  readonly iconUrl?: string
  /** Creation timestamp (unix seconds). */
  readonly ctime?: number
  /** Last-modified timestamp (unix seconds). */
  readonly mtime?: number
}

/** One page of the creator list. */
export interface ToyListPage {
  readonly total: number
  readonly page: number
  readonly size: number
  readonly items: readonly ToySummary[]
}

/** One day of visit statistics. */
export interface ToyStatsDay {
  /** `YYYY-MM-DD`. */
  readonly date: string
  readonly pv: number
  readonly uv: number
  /** Next-day retention, when settled. */
  readonly retention?: number
}

/** Interaction totals across the Toy. */
export interface ToyDynStats {
  readonly like?: number
  readonly favorite?: number
  readonly comment?: number
  readonly share?: number
}

/** One Toy's stats for the requested window. */
export interface ToyStats {
  readonly id: number
  readonly items: readonly ToyStatsDay[]
  readonly dynStat?: ToyDynStats
}

/** One precheck finding. */
export interface ToyFinding {
  readonly severity: 'ERROR' | 'WARN'
  readonly file: string
  readonly message: string
}

/** Local package precheck result. */
export interface ToyPrecheck {
  readonly ok: boolean
  /** What kind of input was inspected: `dir`, `zip`, `html` or `error`. */
  readonly kind: string
  readonly errors: number
  readonly warnings: number
  readonly findings: readonly ToyFinding[]
}

/** One planned metadata change. */
export interface ToyChange {
  readonly field: string
  readonly value: string | number | boolean
}

/** A metadata target resolved by the Host, for readable confirmation copy. */
export interface ToyTarget {
  readonly id?: number
  readonly title?: string
  readonly slug?: string
  readonly url?: string
  readonly status?: string
}

/** Everything one publish can set; omitted fields mean "leave unchanged". */
export interface PublishInput {
  /** Create a Toy or update an existing one. */
  readonly action: 'create' | 'update'
  /** Target Toy id for update; omitted for create. */
  readonly id?: number
  /** Host path: a package directory, `.zip` or single `.html`. */
  readonly path?: string
  readonly title?: string
  /** Create only: the URL slug, immutable after publish. */
  readonly slug?: string
  /** Host path of the cover image. */
  readonly poster?: string
  /** Host path of the icon image. */
  readonly icon?: string
  readonly category?: string
  readonly visibility?: string
  /** 4-32 characters; required when visibility is `password` on create. */
  readonly accessPassword?: string
  readonly theme?: string
  /** Visitor watermark; omit on update to keep the current setting. */
  readonly watermark?: boolean
  /** Activity code; an empty string cancels participation on update. */
  readonly activity?: string
}

/** A structured failure any endpoint may report. */
export interface ToyError {
  /** Machine-readable kind, e.g. `login-expired`, `package-changed`. */
  readonly kind: string
  readonly message: string
  /** What to do next, when known. */
  readonly hint?: string
}

/** What `preparePublish` produced. */
export interface PublishPreparation {
  readonly ok: boolean
  /** `preview`: a preview_url exists; `planned`: metadata-only, nothing sent yet; `blocked`: precheck refused it. */
  readonly stage?: 'preview' | 'planned' | 'blocked'
  /** One-shot token the page passes back to `submitPublish`. */
  readonly pendingId?: string
  /** Preview link the user must open before submitting. */
  readonly previewUrl?: string
  readonly summary?: string
  readonly action?: 'create' | 'update'
  readonly changes?: readonly ToyChange[]
  readonly target?: ToyTarget
  readonly precheck?: ToyPrecheck
  /** ISO timestamp after which the pending intent cannot be submitted. */
  readonly expiresAt?: string
  readonly error?: ToyError
}

/** What `submitPublish` produced. */
export interface SubmitResult {
  readonly ok: boolean
  readonly submitted?: boolean
  readonly id?: number
  readonly status?: string
  readonly previewUrl?: string
  readonly action?: 'create' | 'update'
  readonly error?: ToyError
}

/** One local publish/update history record. */
export interface HistoryRecord {
  readonly id?: number
  readonly title?: string
  readonly path?: string
  readonly slug?: string
  /** `create` or `update`. */
  readonly action?: string
  /** ISO-ish time as the CLI stored it. */
  readonly time?: string
  readonly visibility?: string
  readonly cliVersion?: string
}

/** Account state, also used as the login/logout result. */
export interface AccountView {
  readonly ok: boolean
  readonly loggedIn: boolean
  /** Resolved toy binary path. */
  readonly binary: string
  /** CLI version, when the binary could be probed. */
  readonly version?: string
  readonly user?: ToyUser
  /** Human-readable CLI output for login/logout. */
  readonly output?: string
  readonly hint?: string
  readonly error?: ToyError
}

/** One-shot ticket for the destructive local history clear. */
export interface HistoryClearTicket {
  readonly ok: boolean
  readonly token?: string
  readonly expiresAt?: string
  readonly error?: ToyError
}

/** Result of a side-effect call with no payload. */
export interface ActionResult {
  readonly ok: boolean
  readonly output?: string
  readonly error?: ToyError
}

/** The installed copy of the toy skill (managed by the skills CLI). */
export interface SkillSnapshot {
  /** The skills CLI's folder hash (short), or a content hash without a lock entry. */
  readonly version: string
  /** Our own sha256 content hash (short). */
  readonly contentHash: string
  readonly path: string
  readonly files: number
  readonly installedAt?: string
  readonly updatedAt?: string
  readonly upstream?: string
}

/** Skill state shown by the page's skill card. */
export interface SkillStatus {
  readonly ok: boolean
  readonly agentsHome: string
  readonly agent: string
  readonly installed: boolean
  readonly managed?: SkillSnapshot
  readonly installCommand: string
  readonly updateCommand: string
  readonly error?: ToyError
}

/** Result of `toy upgrade --check` shown next to the CLI version. */
export interface CliUpdateView {
  readonly ok: boolean
  readonly current?: string
  readonly latest?: string
  readonly upToDate: boolean
  /** Raw CLI text, for the confirmation dialog. */
  readonly detail: string
  readonly error?: ToyError
}

/** Result of an explicit `toy upgrade` from the page. */
export interface CliUpgradeResult {
  readonly ok: boolean
  /** Version parsed from `toy version` after the upgrade. */
  readonly version?: string
  readonly output: string
  readonly error?: ToyError
}

/** Result of an explicit install/update from the page. */
export interface SkillActionResult {
  readonly ok: boolean
  readonly action: 'add' | 'update'
  readonly command: string
  readonly output: string
  readonly status?: SkillStatus
  readonly error?: ToyError
}
