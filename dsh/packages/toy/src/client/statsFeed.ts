/**
 * Shared per-Toy stats feed with a bounded-concurrency fan-out and an
 * account-scoped persistent cache. Home (14 days) and Data (7/30/90) reuse the
 * same request, and only missing Toys are fetched after a cache hit.
 *
 * The persistent layer is scoped to the current account, keeps only the 14-day
 * window (the 30/90-day views stay in memory), and is cleared on account
 * change/logout. A manual refresh starts a new request instead of reusing an
 * in-flight one.
 */

import { call } from './api.ts'
import type { ToyNamespace } from './api.ts'
import { mapLimit } from './overview.js'
import { sliceToyStats } from './statsAggregate.js'
import type { ToyStats, ToySummary } from '../shared/types.ts'

const CONCURRENCY = 6
/** Extra days fetched by the data overview so the home dashboard can reuse it. */
export const FEED_MIN_DAYS = 14
export const FEED_TTL_MS = 6 * 60 * 60 * 1000
export const DETAIL_TTL_MS = 6 * 60 * 60 * 1000
const FEED_WINDOWS: readonly number[] = [14, 30, 90]
/** Only this window is persisted: larger windows would blow the localStorage quota. */
const PERSIST_WINDOW = 14
/** Skip persistence when one window would exceed this (roughly 1.5 MB). */
const MAX_PERSIST_BYTES = 1_500_000

const FEED_PREFIX = 'dsh-toy-stats-feed-v1:'
const DETAIL_PREFIX = 'dsh-toy-stats-detail-v1:'

export type StatsByToy = ReadonlyMap<number, ToyStats | undefined>
export interface FeedProgress {
  readonly done: number
  readonly total: number
  readonly failed: number
}

interface CacheEntry {
  readonly at: number
  readonly data: StatsByToy
}
interface StoredFeed {
  readonly at: number
  readonly data: Record<string, ToyStats | null>
}
interface Job {
  readonly id: number
  readonly promise: Promise<StatsByToy>
}

/** localStorage namespace segment; changes when the signed-in account changes. */
let accountScope = 'anon'
let scopeVersion = 0
const cache = new Map<number, CacheEntry>()
const parsedFeeds = new Map<number, CacheEntry | undefined>()
const jobs = new Map<number, Job>()
const generation = new Map<number, number>()
let jobSeq = 0

function storage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function key(prefix: string, suffix: string): string {
  return `${prefix}${accountScope}:${suffix}`
}

