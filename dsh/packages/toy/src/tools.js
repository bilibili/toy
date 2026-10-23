/**
 * The model-facing tool surface of @bilibili/dsh-toy.
 *
 * Safety model (mirrors the Toy skill's rules, enforced in code instead of
 * prose):
 *   - `toy_publish` only PREPARES: with a package it runs the CLI without
 *     `--yes` and returns a preview link; metadata-only updates are planned but
 *     not sent.
 *   - `toy_submit` is the only PUBLISH path that adds `--yes`, and it asks the
 *     user first (question UI, then the approval seam). No answer -> no submit.
 *   - the one other `--yes` (destructive local `history clear`) asks the same way.
 *   - `toy_run` is a read-only passthrough validated against `toy --help-json`;
 *     write commands and `--yes` are refused there.
 *   - an upload is refused while the local package precheck reports an ERROR.
 *
 * Everything that touches the pending store, the subject fingerprint or the
 * CLI lives in the shared Host service (`src/host/service.js`), which the Web
 * page uses too. This module only owns the model-facing contract: the tool
 * definitions, the human confirmation gate, and the snake_case result shapes.
 *
 * @module dsh-toy/tools
 */

import { packageFingerprint } from './precheck.js'

const SUBMIT_LABEL = 'Submit for review'
const CANCEL_LABEL = 'Not now'
const TOOL_OUTPUT = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

/**
 * @param {string} kind
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 */
function failure(kind, message, extra = {}) {
  return { ok: false, error: { kind, message, ...extra } }
}

/**
 * Turn a failed Host operation into a tool result.
 * @param {{ error?: { kind?: string, message?: string, code?: number, hint?: string } }} result
 * @param {Record<string, unknown>} [extra]
 */
function fromOperationFailure(result, extra = {}) {
  const error = result.error ?? {}
  return failure(
    typeof error.kind === 'string' ? error.kind : 'cli',
    typeof error.message === 'string' ? error.message : 'the toy CLI failed',
    {
      ...(error.code === undefined ? {} : { code: error.code }),
      ...(error.hint === undefined ? {} : { hint: error.hint }),
      ...extra,
    },
  )
}

/** @param {unknown} value @param {number} fallback */
function intOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
}

/**
 * Ask the user a question, preferring the question UI and falling back to the
 * approval seam. Returns null when no answerer exists (the caller must fail
 * closed).
 * @param {any} ctx
 * @param {{ agent?: { id: string }, signal?: AbortSignal }} exec
 * @param {{ toolName: string, header: string, question: string, detail?: string, options: readonly { label: string, description?: string }[] }} request
 * @returns {Promise<{ approved: boolean, answer: string | null, channel: 'question' | 'approval', outcome?: string } | null>}
 */
async function askUser(ctx, exec, request) {
  const agent = exec.agent
  if (agent === undefined) return null

  const questions = /** @type {any} */ (ctx.get('userQuestions'))
  if (questions !== undefined && typeof questions?.ask === 'function') {
    try {
      const response = await questions.ask({
        agent,
        questions: [{
          id: 'confirm',
          header: request.header,
          question: request.question,
          ...(request.detail === undefined ? {} : { detail: request.detail }),
          options: request.options.map(option => ({
            label: option.label,
            ...(option.description === undefined ? {} : { description: option.description }),
          })),
        }],
        signal: exec.signal,
      })
      const selected = response?.answers?.find(item => item.id === 'confirm')?.selected ?? []
      const answer = Array.isArray(selected) && selected.length > 0 ? selected[0] : null
      const confirmLabel = request.options[0]?.label
      return { approved: answer !== null && answer === confirmLabel, answer, channel: 'question' }
    } catch (error) {
      // An aborted turn must cancel the tool, not silently fall through to a
      // second prompt.
      if (error?.name === 'ASK_ABORTED' || error?.code === 'ASK_ABORTED' || /ASK_ABORTED/.test(String(error?.message ?? ''))) {
        throw error
      }
      // Otherwise fall through to the approval seam.
    }
  }

  const approval = /** @type {any} */ (ctx.get('approval'))
  if (approval !== undefined && typeof approval?.request === 'function') {
    try {
      const outcome = await approval.request({
        agent,
        toolName: request.toolName,
        callId: exec.callId,
        reason: request.question,
        displayReason: {
          en: `${request.header}: ${request.question.split('\n')[0]}`,
          zh: `${request.header}：${request.question.split('\n')[0]}`,
        },
        signal: exec.signal,
      })
      return { approved: outcome === 'allowed-once', answer: null, channel: 'approval', outcome }
    } catch {
      return null
    }
  }

  return null
}

