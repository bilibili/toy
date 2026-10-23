import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'

import { createToyService, registerLaunchTools, resolveConfig } from '../lib/index.js'
import { DEFAULT_PENDING_TTL_MS } from '../src/pending.js'

const FAKE_TOY = fileURLToPath(new URL('./fixtures/fake-toy.mjs', import.meta.url))
const SUBMIT_LABEL = 'Submit for review'
const CANCEL_LABEL = 'Not now'
const TOOL_NAMES = [
  'toy_account',
  'toy_history',
  'toy_list',
  'toy_precheck',
  'toy_publish',
  'toy_run',
  'toy_stats',
  'toy_submit',
]

const cleanup = []
after(async () => {
  for (const dir of cleanup) await rm(dir, { recursive: true, force: true })
})

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-toy-tools-'))
  cleanup.push(dir)
  return dir
}

/**
 * Build the model-facing tool surface exactly the way the plugin entry does:
 * one shared Host service plus `registerLaunchTools`, no `apply()` (which would
 * construct the real Cordis Remote service).
 *
 * @param {{ questions?: (request: any) => any, approval?: (request: any) => string, config?: Record<string, unknown> }} [options]
 */
function harness(options = {}) {
  const definitions = new Map()
  const asked = []
  const ctx = {
    tools: { register: definition => { definitions.set(definition.name, definition); return () => {} } },
    get(key) {
      if (key === 'userQuestions') {
        if (options.questions === undefined) return undefined
        return { ask: async request => { asked.push(request); return await options.questions(request) } }
      }
      if (key === 'approval') {
        if (options.approval === undefined) return undefined
        return { request: async request => await options.approval(request) }
      }
      return undefined
    },
    logger: { info() {}, warn() {} },
  }
  const config = resolveConfig({ binary: FAKE_TOY, ...(options.config ?? {}) })
  registerLaunchTools(ctx, createToyService(config, ctx.logger))
  const call = (name, args, exec = { agent: { id: 'agent-1' }, signal: undefined }) => {
    const definition = definitions.get(name)
    assert.ok(definition, `tool ${name} is registered`)
    return definition.execute(args, exec)
  }
  return { definitions, call, asked }
}

/** Answer the confirmation question with one of the offered labels. */
function answerWith(label) {
  return () => ({ answers: [{ id: 'confirm', selected: [label] }] })
}

async function goodPackage() {
  const dir = await tempDir()
  await writeFile(join(dir, 'index.html'), '<!doctype html><html><head><title>Toy</title></head><body><script src="./app.js"></script></body></html>')
  await writeFile(join(dir, 'app.js'), 'console.log(1)')
  return dir
}

async function badPackage() {
  const dir = await tempDir()
  await writeFile(join(dir, 'index.html'), '<html><head><title>x</title><script src="/assets/app.js"></script></head></html>')
  return dir
}

/** Tool calls need a log file so the tests can assert the argv the CLI saw. */
function withLog(config = {}) {
  return async () => {
    const dir = await tempDir()
    return { log: join(dir, 'argv.log'), config: { ...config, env: { FAKE_TOY_LOG: join(dir, 'argv.log') } } }
  }
}

async function readArgv(log) {
  try {
    return (await readFile(log, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line))
  } catch {
    return []
  }
}

test('registers the documented tools and nothing else', () => {
  const { definitions } = harness()
  assert.deepEqual([...definitions.keys()].sort(), TOOL_NAMES)
  for (const definition of definitions.values()) {
    assert.equal(typeof definition.description, 'string')
    assert.equal(definition.parameters.type, 'object')
  }
})

test('resolveConfig applies defaults and rejects nonsense', () => {
  assert.deepEqual(resolveConfig(undefined), {
    binary: '',
    timeoutMs: 60_000,
    uploadTimeoutMs: 600_000,
    loginTimeoutMs: 300_000,
    maxOutputBytes: 8 * 1024 * 1024,
    precheck: 'block',
    pendingTtlMs: DEFAULT_PENDING_TTL_MS,
    agentsHome: '',
    skillAgent: 'codex',
    skillTimeoutMs: 180_000,
    env: {},
  })
  const custom = resolveConfig({ precheck: 'nonsense', timeoutMs: -1, binary: '/x/toy', pendingTtlMs: 1000, env: { A: '1', B: 2 } })
  assert.equal(custom.precheck, 'block')
  assert.equal(custom.timeoutMs, 60_000)
  assert.equal(custom.binary, '/x/toy')
  assert.equal(custom.pendingTtlMs, 1000)
  assert.deepEqual(custom.env, { A: '1' })
})

