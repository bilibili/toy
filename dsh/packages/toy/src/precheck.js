/**
 * Local package precheck — the plugin-side port of the Toy skill's
 * `toy_doctor.py` (github.com/bilibili/toy), trimmed to the checks that matter
 * before an upload and cannot produce a false ERROR.
 *
 * A Toy page is served under `/toy/<slug>/`, so a package can upload cleanly
 * and still open as a white screen: root-relative asset paths, a missing
 * `index.html`, an entry document over the platform's 1 MB decompressed cap,
 * or a broken local reference. The precheck runs these locally so
 * `toy_publish` can refuse before uploading.
 *
 * ERROR means "the package is broken or the server will reject it" and blocks
 * an upload under the default `precheck: block` config. WARN is advice and
 * never blocks — a WARN must not turn a publishable package into a hard
 * failure.
 *
 * @module dsh-toy/precheck
 */

import { createHash } from 'node:crypto'
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { posix } from 'node:path'

import { imageDimensions } from './images.js'
import { readZipEntries, readZipEntry } from './zip.js'

/** Platform limit for the entry index.html, decompressed. */
export const MAX_ENTRY_INDEX_BYTES = 1024 * 1024
/** Above this a non-entry HTML document is slow, not broken. */
export const LARGE_DOC_BYTES = 12 * 1024 * 1024
/** Poster/icon formats the official guide accepts. */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])
/** Icon limits as validated by the CLI (`--help-json` usage text). */
export const ICON_MAX_BYTES = 512 * 1024
export const ICON_MAX_DIMENSION = 1024
/** 4:3 landscape cover, tolerance copied from toy_doctor.py. */
const COVER_RATIO = 4 / 3
const COVER_RATIO_TOLERANCE = 0.08
/** Server-side slug rule; never tighten it locally. */
const SLUG_RE = /^[A-Za-z0-9_-]+$/
const MAX_SLUG_BYTES = 64
/** Longer "paths" are regex false positives (JS string literals), not refs. */
const MAX_REF_LEN = 512
/** Never pull an unbounded document into memory for content checks. */
const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024