/**
 * @param {{ toolName: string, header: string, question: string, detail?: string, confirmLabel?: string, cancelLabel?: string, confirmDescription?: string, cancelDescription?: string }} request
 * @returns {Promise<{ allowed: true } | { allowed: false, result: Record<string, unknown> }>}
 */
async function requireConfirmation(ctx, exec, request) {
  const confirmLabel = request.confirmLabel ?? SUBMIT_LABEL
  const cancelLabel = request.cancelLabel ?? CANCEL_LABEL
  const response = await askUser(ctx, exec, {
    toolName: request.toolName,
    header: request.header,
    question: request.question,
    detail: request.detail,
    options: [
      { label: confirmLabel, description: request.confirmDescription },
      { label: cancelLabel, description: request.cancelDescription },
    ],
  })
  if (response === null) {
    return {
      allowed: false,
      result: failure(
        'confirmation-unavailable',
        'no confirmation channel is available in this session, so nothing was submitted',
        { hint: 'ask the user directly in chat; only a human can approve a submit. The pending preview is still available.' },
      ),
    }
  }
  if (!response.approved) {
    return {
      allowed: false,
      result: {
        ok: false,
        submitted: false,
        cancelled: true,
        reason: response.channel === 'approval' ? `user did not approve (${response.outcome ?? 'no answer'})` : 'the user did not choose to confirm',
      },
    }
  }
  return { allowed: true }
}

/**
 * Register every model-facing tool on the calling context.
 *
 * @param {any} ctx cordis context; needs `tools` and (for confirmations)
 *   `userQuestions` / `approval`.
 * @param {any} service the shared Host service (`createToyService(...)`).
 */
