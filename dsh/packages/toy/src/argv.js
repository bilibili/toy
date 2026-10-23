/**
 * Publish-intent validation and argv construction for `toy create` / `toy update`.
 *
 * The CLI is the source of truth for what a flag means; this module only
 * (a) refuses requests that can never be satisfied (missing id, no path and no
 * metadata change, a password tier without a password), and (b) turns the
 * request into an argv array the CLI accepts. `--yes` is never added here: it
 * is the submit step's job, after the user confirms.
 *
 * @module dsh-toy/argv
 */

/** Category enum from `toy create --help-json`. */
export const CATEGORIES = ['GAME', 'INTERACTIVE_PLAY', 'TOOL', 'TEST', 'GUIDE', 'COLLECTION', 'OTHER']
/** Visibility enum from `toy create --help-json`. */
export const VISIBILITIES = ['link-only', 'password', 'public']
/** Theme enum from `toy create --help-json`. */
export const THEMES = ['dark', 'light']
/** Server-side slug rule; keep in sync with the precheck. */
const SLUG_RE = /^[A-Za-z0-9_-]+$/
const MAX_SLUG_BYTES = 64
const PASSWORD_MIN = 4
const PASSWORD_MAX = 32

/**
 * @typedef {object} PublishInput
 * @property {'create' | 'update'} action
 * @property {number} [id] target Toy id, required for update
 * @property {string} [path] package directory, .zip or single .html
 * @property {string} [title]
 * @property {string} [slug] create only; a published slug cannot change
 * @property {string} [poster]
 * @property {string} [icon]
 * @property {string} [category]
 * @property {string} [visibility]
 * @property {string} [accessPassword]
 * @property {string} [theme]
 * @property {boolean} [watermark] update: undefined means "leave unchanged"
 * @property {string} [activity] update: '' explicitly cancels participation
 */

/**
 * @typedef {object} IntentChange
 * @property {string} field
 * @property {string | number | boolean} value
 */

/**
 * @typedef {object} PublishIntent
 * @property {readonly string[]} argv
 * @property {readonly IntentChange[]} changes
 * @property {boolean} hasPackage
 * @property {string | null} id
 * @property {string | null} path
 * @property {string | null} title
 * @property {string | null} slug
 */

/**
 * Reject a request the CLI would reject anyway, with a message that says what
 * to change instead of echoing cobra.
 * @param {PublishInput} input
 * @returns {{ error: string } | { intent: PublishIntent }}
 */
