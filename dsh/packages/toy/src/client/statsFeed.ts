/**
 * Shared per-Toy stats feed with a bounded-concurrency fan-out and a persistent
 * cache, so the home dashboard (14-day window) and the data overview (7/30/90)
 * do not hammer the CLI for the same numbers twice — and re-entering a view or
 * restarting DSH within the cache window shows the last data instantly.
 *
 * The cache is per browser profile (localStorage), keyed by window, and keeps
 * failed Toys as `undefined` for the same window. A manual refresh passes
 * `force` to bypass both layers.
 */

import { call } from './api.ts'
import type { ToyNamespace } from './api.ts'
import { mapLimit } from './overview.js'
import { sliceToyStats } from './statsAggregate.js'
import type { ToyStats, ToySummary } from '../shared/types.ts'

/** Requests in flight at once. */
const CONCURRENCY = 4
/** Extra days fetched by the data overview so the home dashboard can reuse it. */
export const FEED_MIN_DAYS = 14
/** How long a completed window is considered fresh. */
export const FEED_TTL_MS = 6 * 60 * 60 * 1000
/** How long one Toy's detail window is considered fresh. */
export const DETAIL_TTL_MS = 6 * 60 * 60 * 1000
/** Windows the persisted feed may hold (the overview presets plus the home window). */
const FEED_WINDOWS: readonly number[] = [14, 30, 90]

const FEED_PREFIX = 'dsh-toy-stats-feed-v1:'
const DETAIL_PREFIX = 'dsh-toy-stats-detail-v1:'

/** One Toy's stats by id; `undefined` marks a Toy whose stats could not be read. */
export type StatsByToy = ReadonlyMap<number, ToyStats | undefined>

/** Progress of a feed load. */
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
  /** `null` records a Toy whose stats could not be read. */
  readonly data: Record<string, ToyStats | null>
}

const cache = new Map<number, CacheEntry>()
const inflight = new Map<number, Promise<StatsByToy>>()

/** localStorage when it is usable (private windows/quota can throw). */
function storage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function readStored(key: string): unknown {
  try {
    const raw = storage()?.getItem(key)
    return raw === undefined || raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded or storage disabled: the in-memory cache still works.
  }
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

/** A persisted feed for one window, when one exists and is fresh. */
function readPersistedFeed(windowDays: number): CacheEntry | undefined {
  const stored = readStored(`${FEED_PREFIX}${windowDays}`) as StoredFeed | undefined
  if (stored === undefined || typeof stored.at !== 'number' || stored.data === undefined) return undefined
  // Expired windows are dropped so the next write does not keep stale topics.
  if (!isFresh(stored.at, FEED_TTL_MS)) {
    try {
      storage()?.removeItem(`${FEED_PREFIX}${windowDays}`)
    } catch {
      // Ignore storage failures.
    }
    return undefined
  }
  return { at: stored.at, data: toMap(stored.data) }
}

function writePersistedFeed(windowDays: number, map: StatsByToy): void {
  if (!FEED_WINDOWS.includes(windowDays)) return
  writeStored(`${FEED_PREFIX}${windowDays}`, { at: Date.now(), data: toStored(map) } satisfies StoredFeed)
}

/** A cached feed for a window, when one is already complete and fresh. */
export function peekFeed(windowDays: number): StatsByToy | undefined {
  const memory = cache.get(windowDays)
  if (memory !== undefined && isFresh(memory.at, FEED_TTL_MS)) return memory.data
  return readPersistedFeed(windowDays)?.data
}

/** One Toy's stats from a fresh feed that covers the requested window. */
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

/** One Toy's detail window from the persistent detail cache (or a covering feed). */
export function readToyStatsCache(id: number, days: number): ToyStats | undefined {
  const stored = readStored(`${DETAIL_PREFIX}${days}:${id}`) as { at?: number; stats?: ToyStats } | undefined
  if (stored !== undefined && typeof stored.at === 'number' && stored.stats !== undefined && isFresh(stored.at, DETAIL_TTL_MS)) {
    return stored.stats
  }
  return readFeedToy(id, days)
}

/** Remember one Toy's detail window for the next visit. */
export function writeToyStatsCache(id: number, days: number, stats: ToyStats): void {
  writeStored(`${DETAIL_PREFIX}${days}:${id}`, { at: Date.now(), stats })
}

/**
 * Load every Toy's stats for `windowDays`, reporting progress and tolerating
 * per-Toy failures (one retry each). Fresh entries — memory, persisted, or
 * covered by a wider persisted window — are reused and only missing Toys are
 * fetched; `force` ignores both layers and refetches everything.
 */
export async function loadToyStats(
  ns: ToyNamespace,
  toys: readonly ToySummary[],
  windowDays: number,
  onProgress?: (progress: FeedProgress) => void,
  force = false,
): Promise<StatsByToy> {
  if (force) {
    cache.delete(windowDays)
    try {
      storage()?.removeItem(`${FEED_PREFIX}${windowDays}`)
    } catch {
      // Ignore storage failures.
    }
  } else {
    const memory = cache.get(windowDays)
    const freshMemory = memory !== undefined && isFresh(memory.at, FEED_TTL_MS) ? memory : undefined
    const freshPersisted = readPersistedFeed(windowDays)
    const base = freshMemory?.data ?? freshPersisted?.data
    if (base !== undefined) {
      const missing = toys.filter((toy) => !base.has(toy.id))
      if (missing.length === 0) return base
      const baseMap = new Map(base)
      const filled = await fill(ns, missing, windowDays, baseMap.size, toys.length, onProgress)
      const merged = new Map(baseMap)
      for (const [id, value] of filled) merged.set(id, value)
      cache.set(windowDays, { at: Date.now(), data: merged })
      writePersistedFeed(windowDays, merged)
      return merged
    }
  }

  const running = inflight.get(windowDays)
  if (running !== undefined) return running

  const job = (async (): Promise<StatsByToy> => {
    const data = await fill(ns, toys, windowDays, 0, toys.length, onProgress)
    cache.set(windowDays, { at: Date.now(), data })
    writePersistedFeed(windowDays, data)
    inflight.delete(windowDays)
    return data
  })()
  inflight.set(windowDays, job)
  return job
}

/** Fetch a set of Toys, merging into a map that starts with `doneBefore` entries. */
async function fill(
  ns: ToyNamespace,
  toys: readonly ToySummary[],
  windowDays: number,
  doneBefore: number,
  total: number,
  onProgress?: (progress: FeedProgress) => void,
): Promise<Map<number, ToyStats | undefined>> {
  const data = new Map<number, ToyStats | undefined>()
  let failed = 0
  await mapLimit(
    toys,
    CONCURRENCY,
    async (toy) => {
      let value: ToyStats | undefined
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const outcome = await call<ToyStats>('stats', () => ns.stats(toy.id, windowDays, '', ''))
        if (outcome.ok) {
          value = outcome.value
          break
        }
      }
      if (value === undefined) failed += 1
      data.set(toy.id, value)
    },
    (done) => onProgress?.({ done: doneBefore + done, total, failed }),
  )
  return data
}
