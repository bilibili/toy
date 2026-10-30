/**
 * The `toy` CLI process boundary: resolve the binary, run an argv without a
 * shell, cap time and output, parse `--json`, and classify failures into
 * something a tool result can act on.
 *
 * Everything here is plain Node: the plugin is trusted host code, and the toy
 * binary talks to Bilibili over the network. The CLI is always invoked with an
 * argv array (never a shell string), so package paths and titles cannot turn
 * into shell syntax.
 *
 * @module dsh-toy/cli
 */

import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

export const DEFAULT_TIMEOUT_MS = 60_000
export const DEFAULT_UPLOAD_TIMEOUT_MS = 600_000
export const DEFAULT_LOGIN_TIMEOUT_MS = 300_000
export const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const SCHEMA_TTL_MS = 10 * 60 * 1000
const ANSI_RE = /\u001b\[[0-9;]*m/g

/**
 * @typedef {object} CliError
 * @property {'binary-missing' | 'timeout' | 'aborted' | 'output-limit' | 'login-expired' | 'business' | 'usage' | 'needs-yes' | 'invalid-output' | 'spawn' | 'cli'} kind
 * @property {string} message
 * @property {number} [code]
 * @property {string} [hint]
 */

/**
 * @typedef {object} CliResult
 * @property {boolean} ok
 * @property {number | null} exitCode
 * @property {unknown} data parsed JSON when available
 * @property {string} text raw stdout
 * @property {CliError | null} error
 */

/**
 * @param {string} text
 * @returns {string}
 */
function stripAnsi(text) {
  return text.replace(ANSI_RE, '')
}

/**
 * Parse a CLI stdout that should be one JSON document.
 * @param {string} text
 * @returns {{ found: boolean, value: unknown }}
 */
export function parseJsonOutput(text) {
  const trimmed = stripAnsi(text).trim()
  if (trimmed === '') return { found: false, value: undefined }
  // `null` is a JSON document: `toy history` prints it when there are no local
  // records, so it must not be mistaken for a text answer.
  if (trimmed === 'null') return { found: true, value: null }
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return { found: false, value: undefined }
  try {
    return { found: true, value: JSON.parse(trimmed) }
  } catch {
    // Some build channels print a human line before the JSON document; fall
    // back to the last line that parses on its own.
    const lines = trimmed.split('\n').map(line => line.trim()).filter(Boolean)
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]
      if (!line.startsWith('{') && !line.startsWith('[')) continue
      try {
        return { found: true, value: JSON.parse(line) }
      } catch {
        // keep looking
      }
    }
    return { found: false, value: undefined }
  }
}

/**
 * Classify a failed invocation.
 * @param {{ message: string, exitCode: number | null, timedOut: boolean, killed: boolean, aborted?: boolean, code?: string | null }} input
 * @returns {CliError}
 */
export function classifyFailure(input) {
  const raw = input.message.trim() || 'the toy CLI failed without a message'
  const message = raw.replace(/^error:\s*/i, '')
  if (input.aborted === true) {
    return { kind: 'aborted', message: 'the toy CLI call was cancelled' }
  }
  if (input.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return {
      kind: 'output-limit',
      message: 'the toy CLI produced more output than the plugin captures',
      hint: 'raise maxOutputBytes in the plugin config, or narrow the command',
    }
  }
  if (input.killed || input.timedOut) {
    return {
      kind: 'timeout',
      message: 'the toy CLI did not finish before the timeout',
      hint: 'large uploads can be slow; retry, and raise uploadTimeoutMs if it keeps happening',
    }
  }
  if (input.code === 'ENOENT') {
    return {
      kind: 'binary-missing',
      message: 'the toy CLI is not installed or not on PATH',
      hint: 'install it with: curl -fsSL https://boss.hdslb.com/toy-cli/toy/install.sh | bash — or set the `binary` config to its absolute path',
    }
  }
  if (/登录态已失效|尚未登录|请先执行\s*`?toy login`?|请执行\s*`?toy login`?/.test(message)) {
    return {
      kind: 'login-expired',
      message,
      hint: 'run toy_account action=login (opens the browser OAuth flow), then retry the original call once',
    }
  }
  const business = message.match(/status=(\d+)\s+code=(\d+)\s+message=(.*)/s)
  if (business !== null) {
    return { kind: 'business', code: Number(business[2]), message: business[3].trim() }
  }
  if (/unknown flag|accepts \d+ arg|required flag|unknown command|invalid argument/.test(message)) {
    return {
      kind: 'usage',
      message,
      hint: 'the local toy CLI may be older than this plugin expects; run `toy --help-json` or upgrade with `toy upgrade`',
    }
  }
  if (/非交互环境.*--yes|直接提交审核.*--yes/.test(message)) {
    return {
      kind: 'needs-yes',
      message,
      hint: 'this plugin submits only through toy_submit, after an explicit confirmation',
    }
  }
  return { kind: 'cli', message }
}

