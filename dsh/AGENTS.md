# AGENTS.md — `dsh/` workspace

Instructions for AI coding agents working on the `@bilibili/dsh-toy` bundle.
Repository-wide rules live in the root [`AGENTS.md`](../AGENTS.md); read both.

## What this workspace is

A private pnpm workspace (root `../`, package `@bilibili/dsh-toy`) that builds the
DeepSeek Harness bundle: a **bilibili Toy** Web UI plus `toy_*` model tools. The
browser half talks to the Host half over the generated `toyPublisher` Remote
namespace; both share `packages/toy/src/host/service.js`, so the safety rules
cannot drift.

The skill (`../skills/toy`) is **not** part of this workspace and is not bundled
by the plugin. Do not add a `skill/` copy, provider or build step.

## Golden rules

- **Never run Toy write commands against the real platform:** publish, update,
  submit, bind, shared-storage writes, history clear, login or logout. Use
  `packages/toy/test/fixtures/fake-toy.mjs` and a throwaway `DSH_HOME`.
  Read-only list/stats/history against a real account is fine.
- **Never commit** `packages/toy/lib/`, `node_modules/`, `*.tgz`, or
  `packages/toy/skill/`.
- **Do not bypass the safety gates** when adding features: preview before
  submit, explicit confirmation, package fingerprint before upload, precheck
  blocking ERRORs, history-clear ticket. Extend the tests instead.
- **No npm publishing.** Distribution is the GitHub Release tarball built by CI.
- **Do not push tags, force-push `main`, or merge PRs** unless a human asked for
  that exact action.

## Setup

Node.js ≥22.19, pnpm 10.30.3, network on first install.

```sh
pnpm install        # from this directory (dsh/)
pnpm check          # build + node:test suite (129 tests, fake toy binary)
```

Package-level commands, from `packages/toy/` after the workspace install:
`pnpm build`, `pnpm test`, `pnpm typecheck`.

## Project map

```
dsh/
  package.json                  private workspace root; build/test/check scripts
  tsconfig.host.json            workspace root the Typert generator needs
  pnpm-workspace.yaml           packages/* + the vendored protocol link
  packages/toy/                 @bilibili/dsh-toy
    src/index.ts                plugin entry: tools + Remote controller
    src/host/                   config, service, controller, skills manager
    src/client/                 Web UI (React, lazy-CJS bundle)
    test/                       node:test suites + fixtures/fake-toy.mjs
  packages/dsh-typert-protocol/ vendored protocol the Typert build targets
```

The release/CI workflow lives outside this workspace:
`../.github/workflows/dsh-plugin.yml`.

## Plugin change playbook

1. Change code under `packages/toy/` (and workspace files only if the build
   changes).
2. Add/adjust `node:test` cases under `packages/toy/test/`.
3. Run `pnpm check` from `dsh/` until green.
4. Update `packages/toy/README.md` (and the root README summary) when behaviour,
   configuration or the safety model changes.
5. Do not bump the version unless you are preparing a release (below).

## Local verification

All against an isolated home; never the real profile:

```sh
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
pnpm install && pnpm build            # from dsh/
DSH_HOME=/tmp/dsh-toy-dev "$DSH" plugin --profile web add "$PWD/packages/toy"
DSH_HOME=/tmp/dsh-toy-dev "$DSH" --profile web --no-open --port 0
```

To exercise preview/submit without touching the platform, boot with a `--patch`
overlay whose `toy` config points `binary` at
`packages/toy/test/fixtures/fake-toy.mjs`, and use a scratch package under
`/tmp`. The fake binary never reaches the network.

## Versioning and release

- Version lives in `packages/toy/package.json` (`version`) and is independent
  from the skill.
- Release tags are `dsh-plugin-v<version>` and **must** equal that version; CI
  fails otherwise.
- `engines.dsh` declares the supported DSH range (`>=0.2.1-rc.2 <0.3.0` today).
  Do not widen it without testing that range.

Release steps:

1. `pnpm check` green.
2. Set the new `version` in `packages/toy/package.json`; commit.
3. Push/merge to `main`.
4. Push the matching tag:

   ```sh
   git tag dsh-plugin-v0.1.3
   git push origin dsh-plugin-v0.1.3
   ```

5. CI runs the same build/tests, packs the tarball and creates the GitHub
   Release with `bilibili-dsh-toy-<version>.tgz`, the stable-named
   `bilibili-dsh-toy.tgz` (for `releases/latest/download/...`) and
   `SHA256SUMS`.
6. Verify the release assets and the README install URLs.

GitHub repository settings needed (one-time, admin): Actions enabled and
Settings → Actions → General → Workflow permissions = **Read and write** (the
release job requests `contents: write` for the automatic `GITHUB_TOKEN`). No
repository secrets. If the org restricts third-party actions, allow
`pnpm/action-setup`; other actions are official or the runner's `gh`.

### Release checklist

- [ ] `pnpm check` green
- [ ] version bumped and committed (CI checks it against the tag)
- [ ] tag pushed, workflow green
- [ ] assets + `SHA256SUMS` present, `releases/latest/download/...` resolves
- [ ] README install commands still correct
- [ ] no real Toy writes performed

## How users update

| What changed | User action |
|---|---|
| Plugin | `dsh plugin --profile web add <new tarball URL>`, then restart dsh |
| Skill (separate channel) | `npx skills update` or the panel's Skill card |

Tarball installs have no auto-update channel: re-running `add` with the new URL
is the update. Pinned URLs are reproducible; the stable
`releases/latest/download/bilibili-dsh-toy.tgz` URL follows the latest release.

## Common failures

- **`ERR_PNPM_OUTDATED_LOCKFILE` / `--frozen-lockfile` fails:** run
  `pnpm install` here and commit `pnpm-lock.yaml` with the dependency change.
- **`typert-generator: cannot find workspace root`:** build from this workspace
  (`pnpm ...` in `dsh/`), not from a bare `packages/toy/` without
  `tsconfig.host.json` + `packages/`.
- **Tag/version mismatch in CI:** bump `packages/toy/package.json` first.
- **`gh release` 403:** Workflow permissions are read-only; set Read and write.
- **`pnpm: command not found`:** the workspace requires pnpm 10.30.3.
- **Tests hit the real account:** they must not; check that the fake binary and
  throwaway `DSH_HOME` are in use.

## Do not

- Do not add an npm publish workflow, a second lockfile or a second package
  manager.
- Do not re-introduce a bundled skill or a `skill/` build step.
- Do not commit `lib/`, `node_modules/`, `*.tgz` or screenshots.
- Do not change safety behaviour without updating tests and both READMEs.