export function buildPublishIntent(input) {
  const action = input.action
  if (action !== 'create' && action !== 'update') {
    return { error: 'action must be "create" or "update"' }
  }

  /** @type {IntentChange[]} */
  const changes = []
  const argv = [action]
  const hasPackage = typeof input.path === 'string' && input.path !== ''

  if (hasPackage && /^[-\u0000]/.test(input.path)) {
    // A positional argument that starts with "-" is parsed by pflag as a flag;
    // a path of literally "--yes" would submit without the confirmation gate.
    return { error: 'path must not start with "-"; pass the real package path (a directory, .zip or .html file)' }
  }

  if (action === 'create') {
    if (!hasPackage) return { error: 'create needs `path` (a directory, .zip or .html file)' }
    if (input.id !== undefined) return { error: 'create does not take an id; use action "update" to change an existing Toy' }
    argv.push(input.path)
  } else {
    if (!Number.isInteger(input.id) || input.id <= 0) return { error: 'update needs a positive integer `id` (see toy_list)' }
    argv.push(String(input.id))
    if (hasPackage) argv.push(input.path)
  }

  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || input.title.trim() === '') return { error: 'title must be a non-empty string' }
  }
  if (input.slug !== undefined) {
    if (action === 'update') return { error: 'a published slug cannot be changed; keep the existing one' }
    if (!SLUG_RE.test(input.slug)) return { error: 'slug must match [A-Za-z0-9_-]' }
    if (Buffer.byteLength(input.slug, 'utf8') > MAX_SLUG_BYTES) return { error: `slug must be at most ${MAX_SLUG_BYTES} bytes` }
  }
  if (input.category !== undefined && !CATEGORIES.includes(input.category)) {
    return { error: `category must be one of ${CATEGORIES.join(', ')}` }
  }
  if (input.visibility !== undefined && !VISIBILITIES.includes(input.visibility)) {
    return { error: `visibility must be one of ${VISIBILITIES.join(', ')}` }
  }
  if (input.theme !== undefined && !THEMES.includes(input.theme)) {
    return { error: `theme must be one of ${THEMES.join(', ')}` }
  }
  if (input.accessPassword !== undefined) {
    const password = input.accessPassword
    if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return { error: `accessPassword must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters` }
    }
  }
  if (input.watermark !== undefined && typeof input.watermark !== 'boolean') {
    return { error: 'watermark must be a boolean (omit it on update to leave the current setting unchanged)' }
  }
  if (input.activity !== undefined && typeof input.activity !== 'string') {
    return { error: 'activity must be a string ("" cancels participation on update)' }
  }
  if (action === 'create' && input.visibility === 'password' && input.accessPassword === undefined) {
    return { error: 'visibility "password" requires accessPassword' }
  }
  if (action === 'update' && !hasPackage
    && input.title === undefined && input.poster === undefined && input.icon === undefined
    && input.category === undefined && input.visibility === undefined && input.accessPassword === undefined
    && input.theme === undefined && input.watermark === undefined && input.activity === undefined) {
    return { error: 'update without `path` needs at least one metadata change (title, poster, icon, category, visibility, accessPassword, theme, watermark, activity)' }
  }

  const stringFlag = (flag, value, display = value) => {
    if (value === undefined) return
    argv.push(`--${flag}`, value)
    changes.push({ field: flag, value: display })
  }

  if (hasPackage) changes.push({ field: 'package', value: input.path })
  stringFlag('title', input.title)
  stringFlag('slug', input.slug)
  stringFlag('poster', input.poster)
  stringFlag('icon', input.icon)
  stringFlag('category', input.category)
  stringFlag('visibility', input.visibility)
  // Never echo the secret into the wire payload, the UI, or a model transcript.
  stringFlag('access-password', input.accessPassword, '••••')
  stringFlag('theme', input.theme)

  if (input.watermark !== undefined) {
    if (input.watermark) {
      if (action === 'create') argv.push('--watermark')
      else argv.push('--watermark=true')
    } else if (action === 'update') {
      argv.push('--watermark=false')
    }
    if (action === 'update' || input.watermark) changes.push({ field: 'watermark', value: input.watermark })
  }

  if (input.activity !== undefined) {
    // The server keys participation on whether the form field exists, so an
    // explicit cancel must send an empty value.
    argv.push(`--activity=${input.activity}`)
    changes.push({ field: 'activity', value: input.activity })
  }

  argv.push('--json')

  return {
    intent: {
      argv,
      action,
      changes,
      hasPackage,
      id: action === 'update' ? String(input.id) : null,
      path: hasPackage ? input.path : null,
      title: input.title ?? null,
      slug: input.slug ?? null,
    },
  }
}

/**
 * A one-line human summary of a prepared intent.
 * @param {PublishIntent} intent
 * @param {{ target?: { id?: number | string, title?: string, url?: string } }} [context]
 * @returns {string}
 */
export function describeIntent(intent, context = {}) {
  const target = context.target
  const targetText = target?.id !== undefined
    ? `Toy ${target.id}${target.title !== undefined ? ` (${target.title})` : ''}`
    : intent.id !== null ? `Toy ${intent.id}` : 'a new Toy'
  if (intent.hasPackage) {
    return `Upload the package at ${intent.path} and create a preview for ${targetText}. Nothing is submitted for review yet.`
  }
  const fields = intent.changes.map(change => `${change.field}=${String(change.value)}`).join(', ')
  return `Submit review for ${targetText} with metadata changes: ${fields}. Metadata-only updates have no preview link; the next step submits immediately after your confirmation.`
}
