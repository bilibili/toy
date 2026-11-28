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
- **no upload while the local content precheck reports an error** — common
  white-screen traps are checked before anything is uploaded.
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
dsh plugin --profile web add https://github.com/bilibili/toy/releases/download/dsh-plugin-v0.2.1/bilibili-dsh-toy-0.2.1.tgz
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
the same component, compact, on its Plugins page card. The panel follows the DSH
language setting (Chinese or English) and re-renders on a switch; if the locale
service is unavailable it falls back to the browser language.

A compact header keeps the account (name, uid), refresh, sign in/out and the
**维护** entry, followed by the level-1 entries: Home, Publish/Update, My Toys,
Data, History, Notifications, Q&A forum, Review support and More info. The home
view leads with a large **发布 / 更新 Toy** action; the maintenance dialog holds
the resolved `toy` binary, the CLI version and upgrade flow, and the Skill card,
so the main surface stays focused on creating.

| Entry | What you can do |
|---|---|
| **Home** | Audience-aware. Creators get the publish/update call to action, account dashboard (yesterday PV/UV vs the same day last week, seven-day active-day-average and peak UV, portfolio, interactions) and the works wall. Signed-out users and accounts without a published Toy get a consumer home with the Toy square's current weekly picks (curated snapshot), the official account video feed, a login/create CTA, and the Toy permission link. |
| **Publish / Update** | Four step sections — target & package, display info, access & activity, precheck & preview. Searchable target picker, package/poster/icon paths with history suggestions, inline validation, local precheck with ERROR/WARN findings, **生成预览**, and a sticky action bar that summarizes the current state and holds precheck/generate/submit; an explicit "我已检查预览" gate still guards **提交审核**; new accounts are pointed to the Toy permission page, and a permission rejection surfaces the same link |
| **My Toys** | Every Toy in the account (read 50 per Host call, paged 20 per view; above 1000 the grid says so and keeps the first 1000). Search by title/slug/id, filter by status bucket and sort by update/create/title; the selected Toy opens a detail panel with open-page, stats, update, copy link/ID/slug, and skeleton/empty states with a publish shortcut. Password-protected Toys explain that the platform never returns an existing password to the CLI, and link to the publish platform (Publish records) to view or reset it; the plugin never reads or stores the password |
| **Data** | Default ranked overview: every Toy one row, ordered by yesterday's PV (then UV), each with a trend sparkline (UV bars with a PV line) and window totals; selecting a row opens the detail view with a searchable picker, a mixed PV/UV chart (PV as a line, UV as bars) with y-axis gridlines and a hovered-day readout, next-day retention and like/favorite/comment/share totals, 7/30/90-day windows, open-page shortcut |
| **History** | Local publish/update records, search by title/path/id, copy path and "publish with this path", clear-all behind a two-step confirmation |
| **Notifications** | `toy notify` feed with category chips (all / achievements / works & permissions / events), title, body, time and action links; read-only and never clears the platform unread badge |
| **Q&A forum** | Opens the public Toy creator Q&A forum in the browser; a link card remains as the popup-blocked fallback |
| **Review support** | Opens the WeCom customer-service conversation for review questions |
| **More info** | Link cards for Toy permission, the public developer FAQ, SDK, CLI, user guide, the interactive ops whitepaper and the Toy square; every entry opens in the browser. No page is embedded, no unpublished API is scraped and no login session is hosted |

The header shows the signed-in user and uid, an inverse-color **follow** link to the
哔哩哔哩Toy account, and the CLI binary/version in **维护**. The weekly-pick and
official-video cards are a curated snapshot; a feed service can replace them later. Review support and the Q&A forum open externally in the browser.

The access password is sent only to the CLI when publishing/updating: it is
masked (`••••`) in every wire payload, summary and confirmation dialog, so it
never reaches the model transcript. The CLI does not return an existing password
at all, and the panel does not read browser cookies, host a web login, or store
passwords; password-protected Toys link to the publish platform where the
creator can view or reset it.

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

- The skills CLI has no `dsh` target; pick an agent whose install path is
  `.agents/skills`/`~/.agents/skills` (`codex`, `cline`, `cursor`, …). DSH
  watches those roots, so an update reaches the next catalog without a restart.

The panel's **Skill card** shows the installed version (the CLI's lock-file
hash), our content hash and the update time, and offers **安装 skill / 更新
skill**. It asks for confirmation, runs the fixed command above (no free-form
arguments), shows the command output and refreshes the card. While the command
runs the card shows elapsed seconds and a **停止等待** action; the Host times the
process tree out at `skillTimeoutMs` and settles the call even if a descendant
keeps the stdio pipes open. The matching Host configuration is `agentsHome`,
`skillAgent` and `skillTimeoutMs`.

The skill is documentation (workflow + checklists). The preview gate and the
`--yes`/ticket rules are enforced in code and do not depend on the model reading it.

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

## Known limitations

- **The package path must be a host path.** The browser cannot upload files
  from the page yet, so the wizard takes a directory/`.zip`/`.html` path on the
  machine running dsh (history suggestions help). Dragging a file in from the
  browser is future work.
- **Metadata-only updates have no preview URL.** The CLI itself has no preview
  for them; the confirmation shows the planned field changes.
- **Slug is immutable.** Updating rejects `slug`; changing the URL requires a
  delete + recreate, which this bundle does not do.
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
