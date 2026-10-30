import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  ToyCli,
  binaryCandidates,
  classifyFailure,
  execToy,
  flattenSchema,
  parseJsonOutput,
  resolveToyBinary,
} from '../src/cli.js'

const FAKE_TOY = fileURLToPath(new URL('./fixtures/fake-toy.mjs', import.meta.url))

function cli(extra = {}) {
  return new ToyCli({ binary: FAKE_TOY, timeoutMs: 5_000, ...extra })
}

test('parses one JSON document and rejects prose', () => {
  assert.deepEqual(parseJsonOutput('{"uid":1}'), { found: true, value: { uid: 1 } })
  assert.deepEqual(parseJsonOutput('null'), { found: true, value: null })
  assert.deepEqual(parseJsonOutput('true'), { found: true, value: true })
  assert.deepEqual(parseJsonOutput('false'), { found: true, value: false })
  assert.equal(parseJsonOutput('123').found, false)
  assert.equal(parseJsonOutput('登录成功\n').found, false)
  assert.equal(parseJsonOutput('').found, false)
})

test('classifies the failure modes the tools react to', () => {
  assert.equal(classifyFailure({ message: '登录态已失效，请执行 `toy login`', exitCode: 1, timedOut: false, killed: false }).kind, 'login-expired')
  assert.equal(classifyFailure({ message: 'error: 尚未登录，请先执行 toy login', exitCode: 1, timedOut: false, killed: false }).kind, 'login-expired')
  const business = classifyFailure({ message: 'status=500 code=307000 message=index.html 解压后超过 1MB 上限', exitCode: 1, timedOut: false, killed: false })
  assert.equal(business.kind, 'business')
  assert.equal(business.code, 307000)
  assert.equal(classifyFailure({ message: 'Error: unknown flag: --nope', exitCode: 1, timedOut: false, killed: false }).kind, 'usage')
  assert.equal(classifyFailure({ message: '该操作会直接提交审核；非交互环境请加 --yes', exitCode: 1, timedOut: false, killed: false }).kind, 'needs-yes')
  assert.equal(classifyFailure({ message: 'spawn toy ENOENT', exitCode: null, timedOut: false, killed: false, code: 'ENOENT' }).kind, 'binary-missing')
  assert.equal(classifyFailure({ message: 'kill', exitCode: null, timedOut: true, killed: true }).kind, 'timeout')
  assert.equal(classifyFailure({ message: 'out', exitCode: null, timedOut: false, killed: false, code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }).kind, 'output-limit')
  assert.equal(classifyFailure({ message: 'aborted', exitCode: null, timedOut: false, killed: false, aborted: true }).kind, 'aborted')
})

test('runs a JSON command and surfaces the parsed payload', async () => {
  const result = await cli().runJson(['whoami'])
  assert.equal(result.ok, true)
  assert.deepEqual(result.data, { uid: 1, name: 'tester' })
})

test('surfaces a login-expired failure with an actionable hint', async () => {
  const result = await cli({ env: { FAKE_TOY_ERROR: 'login' } }).runJson(['mylist'])
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'login-expired')
  assert.match(result.error.hint, /toy_account action=login/)
})

test('surfaces a business failure with its server code and message', async () => {
  const result = await cli({ env: { FAKE_TOY_ERROR: 'business' } }).runJson(['create', '/tmp/x'])
  assert.equal(result.error.kind, 'business')
  assert.equal(result.error.code, 307000)
  assert.match(result.error.message, /index\.html/)
})

test('reports a timeout instead of hanging', async () => {
  const result = await cli({ env: { FAKE_TOY_SLEEP: '5000' }, timeoutMs: 150 }).runJson(['mylist'])
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'timeout')
})

test('treats a text answer to a --json command as invalid output', async () => {
  const result = await cli({ env: { FAKE_TOY_ERROR: 'garbage' } }).runJson(['mylist'])
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'invalid-output')
})

test('accepts the JSON null an empty `toy history` returns', async () => {
  const result = await cli({ env: { FAKE_TOY_HISTORY_EMPTY: '1' } }).runJson(['history'])
  assert.equal(result.ok, true)
  assert.equal(result.data, null)
})

test('runs the human-facing login command without --json', async () => {
  const result = await cli().runText(['login'])
  assert.equal(result.ok, true)
  assert.match(result.text, /登录成功/)
})

test('caches the --help-json schema and flattens nested commands', async () => {
  const toy = cli()
  const schema = await toy.schema()
  assert.equal(schema.version, 'v0.6.4')
  assert.equal(schema.commands.has('video bind'), true)
  assert.equal(schema.commands.get('video bind').writes, true)
  const again = await toy.schema()
  assert.equal(again, schema)
})

test('resolves an explicitly configured binary', async () => {
  assert.equal(await resolveToyBinary(FAKE_TOY), FAKE_TOY)
})

test('an explicitly configured binary is strict and never falls back', async () => {
  await assert.rejects(
    () => resolveToyBinary('/tmp/definitely-not-a-toy-binary'),
    /configured at .* is not executable/,
  )
})

test('reports a missing binary when no candidate exists', async () => {
  const savedPath = process.env.PATH
  const savedHome = process.env.HOME
  try {
    process.env.PATH = ''
    process.env.HOME = '/tmp/definitely-missing-home-for-toy-test'
    await assert.rejects(() => resolveToyBinary(''), /not found/)
  } finally {
    process.env.PATH = savedPath
    process.env.HOME = savedHome
  }
})

test('a missing binary becomes a structured binary-missing result with install hint', async () => {
  const result = await new ToyCli({ binary: '/tmp/definitely-not-a-toy-binary' }).runJson(['mylist'])
  assert.equal(result.ok, false)
  assert.equal(result.error.kind, 'binary-missing')
  assert.match(result.error.hint, /not executable|install\.sh/)
})

test('flattenSchema tolerates an empty or malformed schema', () => {
  assert.deepEqual(flattenSchema(undefined), { version: null, commands: new Map(), globalFlags: [] })
  assert.deepEqual(flattenSchema({ commands: 'nope' }), { version: null, commands: new Map(), globalFlags: [] })
})

test('the child environment never receives harness credentials', () => {
  const previous = process.env.DEEPSEEK_API_KEY
  process.env.DEEPSEEK_API_KEY = 'sk-should-not-leak'
  try {
    const environment = new ToyCli({ binary: FAKE_TOY, env: { TOY_KEEP: 'yes' } }).environment()
    assert.equal(environment.DEEPSEEK_API_KEY, undefined)
    assert.equal(environment.TOY_KEEP, 'yes')
    assert.equal(typeof environment.HOME, 'string')
  } finally {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = previous
  }
})

test('binaryCandidates resolves POSIX and Windows locations', () => {
  const unix = binaryCandidates('darwin', { PATH: '/usr/bin:/opt/bin' }, '/Users/me')
  assert.deepEqual(unix, [
    join('/usr/bin', 'toy'),
    join('/opt/bin', 'toy'),
    join('/Users/me', '.local', 'bin', 'toy'),
  ])

  const win = binaryCandidates('win32', {
    PATH: 'C:\\bin;D:\\tools',
    LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
  }, 'C:\\Users\\me')
  assert.ok(win.includes(join('C:\\bin', 'toy.exe')))
  assert.ok(win.includes(join('C:\\bin', 'toy.cmd')))
  assert.ok(win.includes(join('C:\\Users\\me\\AppData\\Local', 'Programs', 'toy', 'toy.exe')))
  assert.equal(win.some(candidate => candidate.endsWith('toy')), false)
})