test('toy_list normalizes mylist entries', async () => {
  const { call } = harness()
  const result = await call('toy_list', { page: 1, size: 2 })
  assert.equal(result.ok, true)
  assert.equal(result.total, 1)
  assert.equal(result.items[0].id, 42)
  assert.equal(result.items[0].title, 'demo')
  assert.equal(result.items[0].visibility, 'public')
  assert.equal(result.items[0].url, null)
})

test('toy_list keeps the structured login-expired kind from the service', async () => {
  const { call } = harness({ config: { env: { FAKE_TOY_ERROR: 'login' } } })
  const result = await call('toy_list', { page: 1, size: 2 })
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'login-expired')
  assert.match(result.error.hint, /toy_account action=login/)
})

test('toy_stats returns the CLI-shaped payload the model contract documents', async () => {
  const { call } = harness()
  const result = await call('toy_stats', { id: 42 })
  assert.equal(result.ok, true)
  assert.equal(result.id, 42)
  assert.deepEqual(result.data.items, [
    { date: '2026-10-20', pv: 3, uv: 2, retention_1d: 0.5 },
    { date: '2026-10-21', pv: 5, uv: 4 },
  ])
  assert.deepEqual(result.data.dyn_stat, { like: 1, favorite: 2, comment: 3, share: 4 })
})

test('toy_precheck reports blocking findings without uploading', async () => {
  const packageDir = await badPackage()
  const { call } = harness()
  const result = await call('toy_precheck', { path: packageDir })
  assert.equal(result.ok, false)
  assert.equal(result.errors, 1)
  assert.match(result.findings[0].message, /root-relative/)
})

test('toy_publish creates a preview via the CLI without --yes and returns a pending id', async () => {
  const packageDir = await goodPackage()
  const setup = withLog()
  const logDir = await setup()
  const { call } = harness({ config: logDir.config })
  const result = await call('toy_publish', { action: 'create', path: packageDir, title: 'Demo', slug: 'demo-toy' })
  assert.equal(result.ok, true)
  assert.equal(result.stage, 'preview')
  assert.match(result.preview_url, /preview/)
  assert.equal(typeof result.pending_id, 'string')
  const argv = await readArgv(logDir.log)
  assert.equal(argv.length, 1)
  assert.equal(argv[0][0], 'create')
  assert.equal(argv[0].includes('--yes'), false)
  assert.ok(argv[0].includes('--json'))
})

test('toy_publish refuses an upload when the precheck has errors', async () => {
  const packageDir = await badPackage()
  const logDir = await withLog()()
  const { call } = harness({ config: logDir.config })
  const result = await call('toy_publish', { action: 'create', path: packageDir })
  assert.equal(result.ok, false)
  assert.equal(result.stage, 'precheck')
  assert.equal(result.blocked, true)
  assert.ok(result.errors >= 1)
  assert.deepEqual(await readArgv(logDir.log), [])
})

test('precheck: warn uploads anyway, precheck: off skips the check', async () => {
  const packageDir = await badPackage()
  const warnedLog = await withLog()()
  const warned = harness({ config: { ...warnedLog.config, precheck: 'warn' } })
  const warnedResult = await warned.call('toy_publish', { action: 'create', path: packageDir })
  assert.equal(warnedResult.ok, true)
  assert.ok(warnedResult.precheck.errors >= 1)

  const offLog = await withLog()()
  const off = harness({ config: { ...offLog.config, precheck: 'off' } })
  const offResult = await off.call('toy_publish', { action: 'create', path: packageDir })
  assert.equal(offResult.ok, true)
  assert.equal(offResult.precheck, null)
})

