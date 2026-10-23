# @bilibili/dsh-toy

A **Web UI** and a set of model tools for the Bilibili [Toy](https://www.bilibili.com/toy)
creator CLI ([`toy`](https://github.com/bilibili/toy)), inside dsh.

Open the **bilibili Toy** entry in the left sidebar: browse your Toys, read PV/UV
stats, run the local package precheck, prepare a publish and look at the preview
— and only then explicitly submit it for review. The same operations are
available to the model as `toy_*` tools, and both paths share one Host
implementation, so the safety rules cannot drift between them.

- **preview → explicit confirmation → submit** — preparing a publish only
  uploads a package to generate a preview link (or, for a metadata-only update,
  plans the change). Submitting re-runs exactly the prepared command with
  `--yes`, and only after the UI/tool has obtained an explicit human
  confirmation. The other `--yes` (destructive local history clear) asks the
  same way **and** needs a one-shot ticket issued by the Host after that
  confirmation, so a stray single call cannot wipe local history.
- **no upload while the local content precheck has errors** — root-relative
  assets, a missing entry `index.html`, an entry document over 1 MB and similar
  white-screen traps are reported before anything is uploaded.
- **submitting cannot send different bytes than the preview** — the package is
  content-fingerprinted **before** the preview upload; if it changes before
  submit, the submit is refused and the preview must be re-created.

## Requirements

1. **dsh** `0.2.1-rc.2` or newer in the `0.2.x` line (the package's
   `engines.dsh`; an incompatible runtime is rejected before the bundle loads).
2. **The `toy` binary** (v0.6.x). Install it on the host:

   ```sh
   # macOS / Linux
   curl -fsSL https://boss.hdslb.com/toy-cli/toy/install.sh | bash
   ```

   ```powershell
   # Windows (PowerShell)
   irm https://boss.hdslb.com/toy-cli/toy/install.ps1 | iex
   ```

   Resolution order: the `binary` config, then `toy` on `PATH`, then
   `~/.local/bin/toy` (macOS/Linux) or `%LOCALAPPDATA%\Programs\toy`
   (Windows).
3. **A logged-in session** (`toy login`). The panel's **登录** button starts the
   OAuth flow on the host (a browser window opens there); the model can call
   `toy_account action=login` instead. When any operation reports
   `login-expired`, log in and retry once — the bundle does not retry in a loop.
4. **Node.js 22.20+** only for `npx skills` installs and for building from
   source. The `toy` binary and the dsh runtime do not need it.

If the binary is missing, the panel replaces its tabs with an install card: the
one-line install command, a copy button, and **重新检测**. An explicit `binary`
config path is strict — a typo shows that error instead of silently falling back
to a different `toy` on `PATH`. The model tools report the same state as
`kind: "binary-missing"` with an install/`binary`-config hint.

## Install

A released tarball ships the built `lib/`:

```sh
# latest release
dsh plugin --profile web add https://github.com/bilibili/toy/releases/latest/download/bilibili-dsh-toy.tgz
# pinned version
dsh plugin --profile web add https://github.com/bilibili/toy/releases/download/dsh-plugin-v0.1.0/bilibili-dsh-toy-0.1.0.tgz
```

From a source checkout, build the workspace once, then link the package:

```sh
pnpm --dir dsh install
pnpm --dir dsh build
dsh plugin --profile web add /absolute/path/to/dsh/packages/toy
```

Updating a released install means running the same `dsh plugin --profile web add`
again with the new tarball URL (there is no auto-update channel); a source
checkout is updated by pulling and rebuilding, then restarting dsh.

The `toy` binary and its login are **per machine/user**, not per dsh profile.

## Web UI

The bundle registers a global panel (sidebar entry **bilibili Toy** + main column) and
the same component, compact, on its Plugins page card.

| Tab | What you can do |
|---|---|
| **My Toys** | Poster/title/slug/id/status/visibility cards, refresh, select a Toy |
| **Stats** | PV/UV bar chart, next-day retention, like/favorite/comment/share totals, 7/30/90-day windows |
| **Publish / Update** | create or update; package/poster/icon paths (history suggestions); title, slug (create only), category, visibility/password, theme, watermark, activity; local precheck with ERROR/WARN findings; **生成预览**; after the preview, an explicit "我已检查预览" step enables **提交审核** |
| **History** | local publish/update records; clear-all behind a two-step confirmation |

Account header: logged-in user, resolved binary, CLI version, login/logout.

The access password is sent only to the CLI: it is masked (`••••`) in every
wire payload, summary and confirmation dialog, so it never reaches the model
transcript or the page's DOM.

The browser talks to the Host over one generated Remote namespace
(`toyPublisher`); every call returns `{ ok, value }` / `{ ok:false, error }`.
Preparing a publish never submits; the submit button stays disabled until the
preview has been acknowledged (metadata-only updates show the planned changes
instead, with the same explicit gate).

## Skill (managed by the skills CLI)

The bundle does **not** ship its own copy of the toy skill. The skill is
installed and updated through the Vercel
[skills CLI](https://github.com/vercel-labs/skills), and DSH's filesystem
provider picks it up from the agents directory it already scans:

```sh
# user-global install: ~/.agents/skills/toy (DSH rank 500)
npx skills add bilibili/toy -a codex -g
# or per project: .agents/skills/toy (DSH rank 200)
npx skills add bilibili/toy -a codex

npx skills check     # what has updates
npx skills update    # pull them
```

- The skills CLI has no `dsh` target, so pick any agent whose install path is
  `.agents/skills/` or `~/.agents/skills/` (`codex`, `cline`, `cursor`,
  `gemini-cli`, …). `-a universal` only maps to `~/.config/agents/skills` for
  global installs, which DSH does not scan by default (point `agentsHome` /
  `$DSH_AGENTS_HOME` at it if you prefer that path).
- DSH watches the filesystem roots, so an update reaches the next catalog
  without restarting dsh.
- The CLI needs Node.js 22.20+; set `DISABLE_TELEMETRY=1` if you do not want its
  anonymous telemetry.

The panel's **Skill card** shows the installed version (the CLI's lock-file
hash), our content hash and the update time, and offers **安装 skill / 更新
skill**. It asks for confirmation, runs the fixed command above (no free-form
arguments), shows the command output and refreshes the card. The matching Host
configuration is `agentsHome`, `skillAgent` and `skillTimeoutMs`.

The skill is documentation (workflow + checklists). The preview gate and the
`--yes`/ticket rules are enforced in code and do not depend on the model reading it.

## Tools (model-facing)

| Tool | What it does | Writes? |
|---|---|---|
| `toy_account` | `status` / `login` / `logout` (server-side OAuth) | session only |
| `toy_list` | My Toys (`toy mylist`), normalized to id/title/slug/status/visibility/… | no |
| `toy_stats` | One Toy's PV/UV, retention and interaction stats | no |
| `toy_history` | Local publish/update history; `clear` asks first | local only |
| `toy_precheck` | Local package precheck (no network, no upload) | no |
| `toy_publish` | **Prepare** a create/update: path → upload once for a `preview_url`; metadata-only → planned, not sent | upload only |
| `toy_submit` | Confirm with the user, then run the prepared argv + `--yes` | **submits for review** |
| `toy_run` | Read-only passthrough validated against `toy --help-json` (e.g. `video list`, `shared-storage list`); flags must follow the full command path; `help: true` returns the CLI's help-json for the command path only | refused for writes |

Publish workflow the model is expected to follow:

```text
toy_publish(action=create|update, path=…, …)   → { preview_url, pending_id }
  ↓ show preview_url to the user; wait for them to look
toy_submit(pending_id=…)                       → asks the user in the UI
  ↓ only on an explicit "submit"
{ id, status: "reviewing" }
```

A pending id is one-shot, expires (`pendingTtlMs`, default 30 min) and belongs
to the session that prepared it. A cancelled confirmation keeps it usable, but
a drifted package invalidates it.

## What the precheck covers

Port of the Toy skill's `toy_doctor.py`. ERRORs are reserved for cases that
white-screen a page or a server/CLI hard reject; anything versioned or
heuristic is a WARN so the bundle never blocks a package the CLI would accept:

| Check | Severity |
|---|---|
| Package type/existence; readable ZIP | ERROR |
| Entry `index.html` (root, or exactly one first-level folder) | ERROR when missing/ambiguous |
| Entry `index.html` over 1 MB decompressed (ZIP: decompressed size) | ERROR |
| Root-relative `src`/`href`/`poster`/`data`/`srcset` and `url()` references | ERROR |
| Referenced local resource missing | ERROR |
| Root-relative JS navigation (`location = "/…"`) | ERROR |
| Slug (`[A-Za-z0-9_-]`, ≤64 bytes) | ERROR |
| Missing/unreadable/empty icon file | ERROR |
| Packaged PNG/JPEG with a side ≥10000 px (the CLI's own pre-upload check) | ERROR |
| Icon over 512 KB or 1024 px per side, or not PNG/JPEG by content | WARN |
| Poster content not PNG/JPEG, not 4:3, portrait | WARN |
| First-level-only entry `index.html`; ZIP members escaping the archive root | WARN |
| Missing `<title>`; framework source root uploaded; huge HTML document | WARN |
| Assets without content hashes; cloud-storage/leaderboard call shapes | WARN |

`ERROR` blocks an upload under the default `precheck: block`. `warn` uploads
anyway and reports; `off` skips the check (the CLI still enforces its own
limits). `node_modules`, dot-paths, `__MACOSX`, `.DS_Store` and the legacy
`toy.yaml` are excluded, matching the CLI's packaging.

## Configuration

Every field is optional; defaults are in `cordis.patch.yml` as comments.

| Field | Default | Meaning |
|---|---|---|
| `binary` | `''` | Path to `toy`; empty resolves PATH then `~/.local/bin/toy` |
| `timeoutMs` | `60000` | Read-only CLI calls |
| `uploadTimeoutMs` | `600000` | Package upload and submit |
| `loginTimeoutMs` | `300000` | Browser OAuth wait |
| `maxOutputBytes` | `8388608` | Captured stdout/stderr per call |
| `precheck` | `block` | `block` / `warn` / `off` |
| `pendingTtlMs` | `1800000` | Preview → submit window |
| `agentsHome` | `''` | Agents root to inspect/install into; empty = `$DSH_AGENTS_HOME` or `~/.agents` |
| `skillAgent` | `codex` | Agent name for `npx skills add`; its paths are `.agents/skills` |
| `skillTimeoutMs` | `180000` | Timeout for install/update |
| `env` | `{}` | Extra environment entries for the `toy` process |

The CLI process gets the ambient environment with harness credentials removed
(`DSH_*` and any `*_KEY`/`*_TOKEN`/`*_SECRET`/`*_PASSWORD` variables are not
forwarded); add anything it needs through `env`.

## Development

```sh
pnpm --dir dsh install   # workspace dependencies (build toolchain included)
pnpm --dir dsh check     # build + the node:test suite (fake toy binary)
```

Package-level scripts run from this directory once the workspace is installed:
`pnpm build` (tsdown host + typert artifacts + tsc declarations + client
bundle), `pnpm test` (build, then `node --test`), `pnpm typecheck`
(`tsc --noEmit`).

`lib/` is a build output and is not committed. The browser bundle
is a lazy-CJS factory (`window.__ModuleLoader__.load`) produced by
`tsdown.client.config.ts`; the Remote codecs come from the Typert generator via
`tsdown.config.ts`.

Boot a local instance against an isolated home:

```sh
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
DSH_HOME=/tmp/dsh-toy-dev "$DSH" plugin --profile web add "$PWD"
DSH_HOME=/tmp/dsh-toy-dev "$DSH" --profile web --no-open --port 0
```

## Known limitations

- **The package path must be a host path.** The browser cannot upload files
  from the page yet, so the wizard takes a directory/`.zip`/`.html` path on the
  machine running dsh (history suggestions help). Dragging a file in from the
  browser is future work.
- **Metadata-only updates have no preview URL.** The CLI itself has no preview
  for them; the confirmation shows the planned field changes.
- **Pending intents live in memory.** A dsh restart between preview and submit
  loses the token; prepare the publish again.
- **The page and the model cannot share a pending intent** (per-session owner).
- **Slug is immutable.** Updating rejects `slug`; changing the URL requires a
  delete + recreate, which this bundle does not do.
- **Not exposed:** `video bind/unbind` and shared-storage writes (they mutate
  online state outside the preview gate). Use `toy` directly for those;
  read-only variants are available through `toy_run`.
- **Precheck is not the final authority.** Upload size limits are
  account-dependent and are not enforced locally; the server/CLI decides.
- **Skill scope matters.** A project install (`.agents/skills`) ranks above the
  user-global one (`~/.agents/skills`); updating through the card targets the
  global scope, while `npx skills add` in a project installs the project copy.
- Confirmation ultimately depends on a human clicking the gate — an automated
  approval policy that auto-grants `toy_submit` would bypass the prompt, though
  the preview/package fingerprint rules still apply.

## License

MIT.
