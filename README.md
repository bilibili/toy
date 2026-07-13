# toy skills

Agent skills for the Bilibili **Toy** platform creator CLI, packaged in the
[Vercel skills](https://github.com/vercel-labs/skills) format so any compatible
agent (Claude Code, Cursor, Codex, and 50+ others) can install them.

## Install

```bash
npx skills add bilibili/toy
```

The CLI discovers skills under the top-level [`skills/`](skills/) directory.

## Skills

| Skill | What it does |
| ----- | ------------ |
| [`toy`](skills/toy/SKILL.md) | Publish, update, preview, and inspect Toy pages through the official `toy` CLI. |

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
```

Each skill is a directory with a `SKILL.md` whose frontmatter carries a
lowercase-hyphen `name` (matching the directory name) and a `description`. See
the [Vercel skills source formats](https://vercel-labs-skills.mintlify.app/guides/source-formats)
for the full discovery rules.

## License

[MIT](LICENSE)
