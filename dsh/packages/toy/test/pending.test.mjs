import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PendingStore } from '../src/pending.js'

test('creates and consumes an intent exactly once', () => {
  const store = new PendingStore()
  const intent = store.create({ ownerId: 'agent-1', argv: ['create', '/tmp/x', '--json'], action: 'create', summary: 's' })
  assert.equal(store.size, 1)
  const taken = store.take(intent.token, 'agent-1')
  assert.equal(taken.intent?.token, intent.token)
  assert.equal(store.size, 0)
  const again = store.take(intent.token, 'agent-1')
  assert.equal(again.kind, 'unknown')
})

test('an intent expires and cannot be submitted later', () => {
  let now = 1_000
  const store = new PendingStore({ ttlMs: 500, now: () => now })
  const intent = store.create({ ownerId: 'a', argv: [], action: 'create', summary: 's' })
  now = 1_600
  assert.equal(store.take(intent.token, 'a').kind, 'expired')
  assert.equal(store.size, 0)
})

test('one session cannot submit another session’s intent', () => {
  const store = new PendingStore()
  const intent = store.create({ ownerId: 'agent-1', argv: [], action: 'update', summary: 's' })
  const taken = store.take(intent.token, 'agent-2')
  assert.equal(taken.kind, 'foreign')
  // A foreign attempt must not consume it.
  assert.equal(store.take(intent.token, 'agent-1').intent?.token, intent.token)
})
