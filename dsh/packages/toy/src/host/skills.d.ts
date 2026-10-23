/**
 * Type face for `src/host/skills.js`.
 */

import type { SkillActionResult, SkillStatus } from '../shared/types.ts'

/** Options for the managed-skill helper. */
export interface SkillManagerOptions {
  readonly agentsHome?: string
  readonly agent?: string
  readonly timeoutMs?: number
  readonly env?: NodeJS.ProcessEnv
  readonly run?: (argv: readonly string[]) => Promise<{ ok: boolean, exitCode: number | null, output: string, timedOut?: boolean, spawnError?: Error }>
}

export const SKILL_NAME: string
export const SKILL_SOURCE: string
export const DEFAULT_SKILL_AGENT: string
export const DEFAULT_SKILL_TIMEOUT_MS: number
export function hashSkillDir(dir: string): Promise<{ hash: string, files: number }>
export function shortHash(hash: string, length?: number): string
export function resolveAgentsHome(configured?: string): string
export function skillsCommand(action: 'add' | 'update', agent?: string): string[]
export function createSkillManager(options?: SkillManagerOptions): {
  readonly agentsHome: string
  readonly agent: string
  status(): Promise<SkillStatus>
  install(): Promise<SkillActionResult>
}