test('toy_publish plans a metadata-only update without calling the CLI', async () => {
  const logDir = await withLog()()
  const { call } = harness({ config: logDir.config })
  const result = await call('toy_publish', { action: 'update', id: 42, title: 'Renamed', visibility: 'public' })
  assert.equal(result.ok, true)
  assert.equal(result.stage, 'planned')
  assert.equal(result.preview_url, null)
  assert.equal(typeof result.pending_id, 'string')
  assert.equal(result.precheck, null)
  // Only the best-effort target lookup may run; no create/update is sent.
  const argv = await readArgv(logDir.log)
  assert.equal(argv.some(entry => entry[0] === 'create' || entry[0] === 'update'), false)
})

test('toy_submit asks the user, then runs the exact prepared argv with --yes', async () => {
  const packageDir = await goodPackage()
  const logDir = await withLog()()
  const tool = harness({ config: logDir.config, questions: answerWith(SUBMIT_LABEL) })
  const prepared = await tool.call('toy_publish', { action: 'create', path: packageDir, title: 'Demo' })
  const submitted = await tool.call('toy_submit', { pending_id: prepared.pending_id })
  assert.equal(submitted.ok, true)
  assert.equal(submitted.submitted, true)
  assert.equal(submitted.status, 'reviewing')
  assert.equal(tool.asked.length, 1)
  assert.match(tool.asked[0].questions[0].question, /preview/i)
  assert.match(tool.asked[0].questions[0].detail, /https:\/\/www\.bilibili\.com\/toy\/preview/)
  const argv = await readArgv(logDir.log)
  assert.equal(argv.length, 2)
  assert.equal(argv[1].includes('--yes'), true)
  // The submitted argv must be the preview argv plus --yes, nothing else.
  assert.deepEqual(argv[1].filter(token => token !== '--yes'), argv[0])
})

test('a cancelled submit keeps the pending preview and sends nothing', async () => {
  const packageDir = await goodPackage()
  const logDir = await withLog()()
  let reply = CANCEL_LABEL
  const tool = harness({ config: logDir.config, questions: () => ({ answers: [{ id: 'confirm', selected: [reply] }] }) })
  const prepared = await tool.call('toy_publish', { action: 'create', path: packageDir })
  const cancelled = await tool.call('toy_submit', { pending_id: prepared.pending_id })
  assert.equal(cancelled.ok, false)
  assert.equal(cancelled.cancelled, true)
  assert.equal((await readArgv(logDir.log)).length, 1)
  // The user can still change their mind within the TTL.
  reply = SUBMIT_LABEL
  const submitted = await tool.call('toy_submit', { pending_id: prepared.pending_id })
  assert.equal(submitted.submitted, true)
  assert.equal((await readArgv(logDir.log)).length, 2)
})

test('a pending id cannot be submitted twice', async () => {
  const packageDir = await goodPackage()
  const tool = harness({ questions: answerWith(SUBMIT_LABEL) })
  const prepared = await tool.call('toy_publish', { action: 'create', path: packageDir })
  assert.equal((await tool.call('toy_submit', { pending_id: prepared.pending_id })).submitted, true)
  const again = await tool.call('toy_submit', { pending_id: prepared.pending_id })
  assert.equal(again.ok, false)
  assert.equal(again.error.kind, 'unknown-pending')
})

test('fails closed when no confirmation channel exists', async () => {
  const packageDir = await goodPackage()
  const tool = harness()
  const prepared = await tool.call('toy_publish', { action: 'create', path: packageDir })
  const result = await tool.call('toy_submit', { pending_id: prepared.pending_id })
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'confirmation-unavailable')
})

test('falls back to the approval seam when there is no question UI', async () => {
  const packageDir = await goodPackage()
  const approved = harness({ approval: () => 'allowed-once' })
  const prepared = await approved.call('toy_publish', { action: 'create', path: packageDir })
  assert.equal((await approved.call('toy_submit', { pending_id: prepared.pending_id })).submitted, true)

  const rejected = harness({ approval: () => 'rejected' })
  const second = await rejected.call('toy_publish', { action: 'create', path: packageDir })
  const result = await rejected.call('toy_submit', { pending_id: second.pending_id })
  assert.equal(result.cancelled, true)
})

