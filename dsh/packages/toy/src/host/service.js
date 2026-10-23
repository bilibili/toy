/**
 * The shared Host operations behind both the model-facing tools and the Web UI.
 *
 * Kept in plain ESM so the tool tests and the browser page exercise one
 * implementation. Safety invariant: `preparePublish` never adds `--yes`; only
 * `submitPublish` does, after the page/tool has obtained human confirmation,
 * and it refuses stale, foreign or package-changed pending intents.
 *
 * @module dsh-toy/service
 */

import { randomUUID } from 'node:crypto'

import { buildPublishIntent, describeIntent } from '../argv.js'
import { ToyCli } from '../cli.js'
import { PendingStore } from '../pending.js'
import { packageFingerprint, precheck } from '../precheck.js'
import { createSkillManager } from './skills.js'

/** @param {string} kind @param {string} message @param {Record<string, unknown>} [extra] */
function failure(kind, message, extra = {}) {
  return { ok: false, error: { kind, message, ...extra } }
}

/**
 * Throw a CLI failure while keeping kind/code/hint for callers that classify
 * errors (the model tools read `.cliError`).
 * @param {{ error: { kind: string, message: string, code?: number, hint?: string } | null }} result
 * @param {string} fallbackMessage
 */
function throwCli(result, fallbackMessage) {
  const error = result.error ?? { kind: 'cli', message: fallbackMessage }
  return Object.assign(new Error(error.message ?? fallbackMessage), { cliError: error })
}

/** @param {unknown} value @param {number} fallback */
function intOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
}

/** Map the server's uppercase visibility enum to the lowercase create flag. */
function normalizeVisibility(value) {
  if (typeof value !== 'string') return null
  return value.toLowerCase().replaceAll('_', '-')
}

