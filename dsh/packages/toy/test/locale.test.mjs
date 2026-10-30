/**
 * The client locale source on its own: no React and no DOM, so the state
 * machine `useCopy` rides can be tested directly.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createLocaleSource, isChineseLocale } from '../src/client/locale.js'

/** A fake DSH `locale` service with a settable active tag. */
function fakeLocaleService(initial) {
  const listeners = new Set()
  let active = initial
  return {
    service: {
      getLocale: () => ({ active, locales: [], revision: 0 }),
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    listeners,
    switchTo(next) {
      active = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/** A client context whose `locale` service can be provided later. */
function fakeContext() {
  return { provided: undefined, get(key) { return key === 'locale' ? this.provided : undefined } }
}

test('maps locale tags to the copy language', () => {
  for (const tag of ['zh', 'zh-CN', 'zh-Hans', 'ZH']) assert.equal(isChineseLocale(tag), true)
  for (const tag of ['en', 'en-US', 'ja', '', undefined]) assert.equal(isChineseLocale(tag), false)
})

test('follows the active locale and notifies subscribers on a switch', () => {
  const source = createLocaleSource()
  const fake = fakeLocaleService('en')
  const context = fakeContext()
  context.provided = fake.service
  const dispose = source.bind(context)

  assert.equal(source.snapshot(), 'en')
  assert.equal(source.active(), 'en')

  let calls = 0
  const unsubscribe = source.subscribe(() => {
    calls += 1
  })
  fake.switchTo('zh')
  assert.equal(calls, 1)
  assert.equal(source.snapshot(), 'zh')

  unsubscribe()
  fake.switchTo('en')
  assert.equal(calls, 1)
  dispose()
})

test('a locale service registered after bind is picked up and subscribed', () => {
  const source = createLocaleSource()
  const context = fakeContext()
  const dispose = source.bind(context)
  assert.equal(source.snapshot(), '') // no service yet: the browser fallback applies

  const fake = fakeLocaleService('zh')
  context.provided = fake.service
  assert.equal(source.snapshot(), 'zh') // the next read resolves the late service

  let calls = 0
  source.subscribe(() => {
    calls += 1
  })
  fake.switchTo('en')
  assert.equal(calls, 1) // the late service is subscribed too
  dispose()
})

test('a replaced service instance is re-subscribed instead of pinned', () => {
  const source = createLocaleSource()
  const first = fakeLocaleService('zh')
  const second = fakeLocaleService('en')
  const context = fakeContext()
  context.provided = first.service
  const dispose = source.bind(context)
  assert.equal(source.snapshot(), 'zh')
  assert.equal(first.listeners.size, 1)

  let calls = 0
  source.subscribe(() => {
    calls += 1
  })

  context.provided = second.service
  assert.equal(source.snapshot(), 'en') // re-resolved on read
  assert.equal(first.listeners.size, 0) // the old instance is released
  assert.equal(second.listeners.size, 1)

  first.switchTo('zh') // a dead instance no longer drives the panel
  assert.equal(calls, 0)
  second.switchTo('zh')
  assert.equal(calls, 1)
  dispose()
})

test('disposing the binding stops following locale changes', () => {
  const source = createLocaleSource()
  const fake = fakeLocaleService('zh')
  const context = fakeContext()
  context.provided = fake.service
  const dispose = source.bind(context)

  let calls = 0
  source.subscribe(() => {
    calls += 1
  })
  dispose()
  assert.equal(fake.listeners.size, 0)
  fake.switchTo('en')
  assert.equal(calls, 0)
  assert.equal(source.snapshot(), '')
})
