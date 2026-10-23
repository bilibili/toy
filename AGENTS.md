# AGENTS.md

Repository-wide instructions for AI coding agents (and contributors). This
repository ships two things, and most changes belong to one of them:

| Path | Product | Distribution |
|---|---|---|
| `skills/toy/` | The `toy` agent skill (workflow, references, `toy_doctor.py`) | `npx skills add bilibili/toy` |
| `dsh/` | `@bilibili/dsh-toy`, the DeepSeek Harness bundle (Web UI + `toy_*` tools) | GitHub Release tarball |

**Plugin work has its own guide: [`dsh/AGENTS.md`](dsh/AGENTS.md).** Read it
before touching anything under `dsh/`.

## Rules that apply everywhere

- **`skills/toy` is the only copy of the skill.** The plugin does not bundle it;
  never add a `skill/` copy, provider or build step for it.
- **Never run Toy write commands against the real platform** while testing:
  publish, update, submit, bind, shared-storage writes, history clear, login or
  logout. The plugin's tests and manual checks use
  `dsh/packages/toy/test/fixtures/fake-toy.mjs` and a throwaway `DSH_HOME`.
  Read-only queries against a real account are fine.
- **No secrets and no npm release channel.** CI uses only the automatic
  `GITHUB_TOKEN`.
- **Releases and merges are human-approved:** do not push tags, force-push
  `main`, or merge PRs unless a human asked for that exact action.
- **Never commit generated output or installs:** `dsh/packages/toy/lib/`,
  `node_modules/`, `*.tgz`, `dsh/packages/toy/skill/`.
- Keep changes minimal; update the relevant README when behaviour, commands or
  configuration change.

## Skill changes (`skills/toy/`)

- `SKILL.md` must keep `name: toy` and a `description`; the directory name stays
  `toy` (skills discovery rules).
- Every referenced file (`references/*.md`, `scripts/toy_doctor.py`) must exist.
- Update the root [`README.md`](README.md) skill list when adding/removing files.
- **No plugin version bump and no tag.** Users get skill changes through
  `npx skills update` (or the panel's Skill card); DSH watches the agents
  directory.

## Where to look

- Skill install/update: root `README.md` → Skills.
- Plugin install/update, the panel, tools, configuration, safety model:
  root `README.md` → DSH plugin and `dsh/packages/toy/README.md`.
- Plugin development, verification, versioning and release: `dsh/AGENTS.md`.
- CI: `.github/workflows/dsh-plugin.yml`.

## Quick commands

```sh
# Plugin (build + tests, fake toy binary; no real platform access)
pnpm --dir dsh install
pnpm --dir dsh check

# Skill: nothing to build; review the edited files and links
```