/** @param {string} url */
function slugFromUrl(url) {
  if (typeof url !== 'string') return null
  const match = url.match(/\/toy\/([^/]+)\//)
  return match === null ? null : match[1]
}

/** @param {any} item */
function toToySummary(item) {
  return {
    id: Number(item.id),
    title: typeof item.title === 'string' ? item.title : '',
    ...(typeof item.url === 'string' ? { url: item.url } : {}),
    ...(typeof slugFromUrl(item.url) === 'string' ? { slug: slugFromUrl(item.url) } : {}),
    ...(typeof item.status === 'string' ? { status: item.status } : {}),
    ...(normalizeVisibility(item.visibility) === null ? {} : { visibility: normalizeVisibility(item.visibility) }),
    ...(typeof item.category === 'string' ? { category: item.category } : {}),
    ...(typeof item.theme === 'string' ? { theme: item.theme } : {}),
    ...(typeof item.watermark_enabled === 'boolean' ? { watermark: item.watermark_enabled } : {}),
    ...(typeof item.poster_url === 'string' ? { posterUrl: item.poster_url } : {}),
    ...(typeof item.icon_url === 'string' ? { iconUrl: item.icon_url } : {}),
    ...(typeof item.ctime === 'number' ? { ctime: item.ctime } : {}),
    ...(typeof item.mtime === 'number' ? { mtime: item.mtime } : {}),
  }
}

/** @param {{ error: { kind: string, message: string, code?: number, hint?: string } | null }} result @param {Record<string, unknown>} [extra] */
function fromCliFailure(result, extra = {}) {
  const error = result.error ?? { kind: 'cli', message: 'the toy CLI failed' }
  return failure(error.kind, error.message, {
    ...(error.code === undefined ? {} : { code: error.code }),
    ...(error.hint === undefined ? {} : { hint: error.hint }),
    ...extra,
  })
}

/**
 * Best-effort lookup of one Toy in `mylist` for readable confirmation copy.
 * Never fails the calling operation.
 * @param {ToyCli} cli
 * @param {number} id
 * @param {AbortSignal} [signal]
 */
async function findToy(cli, id, signal) {
  try {
    for (let page = 1; page <= 3; page += 1) {
      const result = await cli.runJson(['mylist', '--page', String(page), '--size', '50'], { signal })
      if (!result.ok) return null
      const items = Array.isArray(result.data?.list) ? result.data.list : []
      const hit = items.find(item => Number(item?.id) === id)
      if (hit !== undefined) {
        return {
          id: Number(hit.id),
          title: typeof hit.title === 'string' ? hit.title : undefined,
          url: typeof hit.url === 'string' ? hit.url : undefined,
          slug: slugFromUrl(hit.url) ?? undefined,
          status: typeof hit.status === 'string' ? hit.status : undefined,
        }
      }
      const total = Number(result.data?.total ?? 0)
      const size = Number(result.data?.ps ?? 50)
      if (page * size >= total) return null
    }
  } catch {
    return null
  }
  return null
}

/**
 * Resolve the leading command path of an argv against the live schema.
 * A flag or unknown positional stops the path; a deeper command name after
 * that point is rejected (it would let a write subcommand slip past the
 * read-only check).
 * @param {{ commands: Map<string, any> }} schema
 * @param {readonly string[]} tokens
 */
function parseCommandPath(schema, tokens) {
  const isCommandPrefix = candidate =>
    schema.commands.has(candidate) || [...schema.commands.keys()].some(key => key.startsWith(`${candidate} `))
  /** @type {string[]} */
  const pathTokens = []
  let index = 0
  for (; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.startsWith('-')) break
    const candidate = [...pathTokens, token].join(' ')
    if (!isCommandPrefix(candidate)) break
    pathTokens.push(token)
  }
  if (pathTokens.length === 0) {
    if (index < tokens.length && tokens[index].startsWith('-')) {
      return { error: 'command must start with a command name (put flags after the command path)' }
    }
    const names = [...schema.commands.keys()].filter(key => !key.includes(' ')).sort()
    return { error: `unknown toy command ${JSON.stringify(tokens[0])}; known commands: ${names.join(', ')}` }
  }
  for (const token of tokens.slice(index)) {
    if (token.startsWith('-')) continue
    const deeper = `${pathTokens.join(' ')} ${token}`
    if ([...schema.commands.keys()].some(key => key === deeper || key.startsWith(`${deeper} `))) {
      return { error: `subcommand ${JSON.stringify(token)} must come directly after the command path; flags cannot be interleaved (got ${JSON.stringify(tokens.join(' '))})` }
    }
  }
  const path = pathTokens.join(' ')
  const command = schema.commands.get(path)
  if (command === undefined) {
    const options = [...schema.commands.keys()].filter(key => key.startsWith(`${path} `)).sort()
    return { error: `incomplete toy command ${JSON.stringify(path)}; finish it with one of: ${options.join(', ')}` }
  }
  return { path, command, index }
}

/**
 * Validate a `toy_run` argv against the live `--help-json` schema.
 * @param {ToyCli} cli
 * @param {readonly string[]} tokens
 * @param {AbortSignal} [signal]
 */
async function validateReadOnlyCommand(cli, tokens, signal) {
  if (tokens.length === 0) return { error: 'command needs at least one token, e.g. ["mylist"]' }
  if (tokens.some(token => token === '--yes' || token.startsWith('--yes='))) {
    return { error: '--yes is never accepted by toy_run; submitting for review goes through toy_submit' }
  }
  const shortFlag = tokens.find(token => token.startsWith('-') && !token.startsWith('--') && token !== '-')
  if (shortFlag !== undefined) return { error: `short flags are not supported by toy_run: ${shortFlag}` }
  let schema
  try {
    schema = await cli.schema({ signal })
  } catch (error) {
    return { error: `could not read \`toy --help-json\`: ${error instanceof Error ? error.message : String(error)}` }
  }
  const parsed = parseCommandPath(schema, tokens)
  if ('error' in parsed) return parsed
  const { path, command } = parsed
  if (command.writes === true) {
    return { error: `\`toy ${path}\` writes online state; use the dedicated tools (toy_publish/toy_submit) so the preview and confirmation gates apply` }
  }
  if (/(^| )(login|logout|upgrade)$/.test(path) || path.endsWith(' clear')) {
    return { error: `\`toy ${path}\` is not available through toy_run; use toy_account or toy_history` }
  }
  if (command.annotations?.risk !== undefined) {
    return { error: `\`toy ${path}\` is marked as ${String(command.annotations.risk)}; it is not available through the read-only passthrough` }
  }
  const allowedFlags = new Set((schema.globalFlags ?? []).map(flag => flag.name))
  for (const flag of Array.isArray(command.flags) ? command.flags : []) {
    if (typeof flag?.name === 'string') allowedFlags.add(flag.name)
  }
  for (const token of tokens) {
    if (!token.startsWith('--')) continue
    const name = token.slice(2).split('=')[0]
    if (!allowedFlags.has(name)) {
      return { error: `unknown flag --${name} for \`toy ${path}\`; allowed: ${[...allowedFlags].sort().map(flag => `--${flag}`).join(', ') || '(none)'}` }
    }
  }
  return { argv: tokens }
}