const ATTR_RE = /\b(?:src|href|poster|data)\s*=\s*(["'])([^"']+)\1/gi
const SRCSET_RE = /\bsrcset\s*=\s*(["'])([^"']+)\1/gi
const CSS_URL_RE = /url\(\s*(["']?)([^'")]+)\1\s*\)/gi
// `url()` is a CSS construct: scanning the whole HTML would match JavaScript
// such as `new URL(x)`. Only <style> blocks and style="" attributes are CSS.
const STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
const STYLE_ATTR_RE = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i
const SCRIPT_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/gi

const RATE_LIMITED_METHODS = [
  'getCloudStorage',
  'setCloudStorage',
  'removeCloudStorage',
  'submitScore',
  'getRankList',
  'getMyRank',
]
const RATE_LIMITED_CALL_RE = new RegExp(`\\.\\s*(?:${RATE_LIMITED_METHODS.join('|')})\\s*\\(`, 'g')
const RATE_LIMIT_ERROR_CODE = '307044'
const HIGH_FREQUENCY_RE = /\b(?:setInterval|requestAnimationFrame)\s*\(|\b(?:for|while)\s*\(|\.\s*(?:forEach|map)\s*\(|[["'](?:mousemove|pointermove|touchmove|scroll|wheel|drag|keydown|keypress)["']/g
const MAX_ENCLOSER_LOOKBEHIND = 200

/**
 * @typedef {'ERROR' | 'WARN'} Severity
 * @typedef {{ severity: Severity, file: string, message: string }} Finding
 * @typedef {{ name: string, size: number, text: boolean }} PackageFile
 * @typedef {{ kind: 'dir' | 'zip' | 'html', files: readonly PackageFile[], read: (name: string) => Promise<Buffer>, readHead: (name: string, bytes: number) => Promise<Buffer>, error?: string }} Package
 */

/** Collected findings for one precheck run. */
export class Report {
  constructor() {
    /** @type {Finding[]} */
    this.findings = []
  }

  /** @param {string} file @param {string} message */
  error(file, message) {
    this.findings.push({ severity: 'ERROR', file, message })
  }

  /** @param {string} file @param {string} message */
  warn(file, message) {
    this.findings.push({ severity: 'WARN', file, message })
  }

  get hasErrors() {
    return this.findings.some(finding => finding.severity === 'ERROR')
  }
}

/**
 * Package-specific exclusions: dot-paths, dependency/cache trees and the
 * legacy `toy.yaml` that is local metadata, never a page resource.
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isExcluded(relativePath) {
  const parts = relativePath.split('/').filter(Boolean)
  if (parts.length === 0) return true
  for (const part of parts) {
    if (part === '__MACOSX' || part === 'node_modules') return true
    if (part.startsWith('.')) return true
  }
  const last = parts[parts.length - 1]
  return last === '.DS_Store' || last === 'toy.yaml'
}

/**
 * @param {string} target absolute or user-supplied path
 * @returns {Promise<Package>}
 */
async function loadPackage(target) {
  let info
  try {
    info = await stat(target)
  } catch {
    return { kind: 'dir', files: [], error: `path does not exist: ${target}`, read: async () => { throw new Error('missing') }, readHead: async () => { throw new Error('missing') } }
  }

  if (info.isFile() && /\.zip$/i.test(target)) return await loadZip(target)
  if (info.isFile() && /\.html?$/i.test(target)) return await loadSingleHtml(target)
  if (info.isDirectory()) return await loadDirectory(target)
  return {
    kind: 'dir',
    files: [],
    error: 'path must be a directory, a .html file, or a .zip file',
    read: async () => { throw new Error('unsupported path') },
    readHead: async () => { throw new Error('unsupported path') },
  }
}

/** @param {string} target */
async function loadZip(target) {
  const archive = await readFile(target)
  /** @type {{ name: string, size: number }[]} */
  const files = []
  let entries
  let traversal = 0
  try {
    entries = readZipEntries(archive)
    traversal = entries.filter(entry => entry.rawName.replaceAll('\\', '/').split('/').includes('..')).length
  } catch (error) {
    return {
      kind: 'zip',
      files: [],
      error: error instanceof Error ? error.message : String(error),
      read: async () => { throw new Error('unreadable archive') },
      readHead: async () => { throw new Error('unreadable archive') },
    }
  }
  const byName = new Map()
  for (const entry of entries) {
    if (entry.directory || isExcluded(entry.name)) continue
    files.push({ name: entry.name, size: entry.size, text: false })
    byName.set(entry.name, entry)
  }
  const read = async name => {
    const entry = byName.get(name)
    if (entry === undefined) throw new Error(`ZIP member not found: ${name}`)
    return readZipEntry(archive, entries, name)
  }
  return {
    kind: 'zip',
    files,
    traversal,
    read,
    readHead: async (name, bytes) => (await read(name)).subarray(0, bytes),
  }
}

/** @param {string} target */
async function loadSingleHtml(target) {
  const info = await stat(target)
  const data = await readFile(target)
  // A single HTML file is published as the package root index.html: every
  // relative reference points outside the package, which is expected.
  return {
    kind: 'html',
    files: [{ name: 'index.html', size: info.size, text: true }],
    read: async () => data,
    readHead: async (_name, bytes) => data.subarray(0, bytes),
  }
}

/** @param {string} root */
async function loadDirectory(root) {
  /** @type {{ name: string, size: number }[]} */
  const files = []
  const absolute = new Map()
  const errors = []

  /** @param {string} dir @param {string} prefix */
  const walk = async (dir, prefix) => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      errors.push(`cannot read directory ${dir}: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    for (const entry of entries) {
      const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (isExcluded(relativePath)) continue
      const absolutePath = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const info = await stat(absolutePath)
        files.push({ name: relativePath, size: info.size, text: false })
        absolute.set(relativePath, absolutePath)
      } catch {
        errors.push(`cannot read ${relativePath}`)
      }
    }
  }
  await walk(root, '')

  const read = async name => {
    const absolutePath = absolute.get(name)
    if (absolutePath === undefined) throw new Error(`file not found: ${name}`)
    return readFile(absolutePath)
  }
  const readHead = async (name, bytes) => {
    const absolutePath = absolute.get(name)
    if (absolutePath === undefined) throw new Error(`file not found: ${name}`)
    const handle = await open(absolutePath, 'r')
    try {
      const head = Buffer.alloc(bytes)
      const { bytesRead } = await handle.read(head, 0, bytes, 0)
      return head.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
  }
  return { kind: 'dir', files, read, readHead, ...(errors.length > 0 ? { error: errors.join('; ') } : {}) }
}

/**
 * @param {readonly PackageFile[]} files
 * @param {RegExp} pattern
 * @returns {PackageFile[]}
 */
function selectFiles(files, pattern) {
  return files.filter(file => pattern.test(file.name)).sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Root `index.html` and first-level `<dir>/index.html`, the same entry rule the
 * platform uses. A root entry wins.
 * @param {readonly PackageFile[]} files
 */
export function indexCandidates(files) {
  const rootIndex = files.find(file => file.name.toLowerCase() === 'index.html')
  const firstLevel = files
    .filter(file => {
      const lower = file.name.toLowerCase()
      return lower.endsWith('/index.html') && lower.split('/').length === 2
    })
    .map(file => file.name)
    .sort()
  return { rootIndex: rootIndex?.name ?? null, firstLevel }
}

/**
 * The file the platform treats as the entry document, or null when ambiguous.
 * @param {readonly PackageFile[]} files
 */
export function entryIndex(files) {
  const { rootIndex, firstLevel } = indexCandidates(files)
  if (rootIndex !== null) return rootIndex
  return firstLevel.length === 1 ? firstLevel[0] : null
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isIgnoredUrl(url) {
  const trimmed = url.trim()
  if (trimmed === '') return true
  const lower = trimmed.toLowerCase()
  return trimmed.startsWith('#')
    || lower.startsWith('javascript:')
    || lower.startsWith('mailto:')
    || lower.startsWith('tel:')
    || lower.startsWith('data:')
    || lower.startsWith('blob:')
    || lower.startsWith('about:')
    || lower.startsWith('http://')
    || lower.startsWith('https://')
    || lower.startsWith('//')
    || trimmed.includes('{{')
    || trimmed.includes('${')
}

/**
 * @param {string} url
 * @returns {string}
 */
function decodeEntities(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&#38;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&#60;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&#62;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
}

/** @param {string} url @returns {string} */
function cleanRef(url) {
  const withoutHash = url.trim().split('#')[0].split('?')[0]
  try {
    return decodeURIComponent(withoutHash)
  } catch {
    return withoutHash
  }
}

/**
 * @param {string} fromFile
 * @param {string} url
 * @returns {string}
 */
function resolveRef(fromFile, url) {
  const base = posix.dirname(fromFile)
  const joined = base === '.' ? cleanRef(url) : posix.join(base, cleanRef(url))
  return posix.normalize(joined)
}

/**
 * @param {Report} report
 * @param {{ files: readonly PackageFile[], has: (name: string) => boolean }} pkg
 * @param {string} fromFile
 * @param {string} url raw attribute value
 * @param {string} [baseDir] resolved <base href> directory, relative to the package root
 */
function checkLocalRef(report, pkg, fromFile, url, baseDir = '') {
  const decoded = decodeEntities(url)
  if (isIgnoredUrl(decoded)) return
  if (decoded.length > MAX_REF_LEN) return
  if (decoded.startsWith('/')) {
    report.error(fromFile, `root-relative local resource is unsafe under /toy/<slug>/: ${decoded}`)
    return
  }
  const cleaned = cleanRef(decoded)
  // "." / "./" / "./sub/" resolve to the package root or a directory, not a
  // file the browser is expected to fetch; toy_doctor ignores them too.
  if (cleaned === '' || cleaned === '.' || cleaned.endsWith('/')) return
  const target = baseDir === ''
    ? resolveRef(fromFile, decoded)
    : posix.normalize(posix.join(baseDir, cleanRef(decoded)))
  if (target.startsWith('../')) {
    report.warn(fromFile, `resource points outside the package root: ${decoded}`)
    return
  }
  if (target === '' || target === '.') return
  if (!pkg.has(target)) {
    report.error(fromFile, `referenced local resource not found: ${decoded} -> ${target}`)
  }
}

/**
 * @param {Report} report
 * @param {string} rel
 * @param {string} text
 * @param {{ files: readonly PackageFile[], has: (name: string) => boolean }} pkg
 */
function checkHtml(report, pkg, rel, originalText) {
  // Comments are not markup: a commented-out <script src="/assets/app.js">
  // must not be reported as a broken root-relative reference.
  const text = originalText.replace(/<!--[\s\S]*?-->/g, '')
  // A <base href> changes how every relative reference in the document
  // resolves; without honoring it, a package based in sub/ would report false
  // missing-file errors.
  const baseMatch = text.match(/<base\b[^>]*\bhref\s*=\s*(["'])([^"']+)\1/i)
  let baseDir = ''
  if (baseMatch !== null && !isIgnoredUrl(decodeEntities(baseMatch[2])) && !decodeEntities(baseMatch[2]).trim().startsWith('/')) {
    const resolvedBase = posix.normalize(posix.join(posix.dirname(rel), cleanRef(decodeEntities(baseMatch[2]))))
    baseDir = resolvedBase === '.' ? '' : resolvedBase
  }
  if (!TITLE_RE.test(text)) {
    report.warn(rel, 'missing <title>; the Toy title cannot be inferred from the document')
  }
  for (const pattern of ['location.hash', 'history.pushState', 'history.replaceState']) {
    if (text.includes(pattern)) {
      report.warn(rel, `URL mutation may break Toy navigation or sharing: ${pattern}`)
    }
  }
  if (/(?:window\.)?location(?:\.href)?\s*=\s*["']\//.test(text)) {
    report.error(rel, 'root-relative JavaScript navigation found; use a full Toy URL or a relative path')
  }
  for (const match of text.matchAll(ATTR_RE)) checkLocalRef(report, pkg, rel, match[2], baseDir)
  for (const match of text.matchAll(SRCSET_RE)) {
    // A data: URI contains commas, and an unescaped comma inside a query string
    // also breaks candidate splitting: skip the whole attribute rather than
    // manufacture a bogus local reference.
    if (match[2].includes('data:') || (match[2].includes('?') && match[2].includes(','))) continue
    for (const candidate of match[2].split(',')) checkLocalRef(report, pkg, rel, candidate.trim().split(/\s+/)[0] ?? '', baseDir)
  }
  for (const match of text.matchAll(STYLE_BLOCK_RE)) {
    for (const url of match[1].matchAll(CSS_URL_RE)) checkLocalRef(report, pkg, rel, url[2], baseDir)
  }
  for (const match of text.matchAll(STYLE_ATTR_RE)) {
    for (const url of match[2].matchAll(CSS_URL_RE)) checkLocalRef(report, pkg, rel, url[2], baseDir)
  }
}

/**
 * Heuristic for the Toy SDK call shapes that burn a Toy's shared cloud-storage
 * and leaderboard quota. Deliberately WARN-only: a static match on minified
 * output is never proof.
 * @param {Report} report
 * @param {string} rel
 * @param {string} text
 * @returns {boolean} whether any rate-limited SDK call was seen
 */
function checkRateLimits(report, rel, text) {
  const calls = [...text.matchAll(RATE_LIMITED_CALL_RE)]
  if (calls.length === 0) return false
  const seen = new Set()
  for (const call of calls) {
    const method = call[0].replace(/^\.\s*/, '').replace(/\s*\($/, '')
    const before = text.slice(Math.max(0, call.index - MAX_ENCLOSER_LOOKBEHIND), call.index)
    HIGH_FREQUENCY_RE.lastIndex = 0
    const hot = HIGH_FREQUENCY_RE.test(before)
    const key = `${method}:${hot ? 'hot' : 'plain'}`
    if (hot && !seen.has(key)) {
      seen.add(key)
      report.warn(
        rel,
        `${method} appears inside a polling loop or high-frequency handler; cloud storage and leaderboard quota is shared by every player of one Toy, so persist at checkpoints (settle / level end / page hide) and back off on ${RATE_LIMIT_ERROR_CODE} instead of retrying immediately`,
      )
    }
  }
  return true
}

/**
 * @param {Report} report
 * @param {string | undefined} poster
 */
async function checkPoster(report, poster) {
  if (poster === undefined || poster === '') return
  const info = await statFile(poster)
  if (info === null) {
    report.error('poster', `poster file does not exist: ${poster}`)
    return
  }
  if (!IMAGE_EXTENSIONS.has(extensionOf(poster))) {
    report.warn('poster', 'the official guide supports poster formats .png, .jpg, .jpeg')
  }
  const dimensions = imageDimensions(info.data)
  if (dimensions === null) {
    report.warn('poster', 'could not read the poster as an image')
    return
  }
  if (dimensions.format !== 'png' && dimensions.format !== 'jpeg') {
    report.warn('poster', `poster content is ${dimensions.format}; the official guide expects PNG or JPEG`)
  }
  if (dimensions.width === null || dimensions.height === null) {
    report.warn('poster', 'could not read poster dimensions')
    return
  }
  const { width, height } = dimensions
  if (height <= 0) {
    report.error('poster', 'poster has an invalid height')
    return
  }
  if (height > width) report.warn('poster', `portrait poster may crop poorly in Toy cards: ${width}x${height}`)
  if (Math.abs(width / height - COVER_RATIO) > COVER_RATIO_TOLERANCE) {
    report.warn('poster', `a 4:3 landscape cover is preferred; found ${width}x${height}`)
  }
}

/**
 * @param {Report} report
 * @param {string | undefined} icon
 */
async function checkIcon(report, icon) {
  if (icon === undefined || icon === '') return
  const info = await statFile(icon)
  if (info === null) {
    report.error('icon', `icon file does not exist: ${icon}`)
    return
  }
  if (info.size === 0) {
    report.error('icon', 'the Toy icon file is empty')
    return
  }
  if (info.size > ICON_MAX_BYTES) {
    report.warn('icon', `icon is ${info.size} bytes; the CLI currently caps it at ${ICON_MAX_BYTES} bytes (512 KB)`)
  }
  const dimensions = imageDimensions(info.data)
  if (dimensions === null) {
    report.error('icon', 'the Toy icon must be a readable image (the CLI rejects unreadable files)')
    return
  }
  if (dimensions.format !== 'png' && dimensions.format !== 'jpeg') {
    report.warn('icon', `icon content is ${dimensions.format}; the CLI currently expects PNG or JPEG`)
    return
  }
  if (dimensions.width === null || dimensions.height === null) {
    report.warn('icon', 'could not read icon dimensions')
    return
  }
  if (dimensions.width > ICON_MAX_DIMENSION || dimensions.height > ICON_MAX_DIMENSION) {
    report.warn('icon', `icon is ${dimensions.width}x${dimensions.height}; the CLI currently caps each side at ${ICON_MAX_DIMENSION}px`)
  }
}

/** @param {string} file @returns {string} */
function extensionOf(file) {
  const index = file.lastIndexOf('.')
  return index < 0 ? '' : file.slice(index).toLowerCase()
}

/**
 * @param {string} file
 * @returns {Promise<{ size: number, data: Buffer } | null>}
 */
async function statFile(file) {
  try {
    const info = await stat(file)
    if (!info.isFile()) return null
    // Only headers matter, and a cover image can be several megabytes.
    const handle = await open(file, 'r')
    try {
      const head = Buffer.alloc(Math.min(info.size, 64 * 1024))
      await handle.read(head, 0, head.length, 0)
      return { size: info.size, data: head }
    } finally {
      await handle.close()
    }
  } catch {
    return null
  }
}

/**
 * @param {Report} report
 * @param {readonly PackageFile[]} files
 */
function checkInputs(report, files, { slug, requireRootIndex }) {
  if (slug !== undefined && slug !== '') {
    if (!SLUG_RE.test(slug)) report.error('slug', 'slug must match [A-Za-z0-9_-]')
    if (Buffer.byteLength(slug, 'utf8') > MAX_SLUG_BYTES) {
      report.error('slug', `slug must be at most ${MAX_SLUG_BYTES} bytes`)
    }
    if (slug.toLowerCase() !== slug) report.warn('slug', 'a lowercase hyphen-case slug is preferred for shareable Toy URLs')
  }

  const { rootIndex, firstLevel } = indexCandidates(files)
  if (rootIndex === null && requireRootIndex === true) {
    report.error(
      '.',
      firstLevel.length >= 1
        ? 'this upload requires index.html at the package root; pass that built folder or repack the archive'
        : 'missing root index.html',
    )
    return { entry: firstLevel.length === 1 ? firstLevel[0] : null }
  }
  if (rootIndex === null) {
    if (firstLevel.length === 1) {
      report.warn(
        '.',
        `index.html lives in the first-level folder ${firstLevel[0]}; pass that folder or repack it so the entry sits at the package root`,
      )
    } else if (firstLevel.length > 1) {
      report.error('.', 'multiple first-level index.html files found; choose one package root')
    } else {
      report.error('.', 'missing index.html at the package root or in a single first-level folder')
    }
  }
  return { entry: entryIndex(files) }
}

/**
 * Check a directory, `.zip` or single `.html` as a Toy package.
 * @param {string} target path to the package directory, `.zip` or `.html`
 * @param {{ poster?: string, icon?: string, slug?: string, requireRootIndex?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, kind: 'dir' | 'zip' | 'html' | 'error', findings: Finding[], errors: number, warnings: number }>}
 */
export async function precheck(target, options = {}) {
  const report = new Report()
  const pkg = await loadPackage(target)
  if (pkg.error !== undefined) {
    report.error(target, pkg.error)
    return summarize(report, pkg)
  }
  await checkPoster(report, options.poster)
  await checkIcon(report, options.icon)
  if (typeof pkg.traversal === 'number' && pkg.traversal > 0) {
    report.warn('.', `package contains ${pkg.traversal} ZIP entry name(s) escaping the archive root; repack it from the package directory`)
  }
  const { entry } = checkInputs(report, pkg.files, options)

  const names = new Set(pkg.files.map(file => file.name))
  const view = { files: pkg.files, has: name => names.has(name) }

  if (entry !== null) {
    const entryFile = pkg.files.find(file => file.name === entry)
    if (entryFile !== undefined && entryFile.size > MAX_ENTRY_INDEX_BYTES) {
      report.error(
        entry,
        `entry index.html is ${(entryFile.size / 1048576).toFixed(2)} MB (${entryFile.size} bytes) decompressed, over the 1 MB limit; create/update reject the package, so split inline scripts/styles/images into separate files`,
      )
    }
  }

  if (pkg.files.some(file => file.name === 'package.json')
    && pkg.files.some(file => /^(src|app|pages)\//.test(file.name))) {
    report.warn('.', 'package looks like a framework source root; upload the static build output such as dist/build instead')
  }

  for (const file of selectFiles(pkg.files, /\.html?$/i)) {
    if (file.name !== entry && file.size >= LARGE_DOC_BYTES) {
      report.warn(file.name, `HTML document is ${(file.size / 1048576).toFixed(1)} MB; a document this size is downloaded in full on every visit`)
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      report.warn(file.name, 'document is too large for the local content check; inspect it manually')
      continue
    }
    try {
      checkHtml(report, view, file.name, (await pkg.read(file.name)).toString('utf8'))
    } catch (error) {
      report.error(file.name, `failed to inspect HTML: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  for (const file of selectFiles(pkg.files, /\.css$/i)) {
    if (file.size > MAX_DOCUMENT_BYTES) continue
    try {
      const text = (await pkg.read(file.name)).toString('utf8')
      for (const match of text.matchAll(CSS_URL_RE)) checkLocalRef(report, view, file.name, match[2])
    } catch (error) {
      report.error(file.name, `failed to inspect CSS: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  await checkPackageImages(report, pkg)

  let usesRateLimits = false
  let handlesRateLimit = false
  for (const file of selectFiles(pkg.files, /\.(?:js|mjs|html?)$/i)) {
    if (file.size > MAX_DOCUMENT_BYTES) continue
    try {
      const text = (await pkg.read(file.name)).toString('utf8')
      const chunks = file.name.toLowerCase().endsWith('.js') || file.name.toLowerCase().endsWith('.mjs')
        ? [text]
        : [...text.matchAll(SCRIPT_RE)].map(match => match[1])
      for (const chunk of chunks) usesRateLimits = checkRateLimits(report, file.name, chunk) || usesRateLimits
      if (text.includes(RATE_LIMIT_ERROR_CODE)) handlesRateLimit = true
    } catch (error) {
      report.warn(file.name, `failed to inspect JavaScript: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (usesRateLimits && !handlesRateLimit) {
    report.warn('.', `cloud storage or leaderboard calls found but no reference to the rate-limit code ${RATE_LIMIT_ERROR_CODE}; distinguish that error and back off instead of retrying immediately`)
  }

  checkContentHash(report, pkg.files)
  return summarize(report, pkg)
}

/**
 * The CLI's own pre-upload check rejects any packaged image with a side of
 * 10000px or more, so catch it before the upload starts.
 * @param {Report} report
 * @param {Package} pkg
 */
async function checkPackageImages(report, pkg) {
  const images = pkg.files.filter(file => /\.(?:png|jpe?g|gif|webp)$/i.test(file.name))
  for (const file of images) {
    if (file.size > MAX_DOCUMENT_BYTES) continue
    try {
      const head = await pkg.readHead(file.name, 64 * 1024)
      const dimensions = imageDimensions(head)
      if (dimensions === null || dimensions.width === null || dimensions.height === null) continue
      if (dimensions.width < 10000 && dimensions.height < 10000) continue
      const message = `image is ${dimensions.width}x${dimensions.height}; the toy CLI rejects a package when any image side is 10000px or more`
      if (dimensions.format === 'png' || dimensions.format === 'jpeg') report.error(file.name, message)
      else report.warn(file.name, `${message} (could not verify whether the CLI decodes ${dimensions.format})`)
    } catch {
      // Unreadable members are already reported by the archive package loader.
    }
  }
}

/**
 * @param {Report} report
 * @param {readonly PackageFile[]} files
 */
function checkContentHash(report, files) {
  const assets = files.filter(file => /\.(?:js|css)$/i.test(file.name) && !/\.min\.(?:js|css)$/i.test(file.name))
  if (assets.length < 2) return
  const fingerprint = /[-._][A-Za-z0-9_-]*[0-9_-][A-Za-z0-9_-]*\.(?:js|css)$/i
  if (assets.some(file => fingerprint.test(posix.basename(file.name)))) return
  report.warn(
    '.',
    `${assets.length} JS/CSS assets have no content hash in their file names; without it every update makes visitors re-download all assets. Most bundlers can enable it (Vite by default; webpack output.filename '[name].[contenthash].js')`,
  )
}

/**
 * @param {Report} report
 * @param {Package} pkg
 */
function summarize(report, pkg) {
  const errors = report.findings.filter(finding => finding.severity === 'ERROR').length
  return {
    ok: errors === 0,
    kind: pkg.kind,
    findings: report.findings,
    errors,
    warnings: report.findings.length - errors,
  }
}

/**
 * Format a finding for humans.
 * @param {Finding} finding
 * @returns {string}
 */
export function formatFinding(finding) {
  return `${finding.severity}: ${finding.file}: ${finding.message}`
}

/**
 * Cheap package fingerprint: names + sizes + mtimes for a directory, size +
 * mtime + a header digest for a file. The CLI re-packages and re-uploads on
 * submit (it has no "confirm this preview id" flag), so comparing this at
 * submit time is how the plugin notices that the user would be submitting
 * something different from the preview they approved.
 * @param {string} target
 * @returns {Promise<string>}
 */
export async function packageFingerprint(target) {
  const info = await stat(target)
  const digest = createHash('sha256')
  /** Hash at most this much content; beyond it fall back to metadata (a
   * package that large is far outside the upload limits anyway). */
  const CONTENT_BUDGET = 256 * 1024 * 1024
  let budget = CONTENT_BUDGET
  const hashFile = async (absolutePath, relativePath) => {
    const fileInfo = await stat(absolutePath)
    digest.update(`${relativePath}\u0000`)
    if (fileInfo.size <= budget) {
      digest.update(await readFile(absolutePath))
      budget -= fileInfo.size
    } else {
      // Too large to hash fully: keep the metadata component (documented).
      digest.update(`size=${fileInfo.size}\u0000mtime=${fileInfo.mtimeMs}\u0000`)
    }
  }
  if (info.isDirectory()) {
    /** @type {string[]} */
    const names = []
    /** @type {Map<string, string>} */
    const absolute = new Map()
    const walk = async (dir, prefix) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`
        if (isExcluded(relativePath)) continue
        const absolutePath = `${dir}/${entry.name}`
        if (entry.isDirectory()) {
          await walk(absolutePath, relativePath)
        } else if (entry.isFile()) {
          names.push(relativePath)
          absolute.set(relativePath, absolutePath)
        }
      }
    }
    await walk(target, '')
    for (const name of names.sort()) await hashFile(absolute.get(name), name)
    return digest.digest('hex')
  }
  digest.update(`${info.size}\u0000${info.mtimeMs}\u0000`)
  if (info.size <= budget) digest.update(await readFile(target))
  return digest.digest('hex')
}