/**
 * Run a resolved binary with an argv array.
 * @param {string} binary
 * @param {readonly string[]} argv
 * @param {{ timeoutMs?: number, cwd?: string, env?: NodeJS.ProcessEnv, signal?: AbortSignal, maxOutputBytes?: number }} [options]
 * @returns {Promise<CliResult>}
 */
export async function execToy(binary, argv, options = {}) {
  const maxBuffer = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
  return await new Promise(resolve => {
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const child = execFile(
      binary,
      [...argv],
      {
        cwd: options.cwd,
        env: options.env ?? process.env,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer,
        signal: options.signal,
        windowsHide: true,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        const out = stdout ?? ''
        const errText = stripAnsi(stderr ?? '').trim()
        const outText = stripAnsi(out).trim()
        if (error === null || error === undefined) {
          const parsed = parseJsonOutput(out)
          finish({ ok: true, exitCode: 0, data: parsed.found ? parsed.value : undefined, text: outText, error: null })
          return
        }
        const killed = Boolean(error.killed)
        const timedOut = killed || error.code === 'ETIMEDOUT'
        // A non-envelope gateway failure can dump a whole HTML page (~6KB);
        // keep the tool result readable and never echo that back untrimmed.
        const message = (errText || outText || String(error.message ?? error)).slice(0, 2000)
        const failure = classifyFailure({
          message,
          exitCode: typeof error.code === 'number' ? error.code : null,
          timedOut,
          killed: killed && !/登录态已失效/.test(message),
          aborted: options.signal?.aborted === true && !/登录态已失效/.test(message),
          code: typeof error.code === 'string' ? error.code : null,
        })
        finish({
          ok: false,
          exitCode: typeof error.code === 'number' ? error.code : null,
          data: undefined,
          text: outText,
          error: failure,
        })
      },
    )
    child.on('error', error => {
      const failure = classifyFailure({
        message: String(error.message ?? error),
        exitCode: null,
        timedOut: false,
        killed: false,
        aborted: options.signal?.aborted === true,
        code: /** @type {{ code?: string }} */ (error).code ?? null,
      })
      finish({ ok: false, exitCode: null, data: undefined, text: '', error: failure })
    })
  })
}

/** Where to get the CLI; shared by the error hint, the README and the UI. */
export const INSTALL_URL = 'https://boss.hdslb.com/toy-cli/toy/install.sh'
export const INSTALL_COMMAND = `curl -fsSL ${INSTALL_URL} | bash`

/**
 * The hint shown wherever the binary cannot be found.
 * @param {string} [configured]
 * @returns {string}
 */
export function binaryMissingHint(configured = '') {
  if (configured !== '') {
    return `the configured \`binary\` path is not executable: ${configured}. Fix the path or clear it to use PATH / ~/.local/bin/toy`
  }
  return `install the toy CLI with: ${INSTALL_COMMAND} — it installs to ~/.local/bin/toy; then restart/refresh dsh`
}

/**
 * Find the toy binary: an explicit config path, then PATH, then the install
 * script's default location. An explicit config path is strict: a typo must
 * not silently fall back to a different binary.
 * @param {string} configured
 * @returns {Promise<string>}
 */
/** Candidate executables for a platform, in resolution order. */
export function binaryCandidates(platform = process.platform, env = process.env, home = homedir()) {
  const names = platform === 'win32' ? ['toy.exe', 'toy.cmd', 'toy.bat'] : ['toy']
  const separator = platform === 'win32' ? ';' : ':'
  const candidates = []
  for (const dir of (env.PATH ?? env.Path ?? '').split(separator)) {
    if (dir === '') continue
    for (const name of names) candidates.push(join(dir, name))
  }
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA
    if (typeof localAppData === 'string' && localAppData !== '') {
      candidates.push(join(localAppData, 'Programs', 'toy', 'toy.exe'))
    }
  } else {
    candidates.push(join(home, '.local', 'bin', 'toy'))
  }
  return candidates
}

export async function resolveToyBinary(configured = '') {
  if (configured !== '') {
    try {
      await access(configured, constants.X_OK)
      return configured
    } catch {
      throw new Error(`the toy CLI configured at \`binary\` is not executable: ${configured}`)
    }
  }
  for (const candidate of binaryCandidates()) {
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      // try the next candidate
    }
  }
  const where = process.platform === 'win32' ? 'PATH or %LOCALAPPDATA%\\Programs\\toy' : 'PATH or ~/.local/bin/toy'
  throw new Error(`the toy CLI was not found on ${where}. ${binaryMissingHint()}`)
}

/**
 * Flatten `toy --help-json` into path -> command records.
 * @param {unknown} schema
 * @returns {{ version: string | null, commands: Map<string, any>, globalFlags: any[] }}
 */
