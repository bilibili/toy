/**
 * Skill management for the toy skill.
 *
 * The bundle no longer ships its own copy: `npx skills` installs the skill into
 * `~/.agents/skills` (or a project's `.agents/skills`), which the dsh
 * filesystem provider already scans. This module reads that install and runs
 * the fixed install/update commands when the page asks for it.
 *
 * Safety: the command shape is fixed (`bilibili/toy`, `toy`, global, one
 * agent); the Remote endpoint takes no arguments, so the page cannot inject
 * flags or an arbitrary repository.
 *
 * @module dsh-toy/skills
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Skill directory name in the upstream repository and the agents home. */
export const SKILL_NAME = 'toy'
/** GitHub shorthand the skills CLI understands. */
export const SKILL_SOURCE = 'bilibili/toy'
/** Default agent for `npx skills add`; its paths are `.agents/skills`. */
export const DEFAULT_SKILL_AGENT = 'codex'
/** Node/npx can take a while on a cold cache. */
export const DEFAULT_SKILL_TIMEOUT_MS = 180_000

/** @param {string} dir @returns {Promise<{ hash: string, files: number }>} */
export async function hashSkillDir(dir) {
  const digest = createHash('sha256')
  /** @type {string[]} */
  const relative = []
  const walk = async (current, prefix) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name === '.DS_Store' || entry.name === 'node_modules') continue
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      const absolute = join(current, entry.name)
      if (entry.isDirectory()) await walk(absolute, rel)
      else if (entry.isFile()) relative.push(rel)
    }
  }
  await walk(dir, '')
  for (const rel of relative.sort()) {
    digest.update(`${rel}\u0000`)
    digest.update(await readFile(join(dir, rel)))
    digest.update('\n')
  }
  return { hash: digest.digest('hex'), files: relative.length }
}

/** @param {string} hash @param {number} length */
export function shortHash(hash, length = 10) {
  return hash.slice(0, length)
}

/**
 * The managed snapshot from `~/.agents` (skills CLI global install).
 * @param {string} agentsHome
 */
export async function readManagedSkill(agentsHome) {
  const lockPath = join(agentsHome, '.skill-lock.json')
  let lock
  try {
    lock = JSON.parse(await readFile(lockPath, 'utf8'))
  } catch {
    lock = undefined
  }
  const entry = lock?.skills?.[SKILL_NAME]
  const dir = join(agentsHome, 'skills', SKILL_NAME)
  if (!existsSync(join(dir, 'SKILL.md'))) return undefined
  const { hash, files } = await hashSkillDir(dir)
  return {
    version: typeof entry?.skillFolderHash === 'string' ? shortHash(entry.skillFolderHash, 12) : shortHash(hash),
    contentHash: shortHash(hash),
    path: dir,
    files,
    ...(typeof entry?.installedAt === 'string' ? { installedAt: entry.installedAt } : {}),
    ...(typeof entry?.updatedAt === 'string' ? { updatedAt: entry.updatedAt } : {}),
    ...(typeof entry?.source === 'string' ? { upstream: entry.source } : {}),
  }
}

/**
 * Resolve the agents home exactly like the dsh filesystem provider does.
 * @param {string} [configured]
 */
export function resolveAgentsHome(configured) {
  if (typeof configured === 'string' && configured !== '') return configured
  if (typeof process.env.DSH_AGENTS_HOME === 'string' && process.env.DSH_AGENTS_HOME !== '') return process.env.DSH_AGENTS_HOME
  return join(homedir(), '.agents')
}

/**
 * The fixed argv for `npx skills add` / `npx skills update`.
 * @param {string} action @param {string} agent
 */
export function skillsCommand(action, agent = DEFAULT_SKILL_AGENT) {
  if (action === 'update') return ['npx', '--yes', 'skills', 'update', '-g', '-y', SKILL_NAME]
  return ['npx', '--yes', 'skills', 'add', SKILL_SOURCE, '--skill', SKILL_NAME, '-g', '-a', agent, '-y']
}

/** Strip terminal escapes so the page can render the captured output. */
function cleanOutput(text) {
  return text
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '')
    .trim()
    .slice(-8000)
}

/** Run one command with a timeout, no shell, bounded output. */
function runCommand(argv, { timeoutMs, cwd, env }) {
  return new Promise(resolvePromise => {
    const child = spawn(argv[0], argv.slice(1), { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)
    const collect = chunk => {
      if (output.length < 256 * 1024) output += String(chunk)
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.on('error', error => {
      clearTimeout(timer)
      resolvePromise({ ok: false, exitCode: null, output: `${output}${error instanceof Error ? error.message : String(error)}`, timedOut, spawnError: error })
    })
    child.on('close', exitCode => {
      clearTimeout(timer)
      resolvePromise({ ok: exitCode === 0, exitCode, output: output.trim(), timedOut })
    })
  })
}

/**
 * Skill status + explicit install/update for the page.
 * @param {{
 *   agentsHome?: string,
 *   agent?: string,
 *   timeoutMs?: number,
 *   env?: NodeJS.ProcessEnv,
 *   run?: (argv: readonly string[]) => Promise<{ ok: boolean, exitCode: number | null, output: string, timedOut?: boolean, spawnError?: Error }>,
 * }} options
 */
export function createSkillManager(options = {}) {
  const agentsHome = resolveAgentsHome(options.agentsHome)
  const agent = options.agent ?? DEFAULT_SKILL_AGENT
  const timeoutMs = options.timeoutMs ?? DEFAULT_SKILL_TIMEOUT_MS
  const env = { ...(options.env ?? process.env), DISABLE_TELEMETRY: options.env?.DISABLE_TELEMETRY ?? '1' }
  const run = options.run ?? (async argv => runCommand(argv, { timeoutMs, cwd: homedir(), env }))

  return {
    agentsHome,
    agent,

    async status() {
      const managed = await readManagedSkill(agentsHome)
      return {
        ok: true,
        agentsHome,
        agent,
        installed: managed !== undefined,
        ...(managed === undefined ? {} : { managed }),
        installCommand: skillsCommand('add', agent).join(' '),
        updateCommand: skillsCommand('update', agent).join(' '),
      }
    },

    async install() {
      const managed = await readManagedSkill(agentsHome)
      const action = managed === undefined ? 'add' : 'update'
      const argv = skillsCommand(action, agent)
      const result = await run(argv)
      const output = cleanOutput(result.output)
      if (result.spawnError !== undefined) {
        return {
          ok: false,
          action,
          command: argv.join(' '),
          output,
          error: { kind: 'npx-missing', message: 'could not start `npx`; install Node.js 22.20+ and make npx available on PATH', hint: argv.join(' ') },
        }
      }
      if (result.timedOut) {
        return {
          ok: false,
          action,
          command: argv.join(' '),
          output,
          error: { kind: 'timeout', message: `\`${argv.join(' ')}\` did not finish within ${timeoutMs} ms` },
        }
      }
      const status = await this.status()
      if (!result.ok) {
        return {
          ok: false,
          action,
          command: argv.join(' '),
          output,
          status,
          error: { kind: 'skills-cli', message: output.split('\n').filter(Boolean).slice(-1)[0] ?? `exited with ${result.exitCode}` },
        }
      }
      return { ok: true, action, command: argv.join(' '), output, status }
    },
  }
}
