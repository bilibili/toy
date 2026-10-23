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


### Requirements

- DeepSeek Harness `0.2.1-rc.2` (see the package's `engines.dsh`)
- the `toy` CLI `v0.6.x` on the host, plus a logged-in session (`toy login`)
- Node.js 22.20+ only for `npx skills` installs and building from source

### Install

```sh
dsh plugin --profile web add https://github.com/bilibili/toy/releases/latest/download/bilibili-dsh-toy.tgz
```

Pinned versions, source builds and update/restart notes are in the
[package README](dsh/packages/toy/README.md#install).

### The skill is not bundled

The plugin does not ship a copy of the skill; install it with the command under
[Skills](#skills). The panel's **Skill** card shows the installed version,
content hash and update time and can run the same update after a confirmation.

Full details — tabs, configuration, the security model and known limitations —
are in [`dsh/packages/toy/README.md`](dsh/packages/toy/README.md).

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

## License

[MIT](LICENSE)