export function registerLaunchTools(ctx, service) {
  const logger = ctx.logger ?? {}
  const register = definition => ctx.tools.register(definition)
  const ownerId = exec => String(exec?.agent?.id ?? 'unknown-agent')

  /**
   * Package fingerprints captured when this process created a preview. The
   * Host service stores the same value; this copy lets `toy_submit` re-check
   * the package BEFORE asking the user, so a changed package never turns into
   * a prompt to approve bytes they never saw. (The service still re-checks at
   * submit time, so a page-created intent is safe too.)
   * @type {Map<string, { ownerId: string, path: string | null, fingerprint: string | null }>}
   */
  const previewedPackages = new Map()

  /** Wrap a handler so a thrown error becomes a tool result, never a crash. */
  const safe = handler => async (args, exec) => {
    try {
      return await handler(args, exec)
    } catch (error) {
      // `ToyCli` failures are re-thrown by the service with the structured
      // error attached, so keep their kind/code/hint.
      if (error?.cliError !== undefined) return fromOperationFailure({ error: error.cliError })
      logger?.warn?.(`toy tool failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
      return failure('internal', error instanceof Error ? error.message : String(error))
    }
  }

  register({
    name: 'toy_account',
    description: 'Check, start or end the toy CLI login (server-side OAuth). `status` reports the logged-in user without changing anything; `login` opens the browser OAuth flow (set noOpen to print the URL instead); `logout` clears the local session. Any other toy tool that reports kind "login-expired" needs `login` first, then one retry.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['status', 'login', 'logout'], description: 'What to do.' },
        noOpen: { type: 'boolean', description: 'login: do not open a browser automatically.' },
      },
      required: ['action'],
    },
    output: TOOL_OUTPUT,
    execute: safe(async (args, exec) => {
      if (args.action === 'status') {
        const view = await service.account()
        const version = view.version ?? null
        if (!view.ok) return fromOperationFailure(view, { version })
        if (!view.loggedIn) {
          return { ok: true, loggedIn: false, version, hint: 'run toy_account action=login, then retry the original command once' }
        }
        return { ok: true, loggedIn: true, version, user: view.user }
      }
      if (args.action === 'login') {
        const view = await service.login(args.noOpen === true)
        if (view.output === undefined && !view.ok) return fromOperationFailure(view)
        return {
          ok: true,
          loggedIn: view.loggedIn === true,
          output: view.output,
          ...(view.loggedIn === true
            ? { user: view.user }
            : { hint: 'login finished but the session is not valid yet; retry toy_account action=status once' }),
        }
      }
      if (args.action === 'logout') {
        const view = await service.logout()
        if (!view.ok) return fromOperationFailure(view)
        return { ok: true, loggedIn: false, output: view.output }
      }
      return failure('invalid-argument', `unknown action ${JSON.stringify(args.action)}`)
    }),
  })

  register({
    name: 'toy_list',
    description: 'List the Toys owned by the logged-in toy CLI account (toy mylist). Returns id, title, status, visibility, category, theme, watermark, poster/icon URLs and the shareable url for each. Use it to find the id needed by toy_stats / toy_publish / toy_update.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        page: { type: 'number', description: 'Page number, 1-based. Default 1.' },
        size: { type: 'number', description: 'Page size. Default 20.' },
      },
    },
    output: TOOL_OUTPUT,
    execute: safe(async args => {
      const page = intOr(args.page, 1)
      const size = intOr(args.size, 20)
      if (page < 1) return failure('invalid-argument', 'page must be >= 1')
      if (size < 1 || size > 100) return failure('invalid-argument', 'size must be between 1 and 100')
      const data = await service.listToys(page, size)
      return {
        ok: true,
        total: data.total,
        page: data.page,
        size: data.size,
        items: data.items.map(item => ({
          id: item.id,
          title: item.title,
          url: item.url ?? null,
          slug: item.slug ?? null,
          status: item.status ?? null,
          visibility: item.visibility ?? null,
          category: item.category ?? null,
          theme: item.theme ?? null,
          watermark: item.watermark ?? null,
          posterUrl: item.posterUrl ?? null,
          iconUrl: item.iconUrl ?? null,
        })),
      }
    }),
  })

  register({
    name: 'toy_stats',
    description: 'Read one Toy\'s visit statistics (toy stats): daily PV/UV and next-day retention, plus interaction totals. Default window is the last 7 days (ending yesterday); pass days, or start+end (YYYY-MM-DD, max 90 days). Always pass id explicitly.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'number', description: 'Toy id from toy_list.' },
        days: { type: 'number', description: 'Last N days, ending yesterday. Mutually exclusive with start/end.' },
        start: { type: 'string', description: 'Start date YYYY-MM-DD (needs end).' },
        end: { type: 'string', description: 'End date YYYY-MM-DD (needs start).' },
      },
      required: ['id'],
    },
    output: TOOL_OUTPUT,
    execute: safe(async args => {
      const id = intOr(args.id, 0)
      if (id <= 0) return failure('invalid-argument', 'id must be a positive Toy id')
      const hasDays = args.days !== undefined
      const hasRange = args.start !== undefined || args.end !== undefined
      if (hasDays && hasRange) return failure('invalid-argument', 'days is mutually exclusive with start/end')
      if (hasRange && (args.start === undefined || args.end === undefined)) {
        return failure('invalid-argument', 'start and end must be passed together')
      }
      /** @type {{ days?: number, start?: string, end?: string }} */
      const window = {}
      if (hasDays) {
        const days = intOr(args.days, 0)
        if (days < 1 || days > 90) return failure('invalid-argument', 'days must be between 1 and 90')
        window.days = days
      }
      if (hasRange) {
        window.start = String(args.start)
        window.end = String(args.end)
      }
      const stats = await service.stats(id, window)
      // Same (CLI-shaped) payload the tool returned before the service split,
      // rebuilt from the service's normalized wire type.
      return {
        ok: true,
        id,
        data: {
          items: stats.items.map(item => ({
            date: item.date,
            pv: item.pv,
            uv: item.uv,
            ...(item.retention === undefined ? {} : { retention_1d: item.retention }),
          })),
          ...(stats.dynStat === undefined ? {} : { dyn_stat: stats.dynStat }),
        },
      }
    }),
  })

  register({
    name: 'toy_history',
    description: 'Read the local publish/update history for this machine and logged-in account (toy history), optionally filtered to one path. Pass clear=true only when the user explicitly wants to delete the whole local history: it asks for confirmation first and never touches published Toys.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'Only records for this directory/file.' },
        clear: { type: 'boolean', description: 'Delete all local publish records (destructive to local history only).' },
      },
    },
    output: TOOL_OUTPUT,
    execute: safe(async (args, exec) => {
      if (args.clear === true) {
        const confirmation = await requireConfirmation(ctx, exec, {
          toolName: 'toy_history',
          header: 'Clear local publish history',
          question: 'Delete the local publish/update history for every repository and Toy on this machine? Published Toys are not affected, and the history cannot be recovered.',
          confirmLabel: 'Clear history',
          cancelLabel: 'Cancel',
          confirmDescription: 'Deletes local publish records only.',
          cancelDescription: 'Keeps every local record.',
        })
        if (!confirmation.allowed) return confirmation.result
        const owner = String(exec.agent?.id ?? 'unknown-agent')
        const ticket = await service.prepareHistoryClear(owner)
        if (!ticket.ok || ticket.token === undefined) {
          return fromOperationFailure(ticket)
        }
        const result = await service.clearHistory(ticket.token, owner)
        if (!result.ok) return fromOperationFailure(result)
        return { ok: true, cleared: true, output: result.output ?? null }
      }
      let path = ''
      if (typeof args.path === 'string' && args.path !== '') {
        if (args.path.startsWith('-')) return failure('invalid-argument', 'path must not start with "-"')
        // `toy history clear <path>` is the destructive subcommand, not a filter.
        if (args.path === 'clear') return failure('invalid-argument', 'use clear: true to delete local history (it asks for confirmation)')
        path = args.path
      }
      const records = await service.history(path)
      return { ok: true, records }
    }),
  })

  register({
    name: 'toy_precheck',
    description: 'Run the local Toy package precheck before publishing: entry index.html presence and its 1 MB decompressed cap, root-relative asset paths that white-screen under /toy/<slug>/, missing local resources, slug/poster/icon rules, framework-source and content-hash warnings, cloud-storage rate-limit shapes. Returns ERROR (blocking) and WARN findings. No network, no upload.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'Package directory, .zip file, or single .html file.' },
        poster: { type: 'string', description: 'Local cover image to validate (optional).' },
        icon: { type: 'string', description: 'Local icon image to validate (optional).' },
        slug: { type: 'string', description: 'Slug to validate (optional).' },
        requireRootIndex: { type: 'boolean', description: 'Require index.html at the package root (the CLI expects this).' },
      },
      required: ['path'],
    },
    output: TOOL_OUTPUT,
    execute: safe(async args => {
      if (typeof args.path !== 'string' || args.path === '') return failure('invalid-argument', 'path is required')
      const result = await service.precheck({
        path: String(args.path),
        ...(typeof args.poster === 'string' ? { poster: args.poster } : {}),
        ...(typeof args.icon === 'string' ? { icon: args.icon } : {}),
        ...(typeof args.slug === 'string' ? { slug: args.slug } : {}),
        requireRootIndex: args.requireRootIndex === true,
      })
      return { ok: result.ok, kind: result.kind, errors: result.errors, warnings: result.warnings, findings: result.findings }
    }),
  })

  register({
    name: 'toy_publish',
    description: 'PREPARE a Toy publish or update. Never submits for review. With `path` it uploads the package once and returns a preview_url plus a pending_id; show the preview URL to the user and wait for explicit consent, then call toy_submit with that pending_id. With action=update and no path it only plans a metadata change (title/poster/icon/category/visibility/theme/watermark/activity) and returns a pending_id; there is no preview link for metadata-only updates. An upload is refused while the local precheck reports an ERROR. Slug cannot be changed after publish.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['create', 'update'], description: 'create a new Toy or update an existing one.' },
        id: { type: 'number', description: 'update: target Toy id (see toy_list). create: omit.' },
        path: { type: 'string', description: 'Package directory, .zip or single .html file. Required for create.' },
        title: { type: 'string', description: 'Toy title.' },
        slug: { type: 'string', description: 'create only: URL slug [A-Za-z0-9_-], cannot change later.' },
        poster: { type: 'string', description: 'Local cover image (.png/.jpg/.jpeg, 4:3 preferred).' },
        icon: { type: 'string', description: 'Local icon image (.png/.jpg/.jpeg, <=512KB, each side <=1024px).' },
        category: { type: 'string', enum: ['GAME', 'INTERACTIVE_PLAY', 'TOOL', 'TEST', 'GUIDE', 'COLLECTION', 'OTHER'] },
        visibility: { type: 'string', enum: ['link-only', 'password', 'public'] },
        accessPassword: { type: 'string', description: '4-32 characters; required when visibility=password on create.' },
        theme: { type: 'string', enum: ['dark', 'light'] },
        watermark: { type: 'boolean', description: 'Visitor watermark. Required for free-drawing Toys; update omits it to keep the current setting.' },
        activity: { type: 'string', description: 'Activity code (e.g. s_race_2026). On update, an empty string explicitly cancels participation.' },
      },
      required: ['action'],
    },
    output: TOOL_OUTPUT,
    execute: safe(async (args, exec) => {
      const owner = ownerId(exec)
      const prepared = await service.preparePublish(args, owner)
      if (!prepared.ok) {
        // Keep the pre-service tool contract for a blocked precheck.
        if (prepared.stage === 'blocked' && prepared.precheck !== undefined) {
          return {
            ok: false,
            stage: 'precheck',
            blocked: true,
            message: 'the local package precheck found blocking problems, so nothing was uploaded; fix them or pass precheck: warn/off in the plugin config',
            errors: prepared.precheck.errors,
            warnings: prepared.precheck.warnings,
            findings: prepared.precheck.findings,
          }
        }
        return fromOperationFailure(prepared, prepared.stage === 'preview' ? { stage: 'preview' } : {})
      }

      const numericId = args.action === 'update' && typeof args.id === 'number' ? Math.trunc(args.id) : null
      const target = prepared.target ?? (numericId === null ? null : { id: numericId })
      const previewUrl = prepared.previewUrl ?? null

      if (prepared.pendingId === undefined) {
        return failure('invalid-output', 'the toy CLI did not return a preview_url; nothing was submitted. Check `toy upgrade` if this persists.')
      }

      // Remember the package fingerprint so toy_submit can refuse a package
      // that changed after the user saw the preview, before asking them.
      let fingerprint = null
      if (typeof args.path === 'string' && args.path !== '') {
        try {
          fingerprint = await packageFingerprint(args.path)
        } catch {
          fingerprint = null
        }
      }
      previewedPackages.set(prepared.pendingId, {
        ownerId: owner,
        path: typeof args.path === 'string' && args.path !== '' ? args.path : null,
        fingerprint,
      })

      const precheck = prepared.precheck === undefined
        ? null
        : { errors: prepared.precheck.errors, warnings: prepared.precheck.warnings, findings: prepared.precheck.findings }

      return {
        ok: true,
        stage: prepared.stage,
        pending_id: prepared.pendingId,
        preview_url: previewUrl,
        summary: prepared.summary,
        action: args.action,
        target,
        changes: prepared.changes ?? [],
        precheck,
        expires_at: prepared.expiresAt,
        next: previewUrl === null
          ? 'Show the user exactly what will change, get explicit consent, then call toy_submit with this pending_id. There is no preview link for metadata-only updates.'
          : 'Give the user the preview_url and ask them to check it. Only after they explicitly say submit, call toy_submit with this pending_id.',
      }
    }),
  })

  register({
    name: 'toy_submit',
    description: 'Submit a prepared publish for review (toy create/update with --yes). Takes the pending_id returned by toy_publish, asks the user to confirm (question UI, then the approval seam), and only then re-runs the exact prepared command with --yes. Call it only after the user has seen the preview (or the metadata change) and explicitly agreed to submit; a refusal cancels and keeps the pending intent intact.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        pending_id: { type: 'string', description: 'Token returned by toy_publish.' },
      },
      required: ['pending_id'],
    },
    output: TOOL_OUTPUT,
    execute: safe(async (args, exec) => {
      const token = typeof args.pending_id === 'string' ? args.pending_id : ''
      if (token === '') return failure('invalid-argument', 'pending_id is required; call toy_publish first')
      const owner = ownerId(exec)
      const preview = await service.inspectPending(token, owner)
      if (preview === null) return await describeMissingPending(service, token, owner)

      // The CLI re-packages and re-uploads on submit, so a changed package
      // would submit bytes the user never saw. Refuse and re-preview instead.
      // The fingerprint stored by the Host service wins; the copy kept in this
      // process covers the service not exposing it on the preview.
      const local = previewedPackages.get(token)
      const path = preview.path ?? local?.path ?? null
      const storedFingerprint = typeof preview.fingerprint === 'string'
        ? preview.fingerprint
        : local !== undefined && local.ownerId === owner ? local.fingerprint : null
      if (path !== null && storedFingerprint !== null) {
        let current
        try {
          current = await packageFingerprint(path)
        } catch {
          return failure('package-missing', `the package path ${path} is no longer readable; call toy_publish again`, { pending_id: token })
        }
        if (current !== storedFingerprint) {
          return failure(
            'package-changed',
            `the package at ${path} changed after the preview was created (the CLI re-packages on submit, so this would submit content the user never saw). Call toy_publish again and let the user check the new preview.`,
            { pending_id: token },
          )
        }
      }

      const previewUrl = preview.previewUrl ?? null
      // A create intent has no target id; an update always has one. The Host
      // service's `action` wins when it is present.
      const action = preview.action ?? (preview.targetId === undefined ? 'create' : 'update')
      const confirmation = await requireConfirmation(ctx, exec, {
        toolName: 'toy_submit',
        header: action === 'create' ? 'Submit new Toy for review' : 'Submit Toy update for review',
        question: previewUrl === null
          ? `${preview.summary} Submitting sends this change to review immediately.`
          : `${preview.summary} Submitting uploads the package and sends it to review.`,
        detail: previewUrl === null
          ? `Target: ${preview.targetId ?? 'new Toy'}${path === null ? '' : ` · Package: ${path}`}`
          : `Preview: ${previewUrl}`,
        confirmDescription: 'Uploads and enters the review queue.',
        cancelDescription: 'Keeps the prepared preview; nothing is sent.',
      })
      if (!confirmation.allowed) return confirmation.result

      previewedPackages.delete(token)
      const result = await service.submitPublish(token, owner)
      if (!result.ok) return fromOperationFailure(result, { stage: 'submit', preview_url: previewUrl })
      return {
        ok: true,
        submitted: true,
        id: result.id ?? preview.targetId ?? null,
        status: result.status ?? null,
        preview_url: result.previewUrl ?? previewUrl,
        action: result.action ?? action,
        note: 'submitted for review; it appears on the Toy page only after the review passes',
      }
    }),
  })

  register({
    name: 'toy_run',
    description: 'Read-only escape hatch for toy CLI commands that have no dedicated tool (e.g. ["video","list","<id>"], ["shared-storage","list"], ["whoami"]). Validated against the live `toy --help-json`: write commands, destructive commands, `login/logout/upgrade`, `history clear` and --yes are refused. Set help=true to read the CLI help-json for a command instead of running it.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        command: { type: 'array', items: { type: 'string' }, description: 'Argv after `toy`, e.g. ["video","list","42"].' },
        help: { type: 'boolean', description: 'Return `toy <command> --help-json` instead of running the command.' },
      },
      required: ['command'],
    },
    output: TOOL_OUTPUT,
    execute: safe(async (args, exec) => {
      const tokens = Array.isArray(args.command) ? args.command.map(String) : []
      if (tokens.length === 0) return failure('invalid-argument', 'command must be a non-empty array, e.g. ["mylist"]')
      const result = await service.runReadOnly(tokens, args.help === true, exec.signal)
      if (!result.ok) return fromOperationFailure(result)
      if (args.help === true) return { ok: true, help: result.help }
      return { ok: true, command: result.command, data: result.data }
    }),
  })
}

/**
 * A pending_id this session cannot use: report the same three kinds the tool
 * returned before the Host service owned the store (unknown / foreign /
 * expired -> unknown). `cancelPending` is the only non-submitting way to ask
 * the store who owns a token, and it cannot touch a live intent owned by the
 * caller because that case never reaches here.
 *
 * @param {any} service
 * @param {string} token
 * @param {string} owner
 */
async function describeMissingPending(service, token, owner) {
  const probed = await service.cancelPending(token, owner)
  if (probed.ok === false && probed.error?.kind === 'foreign-pending') {
    return failure('foreign-pending', 'this pending_id belongs to another session')
  }
  return failure('unknown-pending', 'unknown or already used pending_id; call toy_publish again')
}