function readJson(storageKey: string): unknown {
  try {
    const raw = storage()?.getItem(storageKey)
    return raw === undefined || raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

function writeJson(storageKey: string, value: unknown): void {
  try {
    const serialized = JSON.stringify(value)
    if (serialized.length > MAX_PERSIST_BYTES) return
    storage()?.setItem(storageKey, serialized)
  } catch {
    // Quota exceeded or storage disabled: the in-memory cache still works.
  }
}

function removeKey(storageKey: string): void {
  try {
    storage()?.removeItem(storageKey)
  } catch {
    // Ignore storage failures.
  }
}

/** Drop persisted entries that belong to one account scope only. */
function clearScope(scope: string): void {
  const store = storage()
  if (store === undefined) return
  for (const prefix of [FEED_PREFIX, DETAIL_PREFIX]) {
    const head = `${prefix}${scope}:`
    for (let index = store.length - 1; index >= 0; index -= 1) {
      const item = store.key(index)
      if (item !== null && item.startsWith(head)) store.removeItem(item)
    }
  }
}

/**
 * Scope the cache to an account uid. Only the previous account's persisted
 * entries are removed: an ``anon -> uid`` transition on a fresh panel mount
 * must keep that uid's cache so the first render can use it.
 */
export function setStatsAccount(uid: number | undefined): void {
  const next = uid === undefined || !Number.isFinite(uid) ? 'anon' : String(uid)
  if (next === accountScope) return
  const previous = accountScope
  accountScope = next
  scopeVersion += 1
  cache.clear()
  parsedFeeds.clear()
  jobs.clear()
  generation.clear()
  clearScope(previous)
}

function isFresh(at: number | undefined, ttl: number): at is number {
  return typeof at === 'number' && Number.isFinite(at) && Date.now() - at < ttl
}

function toMap(data: Record<string, ToyStats | null>): Map<number, ToyStats | undefined> {
  const map = new Map<number, ToyStats | undefined>()
  for (const [key, value] of Object.entries(data)) {
    const id = Number(key)
    if (Number.isFinite(id)) map.set(id, value ?? undefined)
  }
  return map
}

function toStored(map: StatsByToy): Record<string, ToyStats | null> {
  const data: Record<string, ToyStats | null> = {}
  for (const [id, value] of map) data[String(id)] = value ?? null
  return data
}

function persistedKey(windowDays: number): string {
  return key(FEED_PREFIX, String(windowDays))
}

function readPersistedFeed(windowDays: number): CacheEntry | undefined {
  if (parsedFeeds.has(windowDays)) return parsedFeeds.get(windowDays)
  const stored = readJson(persistedKey(windowDays)) as StoredFeed | undefined
  let entry: CacheEntry | undefined
  if (stored !== undefined && typeof stored.at === 'number' && stored.data !== undefined && isFresh(stored.at, FEED_TTL_MS)) {
    entry = { at: stored.at, data: toMap(stored.data) }
  } else if (stored !== undefined) {
    removeKey(persistedKey(windowDays))
  }
  parsedFeeds.set(windowDays, entry)
  return entry
}

function writePersistedFeed(windowDays: number, map: StatsByToy, at = Date.now()): void {
  if (windowDays !== PERSIST_WINDOW) return
  writeJson(persistedKey(windowDays), { at, data: toStored(map) } satisfies StoredFeed)
  parsedFeeds.delete(windowDays)
}

export function peekFeed(windowDays: number): StatsByToy | undefined {
  const memory = cache.get(windowDays)
  if (memory !== undefined && isFresh(memory.at, FEED_TTL_MS)) return memory.data
  return readPersistedFeed(windowDays)?.data
}

/** How old the freshest cached window is, or undefined without a cache. */
export function feedAge(windowDays: number): number | undefined {
  const memory = cache.get(windowDays)
  if (memory !== undefined && isFresh(memory.at, FEED_TTL_MS)) return Date.now() - memory.at
  const persisted = readPersistedFeed(windowDays)
  return persisted === undefined ? undefined : Date.now() - persisted.at
}

function readFeedToy(id: number, days: number): ToyStats | undefined {
  for (const windowDays of [...FEED_WINDOWS].sort((left, right) => left - right)) {
    if (windowDays < days) continue
    const data = peekFeed(windowDays)
    if (data === undefined) continue
    const entry = data.get(id)
    if (entry !== undefined) return sliceToyStats(entry, days)
  }
  return undefined
}

export function readToyStatsCache(id: number, days: number): ToyStats | undefined {
  const stored = readJson(key(DETAIL_PREFIX, `${days}:${id}`)) as { at?: number; stats?: ToyStats } | undefined
  if (stored !== undefined && typeof stored.at === 'number' && stored.stats !== undefined && isFresh(stored.at, DETAIL_TTL_MS)) {
    return stored.stats
  }
  return readFeedToy(id, days)
}

export function writeToyStatsCache(id: number, days: number, stats: ToyStats): void {
  writeJson(key(DETAIL_PREFIX, `${days}:${id}`), { at: Date.now(), stats })
}

function startJob(windowDays: number, promise: Promise<StatsByToy>): Promise<StatsByToy> {
  jobSeq += 1
  const id = jobSeq
  const wrapped = promise.finally(() => {
    if (jobs.get(windowDays)?.id === id) jobs.delete(windowDays)
  })
  jobs.set(windowDays, { id, promise: wrapped })
  return wrapped
}

/** A fresh base from memory/persisted; `force` drops both. */
function baseFor(windowDays: number, force: boolean): CacheEntry | undefined {
  if (force) {
    cache.delete(windowDays)
    parsedFeeds.delete(windowDays)
    removeKey(persistedKey(windowDays))
    jobs.delete(windowDays)
    return undefined
  }
  const memory = cache.get(windowDays)
  if (memory !== undefined && isFresh(memory.at, FEED_TTL_MS)) return memory
  return readPersistedFeed(windowDays)
}

export async function loadToyStats(
  ns: ToyNamespace,
  toys: readonly ToySummary[],
  windowDays: number,
  onProgress?: (progress: FeedProgress) => void,
  force = false,
  onToy?: (toy: ToySummary, stats: ToyStats | undefined) => void,
): Promise<StatsByToy> {
  if (!force) {
    const running = jobs.get(windowDays)
    if (running !== undefined) return running.promise
  }
  const myGeneration = (generation.get(windowDays) ?? 0) + 1
  generation.set(windowDays, myGeneration)
  const myScopeVersion = scopeVersion
  const base = baseFor(windowDays, force)
  if (base !== undefined) {
    const missing = toys.filter((toy) => !base.data.has(toy.id))
    if (missing.length === 0) return base.data
    const baseAt = base.at
    return startJob(
      windowDays,
      (async () => {
        const filled = await fill(ns, missing, windowDays, base.data.size, toys.length, onProgress, onToy)
        const merged = new Map(base.data)
        for (const [id, value] of filled) merged.set(id, value)
        if (generation.get(windowDays) === myGeneration && scopeVersion === myScopeVersion) {
          cache.set(windowDays, { at: Date.now(), data: merged })
          // Do not extend the freshness of the old entries with this partial fetch.
          writePersistedFeed(windowDays, merged, baseAt)
        }
        return merged
      })(),
    )
  }
  return startJob(
    windowDays,
    (async () => {
      const data = await fill(ns, toys, windowDays, 0, toys.length, onProgress, onToy)
      if (generation.get(windowDays) === myGeneration && scopeVersion === myScopeVersion) {
        cache.set(windowDays, { at: Date.now(), data })
        writePersistedFeed(windowDays, data)
      }
      return data
    })(),
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fill(
  ns: ToyNamespace,
  toys: readonly ToySummary[],
  windowDays: number,
  doneBefore: number,
  total: number,
  onProgress?: (progress: FeedProgress) => void,
  onToy?: (toy: ToySummary, stats: ToyStats | undefined) => void,
): Promise<Map<number, ToyStats | undefined>> {
  const data = new Map<number, ToyStats | undefined>()
  let failed = 0
  await mapLimit(
    toys,
    CONCURRENCY,
    async (toy) => {
      let value: ToyStats | undefined
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) await sleep(250 * attempt)
        const outcome = await call<ToyStats>('stats', () => ns.stats(toy.id, windowDays, '', ''))
        if (outcome.ok) {
          value = outcome.value
          break
        }
      }
      if (value === undefined) failed += 1
      data.set(toy.id, value)
      onToy?.(toy, value)
    },
    (done) => onProgress?.({ done: doneBefore + done, total, failed }),
  )
  return data
}