test('a prepared intent belongs to the agent that prepared it', async () => {
  const packageDir = await goodPackage()
  const tool = harness({ questions: answerWith(SUBMIT_LABEL) })
  const prepared = await tool.call('toy_publish', { action: 'create', path: packageDir }, { agent: { id: 'agent-1' } })
  const foreign = await tool.call('toy_submit', { pending_id: prepared.pending_id }, { agent: { id: 'agent-2' } })
  assert.equal(foreign.ok, false)
  assert.equal(foreign.error.kind, 'foreign-pending')
  assert.equal(tool.asked.length, 0)
})

test('toy_history clear asks before deleting local history', async () => {
  const tool = harness({ questions: answerWith('Clear history') })
  const result = await tool.call('toy_history', { clear: true })
  assert.equal(result.ok, true)
  assert.equal(tool.asked.length, 1)
  assert.match(tool.asked[0].questions[0].question, /cannot be recovered/)
  assert.deepEqual(tool.asked[0].questions[0].options.map(option => option.label), ['Clear history', 'Cancel'])
})

test('toy_run refuses writes, --yes and destructive commands', async () => {
  const { call } = harness()
  const create = await call('toy_run', { command: ['create', '/tmp/x'] })
  assert.equal(create.error.kind, 'read-only-violation')
  assert.match(create.error.message, /writes online state/)
  const yes = await call('toy_run', { command: ['mylist', '--yes'] })
  assert.equal(yes.error.kind, 'read-only-violation')
  const clear = await call('toy_run', { command: ['history', 'clear'] })
  assert.equal(clear.error.kind, 'read-only-violation')
  const bind = await call('toy_run', { command: ['video', 'bind', 'BV1xx'] })
  assert.equal(bind.error.kind, 'read-only-violation')
})

test('toy_run allows read-only commands and help-json', async () => {
  const { call } = harness()
  const list = await call('toy_run', { command: ['video', 'list', '42'] })
  assert.equal(list.ok, true)
  assert.equal(list.command, 'video list 42')
  const help = await call('toy_run', { command: ['update'], help: true })
  assert.equal(help.ok, true)
  assert.equal(help.help.version, 'v0.6.4')
})

test('toy_run refuses an unknown flag with the allowed set', async () => {
  const { call } = harness()
  const result = await call('toy_run', { command: ['mylist', '--bogus', '1'] })
  assert.equal(result.error.kind, 'read-only-violation')
  assert.match(result.error.message, /unknown flag --bogus/)
})

test('toy_account reports status, logs in and out', async () => {
  const { call } = harness()
  const status = await call('toy_account', { action: 'status' })
  assert.equal(status.loggedIn, true)
  assert.deepEqual(status.user, { uid: 1, name: 'tester' })
  const login = await call('toy_account', { action: 'login', noOpen: true })
  assert.equal(login.ok, true)
  assert.match(login.output, /登录成功/)
  const logout = await call('toy_account', { action: 'logout' })
  assert.equal(logout.ok, true)
})

test('toy_account reports a login-expired status without failing the tool', async () => {
  const { call } = harness({ config: { env: { FAKE_TOY_ERROR: 'login' } } })
  const result = await call('toy_account', { action: 'status' })
  assert.equal(result.ok, true)
  assert.equal(result.loggedIn, false)
  assert.match(result.hint, /toy_account action=login/)
})

test('toy_stats validates its range arguments', async () => {
  const { call } = harness()
  assert.equal((await call('toy_stats', { id: 42, days: 3 })).ok, true)
  const conflict = await call('toy_stats', { id: 42, days: 3, start: '2026-10-01', end: '2026-10-02' })
  assert.equal(conflict.error.kind, 'invalid-argument')
  const halfRange = await call('toy_stats', { id: 42, start: '2026-10-01' })
  assert.equal(halfRange.error.kind, 'invalid-argument')
  const badDays = await call('toy_stats', { id: 42, days: 91 })
  assert.equal(badDays.error.kind, 'invalid-argument')
})

