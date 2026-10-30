/**
 * The shared Host service (`src/host/service.js`) on its own: both the model
 * tools and the Web page call it, so its normalization and safety invariants
 * are tested here independently of either caller.
 */

import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'

import { createToyService, resolveConfig } from '../lib/index.js'

const FAKE_TOY = fileURLToPath(new URL('./fixtures/fake-toy.mjs', import.meta.url))
const OWNER = 'agent-1'

const cleanup = []
after(async () => {
  for (const dir of cleanup) await rm(dir, { recursive: true, force: true })
})

async function tempDir(prefix = 'dsh-toy-service-') {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  cleanup.push(dir)
  return dir
}

/** The shared service, wired to the fake toy binary. */
function service(options = {}) {
  const config = resolveConfig({ binary: FAKE_TOY, ...(options.config ?? {}) })
  return createToyService(config, { info() {}, warn() {} })
}

async function logConfig(config = {}) {
  const dir = await tempDir()
  return {
    log: join(dir, 'argv.log'),
    config: { ...config, env: { ...(config.env ?? {}), FAKE_TOY_LOG: join(dir, 'argv.log') } },
  }
}

async function readArgv(log) {
  try {
    return (await readFile(log, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line))
  } catch {
    return []
  }
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

/** Assert a promise rejects with a structured `cliError` attached. */
async function rejectsCli(promise, kind) {
  await assert.rejects(promise, error => {
    assert.equal(error.cliError?.kind, kind)
    return true
  })
}

test('account reports the resolved binary, version and logged-in user', async () => {
  const view = await service().account()
  assert.equal(view.ok, true)
  assert.equal(view.loggedIn, true)
  assert.equal(view.binary, FAKE_TOY)
  assert.equal(view.version, 'v0.6.4')
  assert.deepEqual(view.user, { uid: 1, name: 'tester' })
})

test('cliUpdateCheck reports an up-to-date CLI', async () => {
  const view = await service().cliUpdateCheck()
  assert.equal(view.ok, true)
  assert.equal(view.current, 'v0.6.4')
  assert.equal(view.latest, 'v0.6.4')
  assert.equal(view.upToDate, true)
})

test('cliUpdateCheck parses a newer release', async () => {
  const view = await service({ config: { env: { FAKE_TOY_UPGRADE_LATEST: 'v0.6.5' } } }).cliUpdateCheck()
  assert.equal(view.ok, true)
  assert.equal(view.current, 'v0.6.4')
  assert.equal(view.latest, 'v0.6.5')
  assert.equal(view.upToDate, false)
})

test('cliUpdateCheck surfaces CLI failures', async () => {
  const view = await service({ config: { env: { FAKE_TOY_ERROR: 'crash' } } }).cliUpdateCheck()
  assert.equal(view.ok, false)
  assert.equal(view.upToDate, false)
  assert.match(view.error.message, /connection refused/)
})

test('upgradeCli runs toy upgrade and reports the version afterwards', async () => {
  const { log, config } = await logConfig({ env: { FAKE_TOY_VERSION: 'v0.6.5' } })
  const view = await service({ config }).upgradeCli()
  assert.equal(view.ok, true)
  assert.equal(view.version, 'v0.6.5')
  assert.match(view.output, /升级完成/)
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(calls[0], ['upgrade'])
  assert.deepEqual(calls[1], ['version'])
})

test('account reports a login miss without failing the operation', async () => {
  const view = await service({ config: { env: { FAKE_TOY_ERROR: 'login' } } }).account()
  assert.equal(view.ok, true)
  assert.equal(view.loggedIn, false)
  assert.match(view.hint, /登录|login/i)
})

test('login and logout return account views with the CLI output', async () => {
  const shared = service()
  const login = await shared.login(true)
  assert.equal(login.ok, true)
  assert.equal(login.loggedIn, true)
  assert.match(login.output, /登录成功/)
  const logout = await shared.logout()
  assert.equal(logout.ok, true)
  assert.equal(logout.loggedIn, false)
  assert.match(logout.output, /已登出/)
})

test('listToys normalizes the mylist page', async () => {
  const page = await service().listToys(2, 5)
  assert.equal(page.total, 1)
  // The fixture echoes pn=1/ps=20 regardless of the requested page.
  assert.equal(page.page, 1)
  assert.equal(page.size, 20)
  assert.equal(page.items.length, 1)
  const item = page.items[0]
  assert.equal(item.id, 42)
  assert.equal(item.title, 'demo')
  assert.equal(item.status, 'published')
  assert.equal(item.visibility, 'public')
})

test('listToys refuses an impossible page and preserves CLI error kinds', async () => {
  await assert.rejects(service().listToys(0, 20), /page must be >= 1/)
  await rejectsCli(service({ config: { env: { FAKE_TOY_ERROR: 'login' } } }).listToys(1, 20), 'login-expired')
  await rejectsCli(service({ config: { env: { FAKE_TOY_ERROR: 'business' } } }).listToys(1, 20), 'business')
})

test('stats normalizes days and interaction totals for each window', async () => {
  const setup = await logConfig()
  const shared = service({ config: setup.config })
  const days = await shared.stats(42, { days: 3 })
  assert.equal(days.id, 42)
  assert.deepEqual(days.items, [
    { date: '2026-10-20', pv: 3, uv: 2, retention: 0.5 },
    { date: '2026-10-21', pv: 5, uv: 4 },
  ])
  assert.deepEqual(days.dynStat, { like: 1, favorite: 2, comment: 3, share: 4 })
  const range = await shared.stats(42, { start: '2026-10-01', end: '2026-10-05' })
  assert.equal(range.id, 42)
  const argv = await readArgv(setup.log)
  assert.deepEqual(argv[0].slice(0, 4), ['stats', '42', '--days', '3'])
  assert.deepEqual(argv[1].slice(0, 6), ['stats', '42', '--start', '2026-10-01', '--end', '2026-10-05'])
  await assert.rejects(shared.stats(0, {}), /positive Toy id/)
  await assert.rejects(shared.stats(42, { days: 91 }), /between 1 and 90/)
})

test('history normalizes records and historyPaths deduplicates paths', async () => {
  const records = await service().history('')
  assert.deepEqual(records, [{ id: 42, title: 'demo', path: '/tmp/demo', action: 'create' }])
  assert.deepEqual(await service().historyPaths(), ['/tmp/demo'])
  await assert.rejects(service().history('clear'), /clear control/)
  await assert.rejects(service().history('--yes'), /must not start with "-"/)
})

test('an empty local history (`null` from the CLI) lists no records', async () => {
  const shared = service({ config: { env: { FAKE_TOY_HISTORY_EMPTY: '1' } } })
  assert.deepEqual(await shared.history(''), [])
  assert.deepEqual(await shared.historyPaths(), [])
})

test('precheck never uploads and reports blocking findings', async () => {
  const setup = await logConfig()
  const shared = service({ config: setup.config })
  const bad = await shared.precheck({ path: await badPackage() })
  assert.equal(bad.ok, false)
  assert.equal(bad.kind, 'dir')
  assert.equal(bad.errors, 1)
  assert.equal(bad.findings[0].severity, 'ERROR')
  assert.match(bad.findings[0].message, /root-relative/)
  const good = await shared.precheck({ path: await goodPackage() })
  assert.equal(good.ok, true)
  assert.equal(good.errors, 0)
  assert.equal(good.findings.some(finding => finding.severity === 'ERROR'), false)
  const missing = await shared.precheck({ path: join(await tempDir(), 'nope') })
  assert.equal(missing.ok, false)
  assert.match(missing.findings[0].message, /does not exist/)
  await assert.rejects(shared.precheck({ path: '' }), /path is required/)
  // Precheck is local: the CLI is never called.
  assert.deepEqual(await readArgv(setup.log), [])
})

test('clearHistory needs a one-shot ticket and passes --yes', async () => {
  const setup = await logConfig()
  const shared = service({ config: setup.config })
  // Without a ticket: refused before the CLI runs.
  const refused = await shared.clearHistory('not-a-ticket', 'owner')
  assert.equal(refused.ok, false)
  assert.equal(refused.error.kind, 'confirmation-required')
  assert.deepEqual(await readArgv(setup.log), [])
  // With a ticket: one CLI call, and the ticket is consumed.
  const ticket = await shared.prepareHistoryClear('owner')
  assert.equal(ticket.ok, true)
  const result = await shared.clearHistory(ticket.token, 'owner')
  assert.equal(result.ok, true)
  assert.equal(typeof result.output, 'string')
  const argv = await readArgv(setup.log)
  assert.equal(argv.length, 1)
  assert.deepEqual(argv[0].slice(0, 3), ['history', 'clear', '--yes'])
  const again = await shared.clearHistory(ticket.token, 'owner')
  assert.equal(again.ok, false)
})

test('preparePublish uploads a package once WITHOUT --yes and stores a pending intent', async () => {
  const setup = await logConfig()
  const shared = service({ config: setup.config })
  const packageDir = await goodPackage()
  const prepared = await shared.preparePublish({ action: 'create', path: packageDir, title: 'Demo', slug: 'demo-toy' }, OWNER)
  assert.equal(prepared.ok, true)
  assert.equal(prepared.stage, 'preview')
  assert.equal(typeof prepared.pendingId, 'string')
  assert.match(prepared.previewUrl, /preview/)
  assert.match(prepared.summary, /Nothing is submitted for review yet/)
  assert.equal(prepared.action, 'create')
  assert.equal(prepared.precheck.ok, true)
  assert.equal(Number.isNaN(Date.parse(prepared.expiresAt)), false)
  const argv = await readArgv(setup.log)
  assert.equal(argv.length, 1)
  assert.equal(argv[0][0], 'create')
  assert.equal(argv[0].includes('--yes'), false)
  // The pending preview can be read back but not consumed by inspecting it.
  const preview = await shared.inspectPending(prepared.pendingId, OWNER)
  assert.equal(preview.pendingId, prepared.pendingId)
  assert.equal(preview.action, 'create')
  assert.equal(preview.path, packageDir)
  assert.equal(preview.previewUrl, prepared.previewUrl)
  assert.equal(await shared.inspectPending(prepared.pendingId, 'someone-else'), null)
  assert.equal(await shared.inspectPending('missing', OWNER), null)
})

test('preparePublish plans a metadata-only update without calling the CLI write command', async () => {
  const setup = await logConfig()
  const shared = service({ config: setup.config })
  const prepared = await shared.preparePublish({ action: 'update', id: 42, title: 'Renamed', visibility: 'public' }, OWNER)
  assert.equal(prepared.ok, true)
  assert.equal(prepared.stage, 'planned')
  assert.equal(prepared.previewUrl, undefined)
  assert.equal(typeof prepared.pendingId, 'string')
  assert.equal(prepared.target.id, 42)
  assert.equal(prepared.target.title, 'demo')
  assert.deepEqual(prepared.changes, [
    { field: 'title', value: 'Renamed' },
    { field: 'visibility', value: 'public' },
  ])
  const argv = await readArgv(setup.log)
  assert.equal(argv.some(entry => entry[0] === 'create' || entry[0] === 'update'), false)
  assert.equal(argv.some(entry => entry[0] === 'mylist'), true)
})

test('preparePublish falls back to the bare id when the Toy is not in mylist', async () => {
  const prepared = await service().preparePublish({ action: 'update', id: 99, title: 'Renamed' }, OWNER)
  assert.equal(prepared.ok, true)
  assert.deepEqual(prepared.target, { id: 99 })
})

test('preparePublish rejects invalid intents before touching the CLI', async () => {
  const setup = await logConfig()
  const shared = service({ config: setup.config })
  const noPath = await shared.preparePublish({ action: 'create' }, OWNER)
  assert.equal(noPath.ok, false)
  assert.equal(noPath.error.kind, 'invalid-argument')
  const noId = await shared.preparePublish({ action: 'update', title: 'x' }, OWNER)
  assert.equal(noId.ok, false)
  assert.equal(noId.error.kind, 'invalid-argument')
  const flagPath = await shared.preparePublish({ action: 'create', path: '--yes' }, OWNER)
  assert.equal(flagPath.ok, false)
  assert.match(flagPath.error.message, /must not start with "-"/)
  assert.deepEqual(await readArgv(setup.log), [])
})

test('preparePublish blocks the upload while the precheck reports an ERROR', async () => {
  const setup = await logConfig()
  const shared = service({ config: setup.config })
  const prepared = await shared.preparePublish({ action: 'create', path: await badPackage() }, OWNER)
  assert.equal(prepared.ok, false)
  assert.equal(prepared.stage, 'blocked')
  assert.equal(prepared.error.kind, 'precheck-blocked')
  assert.ok(prepared.precheck.errors >= 1)
  assert.deepEqual(await readArgv(setup.log), [])
})

test('precheck: warn still previews and exposes the findings', async () => {
  const prepared = await service({ config: { precheck: 'warn' } }).preparePublish({ action: 'create', path: await badPackage() }, OWNER)
  assert.equal(prepared.ok, true)
  assert.equal(prepared.stage, 'preview')
  assert.ok(prepared.precheck.errors >= 1)
})

test('precheck: off skips the local check entirely', async () => {
  const prepared = await service({ config: { precheck: 'off' } }).preparePublish({ action: 'create', path: await badPackage() }, OWNER)
  assert.equal(prepared.ok, true)
  assert.equal(prepared.stage, 'preview')
  assert.equal(prepared.precheck, undefined)
})

test('submitPublish is the only place --yes is added, for the exact prepared argv', async () => {
  const setup = await logConfig()
  const shared = service({ config: setup.config })
  const prepared = await shared.preparePublish({ action: 'create', path: await goodPackage(), title: 'Demo' }, OWNER)
  const submitted = await shared.submitPublish(prepared.pendingId, OWNER)
  assert.equal(submitted.ok, true)
  assert.equal(submitted.submitted, true)
  assert.equal(submitted.id, 42)
  assert.equal(submitted.status, 'reviewing')
  assert.equal(submitted.action, 'create')
  assert.match(submitted.previewUrl, /toy\/demo/)
  const argv = await readArgv(setup.log)
  assert.equal(argv.length, 2)
  assert.equal(argv[0].includes('--yes'), false)
  assert.equal(argv[1].includes('--yes'), true)
  assert.deepEqual(argv[1].filter(token => token !== '--yes'), argv[0])
})

test('submitPublish submits a planned metadata update with --yes', async () => {
  const setup = await logConfig()
  const shared = service({ config: setup.config })
  const prepared = await shared.preparePublish({ action: 'update', id: 42, title: 'Renamed' }, OWNER)
  const submitted = await shared.submitPublish(prepared.pendingId, OWNER)
  assert.equal(submitted.ok, true)
  assert.equal(submitted.action, 'update')
  const argv = await readArgv(setup.log)
  assert.deepEqual(argv[1].slice(0, 3), ['update', '42', '--title'])
  assert.equal(argv[1].includes('--yes'), true)
})

test('a pending intent can only be submitted once', async () => {
  const shared = service()
  const prepared = await shared.preparePublish({ action: 'create', path: await goodPackage() }, OWNER)
  assert.equal((await shared.submitPublish(prepared.pendingId, OWNER)).ok, true)
  const again = await shared.submitPublish(prepared.pendingId, OWNER)
  assert.equal(again.ok, false)
  assert.equal(again.error.kind, 'unknown-pending')
})

test('unknown, foreign and expired pending intents fail closed', async () => {
  const shared = service()
  const unknown = await shared.submitPublish('not-a-token', OWNER)
  assert.equal(unknown.ok, false)
  assert.equal(unknown.error.kind, 'unknown-pending')

  const foreign = await shared.preparePublish({ action: 'create', path: await goodPackage() }, OWNER)
  const foreignResult = await shared.submitPublish(foreign.pendingId, 'agent-2')
  assert.equal(foreignResult.ok, false)
  assert.equal(foreignResult.error.kind, 'foreign-pending')

  // The pending store sweeps expired intents, so an expired token is reported
  // as unknown; either way it cannot submit.
  const expiring = service({ config: { pendingTtlMs: 40 } })
  const prepared = await expiring.preparePublish({ action: 'create', path: await goodPackage() }, OWNER)
  await new Promise(resolve => setTimeout(resolve, 80))
  const expired = await expiring.submitPublish(prepared.pendingId, OWNER)
  assert.equal(expired.ok, false)
  assert.equal(expired.error.kind, 'unknown-pending')
  assert.equal(await expiring.inspectPending(prepared.pendingId, OWNER), null)
})

test('cancelPending drops a live intent and refuses a foreign one', async () => {
  const shared = service()
  const prepared = await shared.preparePublish({ action: 'create', path: await goodPackage() }, OWNER)
  const foreign = await shared.cancelPending(prepared.pendingId, 'agent-2')
  assert.equal(foreign.ok, false)
  assert.equal(foreign.error.kind, 'foreign-pending')
  const cancelled = await shared.cancelPending(prepared.pendingId, OWNER)
  assert.equal(cancelled.ok, true)
  assert.equal((await shared.submitPublish(prepared.pendingId, OWNER)).error.kind, 'unknown-pending')
})

test('submitPublish refuses a package changed after the preview', async () => {
  const setup = await logConfig()
  const shared = service({ config: setup.config })
  const packageDir = await goodPackage()
  const prepared = await shared.preparePublish({ action: 'create', path: packageDir }, OWNER)
  await writeFile(join(packageDir, 'app.js'), 'console.log("changed")')
  const refused = await shared.submitPublish(prepared.pendingId, OWNER)
  assert.equal(refused.ok, false)
  assert.equal(refused.error.kind, 'package-changed')
  assert.equal((await readArgv(setup.log)).length, 1, 'nothing is uploaded when the package changed')
  // The intent is kept so the user can retry after restoring the package.
  assert.equal(await shared.inspectPending(prepared.pendingId, OWNER) !== null, true)
})

test('submitPublish refuses a package that disappeared after the preview', async () => {
  const shared = service()
  const packageDir = await goodPackage()
  const prepared = await shared.preparePublish({ action: 'create', path: packageDir }, OWNER)
  await rm(packageDir, { recursive: true, force: true })
  const refused = await shared.submitPublish(prepared.pendingId, OWNER)
  assert.equal(refused.ok, false)
  assert.equal(refused.error.kind, 'package-missing')
})

test('runReadOnly allows read commands and refuses every write shape', async () => {
  const setup = await logConfig()
  const shared = service({ config: setup.config })
  const list = await shared.runReadOnly(['video', 'list', '42'], false)
  assert.equal(list.ok, true)
  assert.equal(list.command, 'video list 42')

  const help = await shared.runReadOnly(['update'], true)
  assert.equal(help.ok, true)
  assert.equal(help.help.version, 'v0.6.4')

  const empty = await shared.runReadOnly([], false)
  assert.equal(empty.ok, false)
  assert.equal(empty.error.kind, 'invalid-argument')

  const denied = [
    ['create', '/tmp/x'],
    ['update', '42', '/tmp/x'],
    ['video', 'bind', 'BV1xx'],
    ['video', '--json', 'bind', 'BV1xx'],
    ['shared-storage', 'create', 'save1'],
    ['shared-storage', '--json', 'grant', '777', '526219402'],
    ['history', 'clear'],
    ['history', '--json', 'clear'],
    ['login'],
    ['logout'],
    ['upgrade'],
    ['mylist', '--yes'],
    ['mylist', '-n', '1'],
    ['mylist', '--bogus'],
    ['video', '--json', 'list', '42'],
    ['nope'],
  ]
  for (const command of denied) {
    const result = await shared.runReadOnly(command, false)
    assert.equal(result.ok, false, command.join(' ') || '(empty)')
    assert.equal(result.error.kind, 'read-only-violation', command.join(' '))
  }
  // help=true still refuses --yes and unknown command paths.
  assert.equal((await shared.runReadOnly(['history', 'clear', '--yes'], true)).ok, false)
  assert.equal((await shared.runReadOnly(['nope'], true)).ok, false)
  // Nothing above ran a write command: the log only holds the schema probes
  // and the two allowed read calls.
  const argv = await readArgv(setup.log)
  const helpProbes = argv.filter(entry => entry[0] === '--help-json' || (entry[0] === 'update' && entry[1] === '--help-json'))
  assert.equal(helpProbes.length >= 1, true)
  assert.deepEqual(argv.filter(entry => !helpProbes.includes(entry)), [['video', 'list', '42', '--json']])
})

test('the toy process never sees harness credentials or DSH_ variables', async () => {
  const dir = await tempDir()
  const probe = join(dir, 'env-probe.mjs')
  await writeFile(probe, `#!/usr/bin/env node
const argv = process.argv.slice(2)
if (argv.includes('--help-json')) {
  process.stdout.write(JSON.stringify({ version: 'v-probe', global_flags: [], commands: [{ path: ['whoami'] }] }) + '\\n')
  process.exit(0)
}
process.stdout.write(JSON.stringify({
  uid: 1,
  name: 'probe',
  env: {
    dsh: Object.keys(process.env).filter(key => key.startsWith('DSH_')),
    secrets: Object.keys(process.env).filter(key => /(?:KEY|PASSWORD|SECRET|TOKEN|CREDENTIAL)/i.test(key)),
    extra: process.env.FAKE_TOY_EXTRA ?? null,
    hasPath: (process.env.PATH ?? '') !== '',
  },
}) + '\\n')
`)
  await chmod(probe, 0o755)
  process.env.DSH_TEST_SECRET = 'must-not-leak'
  process.env.MY_API_TOKEN = 'must-not-leak'
  try {
    const shared = createToyService(resolveConfig({ binary: probe, env: { FAKE_TOY_EXTRA: 'yes' } }))
    const result = await shared.runReadOnly(['whoami'], false)
    assert.equal(result.ok, true)
    assert.deepEqual(result.data.env.dsh, [])
    assert.deepEqual(result.data.env.secrets, [])
    assert.equal(result.data.env.extra, 'yes')
    assert.equal(result.data.env.hasPath, true)
  } finally {
    delete process.env.DSH_TEST_SECRET
    delete process.env.MY_API_TOKEN
  }
  assert.equal((await stat(probe)).mode & 0o111, 0o111)
})

test('a missing CLI is reported as binary-missing with an install hint everywhere', async () => {
  const broken = createToyService(resolveConfig({ binary: '/tmp/definitely-not-a-toy-binary' }))
  const account = await broken.account()
  assert.equal(account.ok, false)
  assert.equal(account.loggedIn, false)
  assert.equal(account.error.kind, 'binary-missing')
  assert.match(account.error.hint, /install\.sh|binary/i)
  // Data calls surface the same kind through cliError so the model tools can act.
  await assert.rejects(() => broken.listToys(1, 2), error => error.cliError?.kind === 'binary-missing')
  const login = await broken.login(false)
  assert.equal(login.ok, false)
  assert.equal(login.error.kind, 'binary-missing')
})
