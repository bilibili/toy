/**
 * Prepared publish intents: the gap between "preview created" and "user said
 * submit".
 *
 * `toy_publish` never passes `--yes`; it stores the exact argv plus a summary
 * here and returns a one-time token. `toy_submit` only runs that stored argv,
 * so a submit cannot drift from what the user was shown, and the token cannot
 * be reused. Intents live in memory (a restart loses them — the agent just
 * re-prepares) and expire so a stale preview cannot be submitted much later.
 *
 * @module dsh-toy/pending
 */

import { randomUUID } from 'node:crypto'

/** Default preview -> submit window: 30 minutes. */
export const DEFAULT_PENDING_TTL_MS = 30 * 60 * 1000
/** Cap on live intents: each one can hold a server-side preview upload. */
export const MAX_PENDING_INTENTS = 20

/**
 * @typedef {object} PendingIntent
 * @property {string} token
 * @property {string} ownerId agent that prepared it, so another session cannot submit it
 * @property {readonly string[]} argv without `--yes`
 * @property {'create' | 'update'} action
 * @property {string | null} previewUrl
 * @property {string} summary
 * @property {number} createdAt
 * @property {number} expiresAt
 * @property {string | null} targetId
 * @property {string | null} title
 * @property {string | null} slug
 * @property {string | null} path package path, when the intent uploads something
 * @property {string | null} fingerprint package fingerprint at preview time
 */

/**
 * @typedef {object} PendingInput
 * @property {string} ownerId
 * @property {readonly string[]} argv
 * @property {'create' | 'update'} action
 * @property {string | null} [previewUrl]
 * @property {string} summary
 * @property {string | null} [targetId]
 * @property {string | null} [title]
 * @property {string | null} [slug]
 * @property {string | null} [path]
 * @property {string | null} [fingerprint]
 */

export class PendingStore {
  /**
   * @param {{ ttlMs?: number, now?: () => number }} [options]
   */
  constructor(options = {}) {
    this.ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : DEFAULT_PENDING_TTL_MS
    this.now = typeof options.now === 'function' ? options.now : Date.now
    /** @type {Map<string, PendingIntent>} */
    this.entries = new Map()
  }

  /**
   * @param {PendingInput} input
   * @returns {PendingIntent}
   */
  create(input) {
    this.sweep()
    const createdAt = this.now()
    const intent = {
      token: randomUUID(),
      ownerId: input.ownerId,
      argv: [...input.argv],
      action: input.action,
      previewUrl: input.previewUrl ?? null,
      summary: input.summary,
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      targetId: input.targetId ?? null,
      title: input.title ?? null,
      slug: input.slug ?? null,
      path: input.path ?? null,
      fingerprint: input.fingerprint ?? null,
    }
    // Cap live intents: each one may hold a server-side preview upload, and
    // the oldest is the least likely to still be under review.
    if (this.entries.size >= MAX_PENDING_INTENTS) {
      const oldest = [...this.entries.entries()].sort((left, right) => left[1].createdAt - right[1].createdAt)[0]
      if (oldest !== undefined) this.entries.delete(oldest[0])
    }
    this.entries.set(intent.token, intent)
    return intent
  }

  /**
   * Read without consuming (for diagnostics).
   * @param {string} token
   * @returns {PendingIntent | undefined}
   */
  peek(token) {
    this.sweep()
    return this.entries.get(token)
  }

  /**
   * Consume one intent. A token belongs to the agent that prepared it.
   * @param {string} token
   * @param {string} ownerId
   * @returns {{ intent: PendingIntent } | { error: string, kind: 'unknown' | 'expired' | 'foreign' }}
   */
  take(token, ownerId) {
    const intent = this.entries.get(token)
    if (intent === undefined) return { error: 'unknown or already used pending_id; call toy_publish again', kind: 'unknown' }
    if (intent.expiresAt <= this.now()) {
      this.entries.delete(token)
      return { error: 'this preview intent expired; prepare the publish again', kind: 'expired' }
    }
    if (intent.ownerId !== ownerId) {
      return { error: 'this pending_id belongs to another session', kind: 'foreign' }
    }
    this.entries.delete(token)
    return { intent }
  }

  /**
   * Drop one live intent the caller abandoned. Cancelling an already-gone or
   * foreign intent reports instead of consuming anything.
   * @param {string} token
   * @param {string} ownerId
   * @returns {{ ok: true, output: string } | { ok: false, error: { kind: string, message: string } }}
   */
  cancel(token, ownerId) {
    const intent = this.entries.get(token)
    if (intent === undefined) return { ok: true, output: 'intent already gone' }
    if (intent.ownerId !== ownerId) return { ok: false, error: { kind: 'foreign-pending', message: 'this pending intent belongs to another session' } }
    this.entries.delete(token)
    return { ok: true, output: 'cancelled' }
  }

  /** @returns {number} live intent count after sweeping expired ones */
  get size() {
    this.sweep()
    return this.entries.size
  }

  sweep() {
    const now = this.now()
    for (const [token, intent] of this.entries) {
      if (intent.expiresAt <= now) this.entries.delete(token)
    }
  }
}