test('every registered tool renders its value as text', () => {
  const { definitions } = harness()
  for (const definition of definitions.values()) {
    const rendered = definition.output.render({}, { ok: true })
    assert.equal(rendered.length, 1)
    assert.equal(rendered[0].type, 'text')
    assert.match(rendered[0].text, /\{/)
  }
})

test('refuses to submit when the package changed after the preview', async () => {
  const packageDir = await goodPackage()
  const logDir = await withLog()()
  const tool = harness({ config: logDir.config, questions: answerWith(SUBMIT_LABEL) })
  const prepared = await tool.call('toy_publish', { action: 'create', path: packageDir })
  // The CLI re-packages on submit, so a changed file must force a re-preview.
  await writeFile(join(packageDir, 'app.js'), 'console.log("changed")')
  const refused = await tool.call('toy_submit', { pending_id: prepared.pending_id })
  assert.equal(refused.ok, false)
  assert.equal(refused.error.kind, 'package-changed')
  assert.equal((await readArgv(logDir.log)).length, 1)
  assert.equal(tool.asked.length, 0, 'the user is not asked to approve bytes they never saw')
})

test('toy_run cannot be tricked into a write subcommand with an interleaved flag', async () => {
  const { call } = harness()
  for (const command of [
    ['shared-storage', '--json', 'grant', '777', '526219402'],
    ['shared-storage', '--json', 'revoke', '777', '526219402'],
    ['shared-storage', '--json', 'create', 'save1'],
    ['shared-storage', '--json', 'delete', '777'],
    ['video', '--json', 'bind', 'BV1xx411c7QG'],
    ['video', '--json', 'unbind', 'BV1xx411c7QG'],
    ['history', '--json', 'clear'],
  ]) {
    const result = await call('toy_run', { command })
    assert.equal(result.error.kind, 'read-only-violation', command.join(' '))
  }
  // Canonical write paths are refused as well.
  assert.equal((await call('toy_run', { command: ['shared-storage', 'grant', '777', '526219402'] })).error.kind, 'read-only-violation')
  assert.equal((await call('toy_run', { command: ['video', 'bind', 'BV1xx411c7QG'] })).error.kind, 'read-only-violation')
  // Flags before the subcommand are refused even for reads.
  assert.equal((await call('toy_run', { command: ['video', '--json', 'list', '42'] })).error.kind, 'read-only-violation')
})

test('toy_run help does not smuggle --yes or an unknown path', async () => {
  const { call } = harness()
  const yes = await call('toy_run', { command: ['history', 'clear', '--yes'], help: true })
  assert.equal(yes.error.kind, 'read-only-violation')
  const bad = await call('toy_run', { command: ['nope'], help: true })
  assert.equal(bad.error.kind, 'read-only-violation')
})

test('toy_publish refuses a path that would be parsed as a flag', async () => {
  const logDir = await withLog()()
  const { call } = harness({ config: { ...logDir.config, precheck: 'off' } })
  const update = await call('toy_publish', { action: 'update', id: 42, path: '--yes', title: 'pwn' })
  assert.equal(update.error.kind, 'invalid-argument')
  assert.match(update.error.message, /must not start with "-"/)
  const create = await call('toy_publish', { action: 'create', path: '--yes' })
  assert.equal(create.error.kind, 'invalid-argument')
  assert.deepEqual(await readArgv(logDir.log), [])
})

test('toy_history refuses a path that would become the clear subcommand', async () => {
  const { call } = harness({ questions: answerWith(SUBMIT_LABEL) })
  const clearAsPath = await call('toy_history', { path: 'clear' })
  assert.equal(clearAsPath.error.kind, 'invalid-argument')
  const flagPath = await call('toy_history', { path: '--yes' })
  assert.equal(flagPath.error.kind, 'invalid-argument')
})

test('toy_history clear works through the approval seam too', async () => {
  const tool = harness({ approval: () => 'allowed-once' })
  const result = await tool.call('toy_history', { clear: true })
  assert.equal(result.ok, true)
  assert.equal(result.cleared, true)
})

test('help=true forwards only the command path, never write arguments', async () => {
  const { call } = harness()
  const write = await call('toy_run', { command: ['shared-storage', 'grant', '777', '526219402'], help: true })
  assert.equal(write.error.kind, 'read-only-violation')
  const bare = await call('toy_run', { command: ['shared-storage', 'grant'], help: true })
  assert.equal(bare.ok, true)
})
