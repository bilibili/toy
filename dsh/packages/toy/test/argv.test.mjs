import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildPublishIntent, describeIntent } from '../src/argv.js'

test('builds a create argv without --yes and with the package path first', () => {
  const { intent } = buildPublishIntent({
    action: 'create',
    path: '/tmp/game',
    title: 'My Game',
    slug: 'my-game',
    visibility: 'password',
    accessPassword: 'secret123',
    category: 'GAME',
    theme: 'light',
    watermark: true,
    activity: '',
  })
  assert.deepEqual(intent.argv, [
    'create',
    '/tmp/game',
    '--title', 'My Game',
    '--slug', 'my-game',
    '--category', 'GAME',
    '--visibility', 'password',
    '--access-password', 'secret123',
    '--theme', 'light',
    '--watermark',
    '--activity=',
    '--json',
  ])
  assert.equal(intent.argv.includes('--yes'), false)
  assert.equal(intent.hasPackage, true)
})

test('builds an update argv for a package and for metadata only', () => {
  const withPackage = buildPublishIntent({ action: 'update', id: 42, path: '/tmp/game', title: 'New' }).intent
  assert.deepEqual(withPackage.argv.slice(0, 4), ['update', '42', '/tmp/game', '--title'])
  assert.equal(withPackage.argv.includes('--yes'), false)

  const metadata = buildPublishIntent({ action: 'update', id: 42, title: 'New', watermark: false, activity: '' }).intent
  assert.deepEqual(metadata.argv, ['update', '42', '--title', 'New', '--watermark=false', '--activity=', '--json'])
  assert.equal(metadata.hasPackage, false)
})

test('refuses requests the CLI could not satisfy', () => {
  assert.match(buildPublishIntent({ action: 'create' }).error, /needs `path`/)
  assert.match(buildPublishIntent({ action: 'create', path: '/tmp/x', id: 1 }).error, /does not take an id/)
  assert.match(buildPublishIntent({ action: 'update' }).error, /positive integer `id`/)
  assert.match(buildPublishIntent({ action: 'update', id: 42 }).error, /at least one metadata change/)
  assert.match(buildPublishIntent({ action: 'update', id: 42, slug: 'new' }).error, /slug cannot be changed/)
  assert.match(buildPublishIntent({ action: 'create', path: '/tmp/x', visibility: 'password' }).error, /requires accessPassword/)
  assert.match(buildPublishIntent({ action: 'create', path: '/tmp/x', accessPassword: 'ab' }).error, /4-32 characters/)
  assert.match(buildPublishIntent({ action: 'create', path: '/tmp/x', category: 'BAD' }).error, /category must be one of/)
  assert.match(buildPublishIntent({ action: 'create', path: '/tmp/x', slug: 'bad slug' }).error, /slug must match/)
})

test('describes an intent for the confirmation prompt', () => {
  const create = buildPublishIntent({ action: 'create', path: '/tmp/game', title: 'G' }).intent
  assert.match(describeIntent(create, { target: { id: 42, title: 'demo' } }), /preview/)
  const metadata = buildPublishIntent({ action: 'update', id: 42, title: 'T' }).intent
  assert.match(describeIntent(metadata), /no preview link/)
})

test('never echoes the access password into changes or the summary', () => {
  const { intent } = buildPublishIntent({
    action: 'create',
    path: '/tmp/game',
    visibility: 'password',
    accessPassword: 'super-secret-123',
  })
  assert.equal(intent.argv.includes('super-secret-123'), true, 'the CLI still receives the real password')
  const wire = JSON.stringify({ changes: intent.changes, summary: describeIntent(intent) })
  assert.equal(wire.includes('super-secret-123'), false)
  assert.ok(intent.changes.some(change => change.field === 'access-password' && change.value === '••••'))
})