/**
 * Validate `help: true` argv: the command must resolve and no write argument is
 * forwarded — only the command path reaches the CLI.
 * @param {ToyCli} cli
 * @param {readonly string[]} tokens
 * @param {AbortSignal} [signal]
 */
async function validateHelpCommand(cli, tokens, signal) {
  if (tokens.some(token => token === '--yes' || token.startsWith('--yes='))) {
    return { error: '--yes is not meaningful with help=true' }
  }
  if (tokens.length === 0) return { argv: tokens }
  let schema
  try {
    schema = await cli.schema({ signal })
  } catch (error) {
    return { error: `could not read \`toy --help-json\`: ${error instanceof Error ? error.message : String(error)}` }
  }
  const parsed = parseCommandPath(schema, tokens.filter(token => token !== '--help-json'))
  if ('error' in parsed) return parsed
  const extraArguments = tokens.slice(parsed.index).filter(token => !token.startsWith('-'))
  if (extraArguments.length > 0) {
    return { error: `help=true takes only the command path (and flags), not arguments: ${JSON.stringify(extraArguments)}` }
  }
  return { argv: parsed.path.split(' ') }
}

/**
 * Create the shared operations for one plugin instance.
 * @param {import('./service-api.ts').ToyServiceConfig} config
 * @param {import('./service-api.ts').ToyLogger} [logger]
 */
