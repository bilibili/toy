# bilibili Toy — agent skills + DSH plugin

Two ways to drive the Bilibili **Toy** creator platform from an agent:

- **Agent skills** — [`skills/toy`](skills/toy/SKILL.md), packaged in the
  [Vercel skills](https://github.com/vercel-labs/skills) format. Install it into
  Claude Code, Codex, Cursor, DeepSeek Harness and 50+ other agents with one
  command.
- **DSH plugin** — [`dsh/`](dsh/), a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
  bundle with a full Web UI and `toy_*` model tools for the same CLI.

Both paths wrap the official [`toy`](https://github.com/bilibili/toy) CLI; the
skill is documentation, while the plugin's safety rules (preview → confirmation
→ submit) are enforced in code.

## Skills

### Install

```sh
# Interactive: choose the skills and agents
npx skills add bilibili/toy

# Non-interactive, for one agent:
npx skills add bilibili/toy -a claude-code      # project: .claude/skills
npx skills add bilibili/toy -a codex -g         # global:  ~/.agents/skills
npx skills add bilibili/toy -a codex            # project: .agents/skills
```

`npx skills` discovers skills under the top-level [`skills/`](skills/) directory.
With no `-a`, it installs to every supported agent; pick one when you only want a
specific agent's directory. DSH itself scans `<project>/.agents/skills`
(rank 200) and `~/.agents/skills` (rank 500), so the `codex` target is the
DSH-ready one.

### Update

```sh
npx skills check
npx skills update
```

### What's inside

| Skill | What it does |
| ----- | ------------ |
| [`toy`](skills/toy/SKILL.md) | Publish, update, preview, and inspect Toy pages through the official `toy` CLI |

- `references/installation.md` — installing/logging in to the CLI
- `references/content-checklist.md` — what a Toy package needs before review
- `references/error-codes.md` — CLI errors and how to react
- `scripts/toy_doctor.py` — zero-dependency static preflight for a package

A skill is a directory with a `SKILL.md` whose frontmatter carries a
lowercase-hyphen `name` (matching the directory name) and a `description`; see
the [Vercel skills source formats](https://vercel-labs-skills.mintlify.app/guides/source-formats).

## DSH plugin

[`dsh/`](dsh/) is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
plugin bundle (package `@bilibili/dsh-toy`, `dsh/` is a small pnpm workspace for
building it). It adds a **bilibili Toy** panel to the sidebar — My Toys, PV/UV
stats, the precheck → preview → explicit-confirm publish wizard, and local
history — plus the same operations as `toy_*` tools for the model. One Host
implementation backs both, so the rules cannot drift.

Safety in short:

- preparing a publish never submits; it only creates a preview (or plans a
  metadata-only update), and submit stays disabled until you explicitly confirm;
- the package is content-fingerprinted before its preview upload, so submit
  cannot send bytes you did not see;
- an upload is refused while the local precheck reports an ERROR;
- the other destructive action (local history clear) needs a typed confirmation
  and a one-shot Host ticket.

### Requirements

- DeepSeek Harness `0.2.1-rc.2` (see the package's `engines.dsh`)
- the `toy` CLI `v0.6.x` on the host, plus a logged-in session (`toy login`)
- Node.js 22.20+ only for `npx skills` installs and building from source

### Install

Once a `dsh-plugin-v*` tag has run the release workflow:

```sh
# latest
dsh plugin --profile web add https://github.com/bilibili/toy/releases/latest/download/bilibili-dsh-toy.tgz
# pinned
dsh plugin --profile web add https://github.com/bilibili/toy/releases/download/dsh-plugin-v0.1.0/bilibili-dsh-toy-0.1.0.tgz
```

From a source checkout:

```sh
pnpm --dir dsh install
pnpm --dir dsh check
dsh plugin --profile web add /absolute/path/to/dsh/packages/toy
```

Updating a tarball install means running the `add` again with the new tarball;
there is no auto-update channel.

### The skill is not bundled

The plugin does not ship a copy of the skill. Install/update it through the
skills CLI (DSH's filesystem provider watches those directories), or from the
panel's **Skill** card, which shows the installed version, content hash and
update time and runs the same command after a confirmation:

```sh
npx skills add bilibili/toy -a codex -g   # ~/.agents/skills/toy
npx skills check && npx skills update
```

Full details — tabs, tools, the precheck table, configuration, the security
model, development and known limitations — are in
[`dsh/packages/toy/README.md`](dsh/packages/toy/README.md).

## Layout

```
skills/
  toy/
    SKILL.md              # skill definition (YAML frontmatter: name, description)
    references/           # supporting docs loaded on demand
      installation.md
      content-checklist.md
      error-codes.md
    scripts/
      toy_doctor.py       # zero-dependency static preflight for Toy packages
dsh/
  package.json            # private pnpm workspace (build/test toolchain)
  packages/toy/           # @bilibili/dsh-toy bundle: host, Web UI, tests
  packages/dsh-typert-protocol/  # vendored Typert protocol the build targets
.github/workflows/        # CI: build/test, and tag-driven release tarballs
```

## Development

```sh
pnpm --dir dsh install    # build/test toolchain
pnpm --dir dsh check      # build + node:test suite (fake toy binary)
```

Agents and contributors: the working rules, verification playbooks and release
checklist are in [`AGENTS.md`](AGENTS.md).

The release workflow (`.github/workflows/dsh-plugin.yml`) runs on `dsh/**`
changes and, for a `dsh-plugin-vX.Y.Z` tag, packs the tarball, writes
`SHA256SUMS` and creates the GitHub release.

### Releasing

1. Bump `version` in `dsh/packages/toy/package.json` (the tag must match it).
2. Push to `main`, then push the tag:

   ```sh
   git tag dsh-plugin-v0.1.0
   git push origin dsh-plugin-v0.1.0
   ```

The workflow runs the same build/tests, attaches `bilibili-dsh-toy-<version>.tgz`,
`bilibili-dsh-toy.tgz` and `SHA256SUMS`, and publishes release notes. It only
needs the automatic `GITHUB_TOKEN` with `contents: write` — no repository
secrets.

## License

[MIT](LICENSE)
