/**
 * Plugin configuration: read verbatim from `cordis.patch.yml`, resolved into the
 * complete settings the Host operations receive.
 */

import type { ToyServiceConfig } from './service-api.ts'

/** Read-only CLI calls. */
export const DEFAULT_TIMEOUT_MS = 60_000
/** Package upload and submit. */
export const DEFAULT_UPLOAD_TIMEOUT_MS = 600_000
/** Browser OAuth wait. */
export const DEFAULT_LOGIN_TIMEOUT_MS = 300_000
/** Captured stdout/stderr per call. */
export const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024
/** Preview -> submit window. */
export const DEFAULT_PENDING_TTL_MS = 30 * 60 * 1000

/** Raw loader configuration; every field is optional. */
export interface Config {
  readonly binary?: string
  readonly timeoutMs?: number
  readonly uploadTimeoutMs?: number
  readonly loginTimeoutMs?: number
  readonly maxOutputBytes?: number
  readonly precheck?: string
  readonly pendingTtlMs?: number
  /** Agents home scanned by the skills CLI (defaults to $DSH_AGENTS_HOME or ~/.agents). */
  readonly agentsHome?: string
  /** Agent name passed to `npx skills add`; must use .agents/skills paths. Defaults to codex. */
  readonly skillAgent?: string
  /** Timeout for `npx skills add/update`. Defaults to 180000. */
  readonly skillTimeoutMs?: number
  readonly env?: Readonly<Record<string, string | undefined>>
}

/** Resolved settings, including the skill-provider options the entry uses. */
export interface ResolvedConfig extends ToyServiceConfig {
  readonly agentsHome: string
  readonly skillAgent: string
  readonly skillTimeoutMs: number
}

const PRECHECK_MODES = ['block', 'warn', 'off'] as const

/** Resolve loader configuration into complete settings. */
export function resolveConfig(raw?: Config): ResolvedConfig {
  const config = raw ?? {}
  const positive = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
  const precheck = typeof config.precheck === 'string' && (PRECHECK_MODES as readonly string[]).includes(config.precheck)
    ? config.precheck as ToyServiceConfig['precheck']
    : 'block'
  const env = config.env !== null && typeof config.env === 'object' && !Array.isArray(config.env)
    ? Object.fromEntries(Object.entries(config.env).filter(([, value]) => typeof value === 'string')) as Record<string, string>
    : {}
  return {
    binary: typeof config.binary === 'string' ? config.binary : '',
    timeoutMs: positive(config.timeoutMs, DEFAULT_TIMEOUT_MS),
    uploadTimeoutMs: positive(config.uploadTimeoutMs, DEFAULT_UPLOAD_TIMEOUT_MS),
    loginTimeoutMs: positive(config.loginTimeoutMs, DEFAULT_LOGIN_TIMEOUT_MS),
    maxOutputBytes: positive(config.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES),
    precheck,
    pendingTtlMs: positive(config.pendingTtlMs, DEFAULT_PENDING_TTL_MS),
    agentsHome: typeof config.agentsHome === 'string' ? config.agentsHome : '',
    skillAgent: typeof config.skillAgent === 'string' && config.skillAgent !== '' ? config.skillAgent : 'codex',
    skillTimeoutMs: positive(config.skillTimeoutMs, 180_000),
    env,
  }
}