export function createToyService(config, logger = {}) {
  const cli = new ToyCli(config, logger)
  const pending = new PendingStore({ ttlMs: config.pendingTtlMs })
  // Skill management: `npx skills` owns ~/.agents/skills (the paths dsh
  // scans); the bundle does not ship its own copy.
  const skill = createSkillManager({
    ...(config.agentsHome === undefined || config.agentsHome === '' ? {} : { agentsHome: config.agentsHome }),
    ...(config.skillAgent === undefined || config.skillAgent === '' ? {} : { agent: config.skillAgent }),
    ...(config.skillTimeoutMs === undefined ? {} : { timeoutMs: config.skillTimeoutMs }),
  })
  /** One-shot tickets for the destructive local history clear (Remote-safe). */
  const historyClearTickets = new Map()
  const HISTORY_CLEAR_TTL_MS = 2 * 60 * 1000

  /** Resolve the binary, reporting a structured error instead of throwing. */
  async function binaryPath() {
    try {
      return { binary: await cli.resolveBinary() }
    } catch (error) {
      return {
        binary: '',
        error: {
          kind: 'binary-missing',
          message: error instanceof Error ? error.message : String(error),
          hint: error instanceof Error && error.message.includes('configured')
            ? 'fix the `binary` config path, or clear it to use PATH / ~/.local/bin/toy'
            : 'install with `curl -fsSL https://boss.hdslb.com/toy-cli/toy/install.sh | bash`, then refresh',
        },
      }
    }
  }

  return {
    /** Bundled vs managed skill state for the page's skill card. */
    async skillStatus() {
      return await skill.status()
    },

    /** Run the fixed `npx skills add/update` after the page's confirmation. */
    async installSkill() {
      return await skill.install()
    },

    /**
     * Account state: logged-in user, resolved binary, CLI version.
     * @returns {Promise<import('../shared/types.ts').AccountView>}
     */
    async account() {
      const resolved = await binaryPath()
      if (resolved.error !== undefined) return { ok: false, loggedIn: false, binary: '', error: resolved.error }
      let version
      try {
        version = (await cli.schema()).version ?? undefined
      } catch {
        version = undefined
      }
      const result = await cli.whoami()
      if (!result.ok) {
        if (result.error?.kind === 'login-expired') {
          return {
            ok: true,
            loggedIn: false,
            binary: resolved.binary,
            ...(version === undefined ? {} : { version }),
            hint: '在宿主机执行 toy login（或点登录按钮），完成后重试',
          }
        }
        return {
          ok: false,
          loggedIn: false,
          binary: resolved.binary,
          ...(version === undefined ? {} : { version }),
          error: { kind: result.error?.kind ?? 'cli', message: result.error?.message ?? 'whoami failed', ...(result.error?.hint === undefined ? {} : { hint: result.error.hint }) },
        }
      }
      const user = result.data
      return {
        ok: true,
        loggedIn: true,
        binary: resolved.binary,
        ...(version === undefined ? {} : { version }),
        user: { uid: Number(user?.uid ?? 0), name: String(user?.name ?? '') },
      }
    },

    /**
     * Start the browser OAuth flow on the host.
     * @param {boolean} noOpen
     */
    async login(noOpen) {
      const argv = noOpen ? ['login', '--no-open'] : ['login']
      const result = await cli.runText(argv, { timeoutMs: config.loginTimeoutMs })
      if (!result.ok) {
        return { ok: false, loggedIn: false, binary: await cli.resolveBinary().catch(() => ''), error: { kind: result.error?.kind ?? 'cli', message: result.error?.message ?? 'login failed', ...(result.error?.hint === undefined ? {} : { hint: result.error.hint }) } }
      }
      const check = await this.account()
      if (check.loggedIn) return { ...check, output: result.text }
      return { ...check, output: result.text, hint: check.hint ?? '登录已完成但会话尚未生效，请稍后刷新' }
    },

    /** Clear the local session. */
    async logout() {
      const result = await cli.runText(['logout'])
      if (!result.ok) {
        return { ok: false, loggedIn: false, binary: await cli.resolveBinary().catch(() => ''), error: { kind: result.error?.kind ?? 'cli', message: result.error?.message ?? 'logout failed', ...(result.error?.hint === undefined ? {} : { hint: result.error.hint }) } }
      }
      return { ok: true, loggedIn: false, binary: await cli.resolveBinary().catch(() => ''), output: result.text }
    },

    /**
     * One page of my Toys.
     * @param {number} page
     * @param {number} size
     * @returns {Promise<import('../shared/types.ts').ToyListPage>}
     */
    async listToys(page, size) {
      const pageNumber = intOr(page, 1)
      const pageSize = intOr(size, 20)
      if (pageNumber < 1) throw new Error('page must be >= 1')
      const result = await cli.runJson(['mylist', '--page', String(pageNumber), '--size', String(pageSize)])
      if (!result.ok) throw throwCli(result, 'mylist failed')
      const data = result.data ?? {}
      const list = Array.isArray(data.list) ? data.list : []
      return {
        total: Number(data.total ?? list.length),
        page: Number(data.pn ?? pageNumber),
        size: Number(data.ps ?? pageSize),
        items: list.map(toToySummary),
      }
    },

    /**
     * One Toy's stats.
     * @param {number} id
     * @param {{ days?: number, start?: string, end?: string }} window
     * @returns {Promise<import('../shared/types.ts').ToyStats>}
     */
    async stats(id, window) {
      const toyId = intOr(id, 0)
      if (toyId <= 0) throw new Error('id must be a positive Toy id')
      const argv = ['stats', String(toyId)]
      const DATE = /^\d{4}-\d{2}-\d{2}$/
      if (typeof window.days === 'number' && window.days > 0) {
        if (window.days > 90) throw new Error('days must be between 1 and 90')
        argv.push('--days', String(intOr(window.days, 7)))
      } else if (typeof window.start === 'string' && window.end !== undefined) {
        if (!DATE.test(window.start) || !DATE.test(window.end)) throw new Error('start/end must be YYYY-MM-DD')
        argv.push('--start', window.start, '--end', window.end)
      }
      const result = await cli.runJson(argv)
      if (!result.ok) throw throwCli(result, 'stats failed')
      const data = result.data ?? {}
      const items = Array.isArray(data.items) ? data.items : []
      const dyn = data.dyn_stat ?? {}
      return {
        id: Number(data.id ?? toyId),
        items: items.map(item => ({
          date: String(item.date ?? ''),
          pv: Number(item.pv ?? 0),
          uv: Number(item.uv ?? 0),
          ...(typeof (item.retention_1d ?? item.uv_retained_1d) === 'number' ? { retention: Number(item.retention_1d ?? item.uv_retained_1d) } : {}),
        })),
        ...(Object.keys(dyn).length === 0 ? {} : {
          dynStat: {
            ...(typeof dyn.like === 'number' ? { like: dyn.like } : {}),
            ...(typeof dyn.favorite === 'number' ? { favorite: dyn.favorite } : {}),
            ...(typeof dyn.comment === 'number' ? { comment: dyn.comment } : {}),
            ...(typeof dyn.share === 'number' ? { share: dyn.share } : {}),
          },
        }),
      }
    },

    /**
     * Local publish/update history.
     * @param {string} [path]
     * @returns {Promise<readonly import('../shared/types.ts').HistoryRecord[]>}
     */
    async history(path = '') {
      const argv = ['history']
      if (path !== '') {
        if (path.startsWith('-')) throw new Error('path must not start with "-"')
        if (path === 'clear') throw new Error('use the clear control to delete local history')
        argv.push(path)
      }
      const result = await cli.runJson(argv)
      if (!result.ok) throw throwCli(result, 'history failed')
      const records = Array.isArray(result.data) ? result.data : []
      return records.map(record => ({
        ...(typeof record.id === 'number' ? { id: record.id } : {}),
        ...(typeof record.title === 'string' ? { title: record.title } : {}),
        ...(typeof record.path === 'string' ? { path: record.path } : {}),
        ...(typeof record.slug === 'string' ? { slug: record.slug } : {}),
        ...(typeof record.action === 'string' ? { action: record.action } : {}),
        ...(typeof record.time === 'string' ? { time: record.time } : {}),
        ...(typeof record.visibility === 'string' ? { visibility: record.visibility } : {}),
        ...(typeof record.cli_version === 'string' ? { cliVersion: record.cli_version } : {}),
      }))
    },

    /** Host paths from the local history, newest first. */
    async historyPaths() {
      const records = await this.history('')
      const seen = new Set()
      const paths = []
      for (const record of records) {
        if (record.path === undefined || record.path === '' || seen.has(record.path)) continue
        seen.add(record.path)
        paths.push(record.path)
      }
      return paths
    },

    /**
     * Issue a one-shot ticket for the destructive local history clear. The Web
     * page asks only after its typed confirmation; the ticket keeps a stray
     * single Remote call from wiping local history.
     * @param {string} ownerId
     */
    async prepareHistoryClear(ownerId) {
      const now = Date.now()
      for (const [token, ticket] of historyClearTickets) {
        if (ticket.expiresAt <= now) historyClearTickets.delete(token)
      }
      const ticket = { ownerId, expiresAt: now + HISTORY_CLEAR_TTL_MS }
      const token = randomUUID()
      historyClearTickets.set(token, ticket)
      return { ok: true, token, expiresAt: new Date(ticket.expiresAt).toISOString() }
    },

    /**
     * Consume a history-clear ticket and clear local records.
     * @param {string} token
     * @param {string} ownerId
     */
    async clearHistory(token, ownerId) {
      const ticket = historyClearTickets.get(token)
      if (ticket === undefined || ticket.ownerId !== ownerId || ticket.expiresAt <= Date.now()) {
        historyClearTickets.delete(token)
        return failure('confirmation-required', 'the history clear ticket is missing, expired, or belongs to another session')
      }
      historyClearTickets.delete(token)
      const result = await cli.run(['history', 'clear', '--yes'])
      if (!result.ok) return fromCliFailure(result)
      return { ok: true, output: typeof result.text === 'string' ? result.text : JSON.stringify(result.data ?? '') }
    },

    /**
     * Local package precheck; never uploads.
     * @param {import('./service-api.ts').PrecheckInput} input
     * @returns {Promise<import('../shared/types.ts').ToyPrecheck>}
     */
    async precheck(input) {
      if (typeof input.path !== 'string' || input.path === '') throw new Error('path is required')
      const result = await precheck(input.path, {
        ...(input.poster === undefined ? {} : { poster: input.poster }),
        ...(input.icon === undefined ? {} : { icon: input.icon }),
        ...(input.slug === undefined ? {} : { slug: input.slug }),
        ...(input.requireRootIndex === undefined ? {} : { requireRootIndex: input.requireRootIndex }),
      })
      return {
        ok: result.ok,
        kind: result.kind,
        errors: result.errors,
        warnings: result.warnings,
        findings: result.findings.map(finding => ({ severity: finding.severity, file: finding.file, message: finding.message })),
      }
    },

    /**
     * Upload once for a preview (path input) or plan a metadata-only update.
     * Never adds `--yes`.
     * @param {import('../shared/types.ts').PublishInput} input
     * @param {string} ownerId
     * @returns {Promise<import('../shared/types.ts').PublishPreparation>}
     */
    async preparePublish(input, ownerId) {
      const prepared = buildPublishIntent(input)
      if ('error' in prepared) return failure('invalid-argument', prepared.error)
      const { intent } = prepared

      /** @type {import('../shared/types.ts').ToyPrecheck | undefined} */
      let report
      if (intent.path !== null && config.precheck !== 'off') {
        const checked = await this.precheck({
          path: intent.path,
          ...(typeof input.poster === 'string' ? { poster: input.poster } : {}),
          ...(typeof input.icon === 'string' ? { icon: input.icon } : {}),
          ...(typeof input.slug === 'string' ? { slug: input.slug } : {}),
        })
        report = checked
        if (checked.errors > 0 && config.precheck === 'block') {
          return { ok: false, stage: 'blocked', precheck: checked, error: { kind: 'precheck-blocked', message: 'the local package precheck found blocking problems; nothing was uploaded', hint: 'fix the ERROR findings, or set precheck to warn/off' } }
        }
      }

      const numericId = intent.id === null ? null : Number(intent.id)
      const target = numericId === null ? undefined : (await findToy(cli, numericId)) ?? { id: numericId }

      // Fingerprint BEFORE the upload: the stored value must describe exactly
      // the bytes handed to the preview. A later edit then fails the submit
      // check instead of silently being submitted.
      let fingerprint
      if (intent.path !== null) {
        try {
          fingerprint = await packageFingerprint(intent.path)
        } catch (error) {
          return failure(
            'package-unreadable',
            `could not fingerprint the package before uploading: ${error instanceof Error ? error.message : String(error)}`,
            { hint: 'check the path and filesystem permissions, then prepare the publish again' },
          )
        }
      }

      let previewUrl
      if (intent.hasPackage) {
        const result = await cli.runJson(intent.argv, { timeoutMs: config.uploadTimeoutMs })
        if (!result.ok) return { ...fromCliFailure(result), stage: 'preview' }
        previewUrl = typeof result.data?.preview_url === 'string' ? result.data.preview_url : undefined
        if (previewUrl === undefined) {
          return failure('invalid-output', 'the toy CLI did not return a preview_url; nothing was submitted. Check `toy upgrade` if this persists.')
        }
      }

      const summary = describeIntent(intent, { target })
      const stored = pending.create({
        ownerId,
        argv: intent.argv,
        action: intent.action,
        previewUrl: previewUrl ?? null,
        summary,
        targetId: numericId === null ? null : String(numericId),
        title: intent.title,
        slug: intent.slug,
        path: intent.path,
        fingerprint: fingerprint ?? null,
      })

      return {
        ok: true,
        stage: previewUrl === undefined ? 'planned' : 'preview',
        pendingId: stored.token,
        ...(previewUrl === undefined ? {} : { previewUrl }),
        summary,
        action: intent.action,
        changes: intent.changes,
        ...(target === undefined ? {} : { target }),
        ...(report === undefined ? {} : { precheck: report }),
        expiresAt: new Date(stored.expiresAt).toISOString(),
      }
    },

    /**
     * Read a pending intent without consuming it (the tool half builds its
     * confirmation prompt from this).
     * @param {string} pendingId
     * @param {string} ownerId
     */
    async inspectPending(pendingId, ownerId) {
      const intent = pending.peek(pendingId)
      if (intent === undefined || intent.ownerId !== ownerId) return null
      return {
        pendingId: intent.token,
        summary: intent.summary,
        ...(intent.previewUrl === null ? {} : { previewUrl: intent.previewUrl }),
        action: intent.action,
        ...(intent.path === null ? {} : { path: intent.path }),
        ...(intent.targetId === null ? {} : { targetId: intent.targetId }),
        ...(intent.title === null ? {} : { title: intent.title }),
        ...(intent.slug === null ? {} : { slug: intent.slug }),
        ...(intent.fingerprint === null ? {} : { fingerprint: intent.fingerprint }),
        expiresAt: new Date(intent.expiresAt).toISOString(),
      }
    },

    /**
     * Submit a prepared publish with `--yes`. Callers must have obtained the
     * human confirmation already; this enforces the content and ownership
     * invariants.
     * @param {string} pendingId
     * @param {string} ownerId
     * @returns {Promise<import('../shared/types.ts').SubmitResult>}
     */
    async submitPublish(pendingId, ownerId) {
      const existing = pending.peek(pendingId)
      if (existing === undefined) return failure('unknown-pending', 'unknown or already used pending id; prepare the publish again')
      if (existing.ownerId !== ownerId) return failure('foreign-pending', 'this pending intent belongs to another session')
      if (existing.path !== null) {
        if (existing.fingerprint === null) {
          return failure('package-unverified', 'this pending intent has no package fingerprint, so its content cannot be verified; prepare the publish again')
        }
        let current
        try {
          current = await packageFingerprint(existing.path)
        } catch {
          return failure('package-missing', `the package path ${existing.path} is no longer readable; prepare the publish again`)
        }
        if (current !== existing.fingerprint) {
          return failure('package-changed', `the package at ${existing.path} changed after the preview was created; prepare the publish again and re-check the new preview`)
        }
      }
      const taken = pending.take(pendingId, ownerId)
      if ('error' in taken) return failure(taken.kind === 'expired' ? 'expired-pending' : taken.kind, taken.error)
      const result = await cli.runJson([...taken.intent.argv, '--yes'], { timeoutMs: config.uploadTimeoutMs })
      if (!result.ok) return { ...fromCliFailure(result), previewUrl: taken.intent.previewUrl ?? undefined }
      const data = result.data ?? {}
      return {
        ok: true,
        submitted: true,
        ...(data.id === undefined ? (taken.intent.targetId === null ? {} : { id: Number(taken.intent.targetId) }) : { id: Number(data.id) }),
        ...(typeof data.status === 'string' ? { status: data.status } : {}),
        ...(typeof data.preview_url === 'string' ? { previewUrl: data.preview_url } : (taken.intent.previewUrl === null ? {} : { previewUrl: taken.intent.previewUrl })),
        action: taken.intent.action,
      }
    },

    /**
     * Drop a pending intent the caller abandoned.
     * @param {string} pendingId
     * @param {string} ownerId
     */
    async cancelPending(pendingId, ownerId) {
      return pending.cancel(pendingId, ownerId)
    },

    /**
     * Run one validated read-only `toy` command (the `toy_run` tool).
     * @param {readonly string[]} command
     * @param {boolean} help
     * @param {AbortSignal} [signal]
     * @returns {Promise<import('./service-api.ts').ReadOnlyRun>}
     */
    async runReadOnly(command, help, signal) {
      const tokens = Array.isArray(command) ? command.map(String) : []
      if (tokens.length === 0) return failure('invalid-argument', 'command must be a non-empty array, e.g. ["mylist"]')
      if (help === true) {
        const withoutHelp = tokens.filter(token => token !== '--help-json')
        const validated = await validateHelpCommand(cli, withoutHelp, signal)
        if ('error' in validated) return failure('read-only-violation', validated.error)
        const result = await cli.runJson([...validated.argv, '--help-json'], { signal })
        if (!result.ok) return fromCliFailure(result)
        return { ok: true, help: result.data }
      }
      const valid = await validateReadOnlyCommand(cli, tokens, signal)
      if ('error' in valid) return failure('read-only-violation', valid.error)
      const result = await cli.runJson(valid.argv, { signal })
      if (!result.ok) return fromCliFailure(result)
      return { ok: true, command: valid.argv.join(' '), data: result.data }
    },
  }
}