export function flattenSchema(schema) {
  /** @type {Map<string, any>} */
  const commands = new Map()
  const walk = nodes => {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      if (node === null || typeof node !== 'object') continue
      const path = Array.isArray(node.path) ? node.path.join(' ') : ''
      if (path !== '') commands.set(path, node)
      walk(node.subcommands)
    }
  }
  walk(schema?.commands)
  const version = typeof schema?.version === 'string' ? schema.version : null
  const globalFlags = Array.isArray(schema?.global_flags) ? schema.global_flags : []
  return { version, commands, globalFlags }
}

/**
 * The CLI boundary every tool shares.
 */
export class ToyCli {
  /**
   * @param {{ binary?: string, timeoutMs?: number, uploadTimeoutMs?: number, loginTimeoutMs?: number, maxOutputBytes?: number, env?: Record<string, string> }} config
   * @param {{ info?: (message: string) => void, warn?: (message: string) => void }} [logger]
   */
  constructor(config = {}, logger = {}) {
    this.config = config
    this.logger = logger
    /** @type {string | null} */
    this.binary = null
    /** @type {{ at: number, version: string | null, commands: Map<string, any> } | null} */
    this.schemaCache = null
  }

  /** @returns {Promise<string>} */
  async resolveBinary() {
    if (this.binary !== null) return this.binary
    this.binary = await resolveToyBinary(this.config.binary ?? '')
    return this.binary
  }

  /**
   * Environment for the toy process: the ambient environment minus harness
   * credentials. toy only needs HOME/PATH/proxy settings, and a plugin must not
   * hand DEEPSEEK_API_KEY or any *_TOKEN to a third-party binary.
   * @returns {NodeJS.ProcessEnv}
   */
  environment() {
    /** @type {NodeJS.ProcessEnv} */
    const scrubbed = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('DSH_')) continue
      if (/(?:KEY|PASSWORD|SECRET|TOKEN|CREDENTIAL)/i.test(key)) continue
      scrubbed[key] = value
    }
    return { ...scrubbed, ...(this.config.env ?? {}) }
  }

  /**
   * @param {readonly string[]} argv
   * @param {{ timeoutMs?: number, cwd?: string, signal?: AbortSignal, json?: boolean }} [options]
   * @returns {Promise<CliResult>}
   */
  async run(argv, options = {}) {
    let binary
    try {
      binary = await this.resolveBinary()
    } catch (error) {
      return {
        ok: false,
        exitCode: null,
        data: undefined,
        text: '',
        error: {
          kind: 'binary-missing',
          message: error instanceof Error ? error.message : String(error),
          hint: binaryMissingHint(this.config.binary ?? ''),
        },
      }
    }
    const wantsJson = options.json !== false
    const finalArgv = wantsJson && !argv.includes('--json') ? [...argv, '--json'] : [...argv]
    return await execToy(binary, finalArgv, {
      timeoutMs: options.timeoutMs ?? this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      cwd: options.cwd,
      env: this.environment(),
      signal: options.signal,
      maxOutputBytes: this.config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    })
  }

  /**
   * Run a command that must answer with JSON; a text answer is an error.
   * @param {readonly string[]} argv
   * @param {{ timeoutMs?: number, cwd?: string, signal?: AbortSignal }} [options]
   * @returns {Promise<CliResult>}
   */
  async runJson(argv, options = {}) {
    const result = await this.run(argv, options)
    if (!result.ok) return result
    if (result.data === undefined) {
      return {
        ...result,
        ok: false,
        error: {
          kind: 'invalid-output',
          message: `expected a JSON document from \`toy ${argv[0]}\`, got: ${result.text.slice(0, 200)}`,
          hint: 'run toy_account action=login if the CLI printed an HTML gateway page',
        },
      }
    }
    return result
  }

  /**
   * Run a human-facing command (login/logout/version) where JSON is not offered.
   * @param {readonly string[]} argv
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<CliResult>}
   */
  async runText(argv, options = {}) {
    return await this.run(argv, { ...options, json: false })
  }

  /**
   * `toy --help-json`, cached for a few minutes.
   * @param {{ force?: boolean, signal?: AbortSignal }} [options]
   */
  async schema(options = {}) {
    const now = Date.now()
    if (options.force !== true && this.schemaCache !== null && now - this.schemaCache.at < SCHEMA_TTL_MS) {
      return this.schemaCache
    }
    const result = await this.runJson(['--help-json'], { signal: options.signal })
    if (!result.ok) throw Object.assign(new Error(result.error?.message ?? 'toy --help-json failed'), { cliError: result.error })
    const flattened = flattenSchema(result.data)
    this.schemaCache = { at: now, ...flattened }
    return this.schemaCache
  }

  /**
   * Read-only account probe; never throws on a login miss.
   * @param {{ signal?: AbortSignal }} [options]
   */
  async whoami(options = {}) {
    return await this.runJson(['whoami'], { signal: options.signal })
  }
}
