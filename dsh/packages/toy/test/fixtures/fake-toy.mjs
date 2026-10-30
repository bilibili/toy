#!/usr/bin/env node
/**
 * Fake `toy` binary for unit tests. It implements just enough of the contract
 * that src/cli.js consumes: `--json` output, preview vs submit, and the error
 * formats the classifier must recognize. Behavior is switched with fixture
 * environment variables so one fixture covers every path.
 */

import { appendFileSync } from 'node:fs'

const argv = process.argv.slice(2)
if (process.env.FAKE_TOY_LOG !== undefined) {
  appendFileSync(process.env.FAKE_TOY_LOG, `${JSON.stringify(argv)}\n`)
}
const json = argv.includes('--json')
const has = name => argv.includes(name)
const valueOf = name => argv.find(argument => argument.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const emitted = []

if (process.env.FAKE_TOY_SLEEP !== undefined) {
  await new Promise(resolve => setTimeout(resolve, Number(process.env.FAKE_TOY_SLEEP)))
}

if (process.env.FAKE_TOY_ERROR === 'login') {
  process.stderr.write('登录态已失效，请执行 `toy login`\n')
  process.exit(1)
}
if (process.env.FAKE_TOY_ERROR === 'business') {
  process.stderr.write('status=500 code=307000 message=index.html 解压后超过 1MB 上限，请拆分包内资源\n')
  process.exit(1)
}
if (process.env.FAKE_TOY_ERROR === 'usage') {
  process.stderr.write('Error: unknown flag: --nope\n')
  process.exit(1)
}
if (process.env.FAKE_TOY_ERROR === 'crash') {
  process.stderr.write('dial tcp: connection refused\n')
  process.exit(2)
}
if (process.env.FAKE_TOY_ERROR === 'garbage' && json) {
  process.stdout.write('<html>gateway error</html>\n')
  process.exit(0)
}

if (has('--help-json')) {
  process.stdout.write(`${JSON.stringify({
    schema_version: '1',
    name: 'toy',
    version: process.env.FAKE_TOY_VERSION ?? 'v0.6.4',
    global_flags: [{ name: 'json', type: 'bool', default: 'false' }],
    commands: [
      { path: ['create'], args: { min: 1, max: 1, names: ['path'] }, flags: [{ name: 'title', type: 'string' }], writes: true },
      { path: ['update'], args: { min: 0, max: 2, names: ['id', 'path'] }, flags: [{ name: 'title', type: 'string' }, { name: 'yes', type: 'bool' }], writes: true },
      { path: ['mylist'], flags: [{ name: 'page', type: 'int' }] },
      { path: ['stats'], args: { min: 0, max: 1, names: ['id'] }, flags: [{ name: 'days', type: 'int' }] },
      { path: ['history'], args: { min: 0, max: 1, names: ['path'] }, subcommands: [{ path: ['history', 'clear'], flags: [{ name: 'yes', type: 'bool' }] }] },
      { path: ['whoami'] },
      {
        path: ['video'],
        subcommands: [
          { path: ['video', 'list'], args: { min: 0, max: 1, names: ['toy-id'] } },
          { path: ['video', 'bind'], args: { min: 1, max: 1, names: ['video'] }, flags: [{ name: 'toy', type: 'int64' }], writes: true, annotations: { risk: 'prod-mutation' } },
          { path: ['video', 'unbind'], args: { min: 1, max: 1, names: ['video'] }, writes: true },
        ],
      },
      {
        path: ['shared-storage'],
        subcommands: [
          { path: ['shared-storage', 'list'] },
          { path: ['shared-storage', 'detail'], args: { min: 1, max: 1, names: ['storage-id'] } },
          { path: ['shared-storage', 'create'], args: { min: 1, max: 1, names: ['name'] }, writes: true },
          { path: ['shared-storage', 'grant'], args: { min: 2, max: -1, variadic: true }, writes: true, annotations: { risk: 'prod-mutation' } },
          { path: ['shared-storage', 'revoke'], args: { min: 2, max: 2 }, writes: true, annotations: { risk: 'prod-mutation' } },
          { path: ['shared-storage', 'delete'], args: { min: 1, max: 1 }, flags: [{ name: 'yes', type: 'bool' }], writes: true, annotations: { risk: 'destructive' } },
        ],
      },
    ],
  })}\n`)
  process.exit(0)
}

if (argv[0] === 'version') {
  process.stdout.write(`toy ${process.env.FAKE_TOY_VERSION ?? 'v0.6.4'} (commit fake, built fake)\n`)
  process.exit(0)
}
if (argv[0] === 'upgrade') {
  const latest = process.env.FAKE_TOY_UPGRADE_LATEST ?? 'v0.6.4'
  if (has('--check')) {
    process.stdout.write(`当前版本：v0.6.4\n最新版本：${latest}\n${latest === 'v0.6.4' ? '✓ 已是最新版本\n' : ''}`)
  } else {
    process.stdout.write('✓ 升级完成\n')
  }
  process.exit(0)
}
if (argv[0] === 'whoami') {
  process.stdout.write(`${JSON.stringify({ uid: 1, name: 'tester' })}\n`)
  process.exit(0)
}
if (argv[0] === 'mylist') {
  process.stdout.write(`${JSON.stringify({ total: 1, pn: 1, ps: 20, list: [{ id: 42, title: 'demo', status: 'published', visibility: 'PUBLIC' }] })}\n`)
  process.exit(0)
}
if (argv[0] === 'stats') {
  process.stdout.write(`${JSON.stringify({
    id: Number(argv[1] ?? 42),
    items: [
      { date: '2026-10-20', pv: 3, uv: 2, retention_1d: 0.5 },
      { date: '2026-10-21', pv: 5, uv: 4 },
    ],
    dyn_stat: { like: 1, favorite: 2, comment: 3, share: 4 },
  })}\n`)
  process.exit(0)
}
if (argv[0] === 'history') {
  if (process.env.FAKE_TOY_HISTORY_EMPTY === '1') {
    // The real CLI marshals a nil record list as the JSON literal `null`.
    process.stdout.write('null\n')
    process.exit(0)
  }
  process.stdout.write(`${JSON.stringify([{ id: 42, title: 'demo', path: '/tmp/demo', action: 'create' }])}\n`)
  process.exit(0)
}
if (argv[0] === 'video' && argv[1] === 'list') {
  process.stdout.write(`${JSON.stringify({ videos: [{ bvid: 'BV1xx411c7QG', title: 'demo' }] })}\n`)
  process.exit(0)
}
if (argv[0] === 'login') {
  process.stdout.write('浏览器已打开，请在浏览器中完成授权\n登录成功\n')
  process.exit(0)
}
if (argv[0] === 'logout') {
  process.stdout.write('已登出\n')
  process.exit(0)
}
if (argv[0] === 'create' || argv[0] === 'update') {
  if (has('--yes')) {
    process.stdout.write(`${JSON.stringify({ id: 42, status: 'reviewing', preview_url: 'https://www.bilibili.com/toy/demo/index.html' })}\n`)
    process.exit(0)
  }
  if (argv[0] === 'create' || argv.includes('--title') || argv.includes('--poster')) {
    // Real CLI never fabricates a preview for metadata-only updates; the
    // fixture mirrors that by only previewing when a package path is present.
    if (argv[0] === 'create' || argv[2] !== undefined) {
      process.stdout.write(`${JSON.stringify({ preview_url: 'https://www.bilibili.com/toy/preview/demo/index.html' })}\n`)
      process.exit(0)
    }
  }
  process.stderr.write('该操作会直接提交审核；非交互环境请加 --yes\n')
  process.exit(1)
}

process.stderr.write(`fake toy: unhandled argv ${JSON.stringify(argv)}\n`)
process.exit(3)

void emitted
