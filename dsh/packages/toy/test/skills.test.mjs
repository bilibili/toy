import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'

import {
  createSkillManager,
  hashSkillDir,
  resolveAgentsHome,
  shortHash,
  skillsCommand,
} from '../src/host/skills.js'
import { createToyService, resolveConfig } from '../lib/index.js'

const SKILL_DIR = fileURLToPath(new URL('../../../../skills/toy', import.meta.url))
const cleanup = []
after(async () => {
  for (const dir of cleanup) await rm(dir, { recursive: true, force: true })
})

async function tempDir(prefix = 'dsh-toy-skill-') {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  cleanup.push(dir)
  return dir
}

function fakeRunner(result = { ok: true, exitCode: 0, output: 'installed' }) {
  const calls = []
  return {
    calls,
    run: async argv => {
      calls.push(argv)
      return result
    },
  }
}

test('hashSkillDir is deterministic and content-sensitive', async () => {
  const dir = await tempDir()
  await writeFile(join(dir, 'SKILL.md'), '# skill v1\n')
  await mkdir(join(dir, 'references'))
  await writeFile(join(dir, 'references', 'a.md'), 'a\n')
  const first = await hashSkillDir(dir)
  const second = await hashSkillDir(dir)
  assert.equal(first.hash, second.hash)
  assert.equal(first.files, 2)
  await writeFile(join(dir, 'references', 'a.md'), 'changed\n')
  assert.notEqual((await hashSkillDir(dir)).hash, first.hash)
})

test('status reports an empty agents home and the exact commands', async () => {
  const agentsHome = await tempDir()
  const manager = createSkillManager({ agentsHome, run: fakeRunner().run })
  const status = await manager.status()
  assert.equal(status.ok, true)
  assert.equal(status.agentsHome, agentsHome)
  assert.equal(status.installed, false)
  assert.equal(status.managed, undefined)
  assert.match(status.installCommand, /skills add bilibili\/toy --skill toy -g -a codex -y$/)
  assert.match(status.updateCommand, /skills update -g -y toy$/)
})

test('a skills-CLI install is detected from the lock file and compared to the bundle', async () => {
  const agentsHome = await tempDir()
  await mkdir(join(agentsHome, 'skills', 'toy'), { recursive: true })
  await cp(SKILL_DIR, join(agentsHome, 'skills', 'toy'), { recursive: true })
  const lockHash = 'abcdef0123456789abcdef0123456789abcdef01'
  await writeFile(join(agentsHome, '.skill-lock.json'), JSON.stringify({
    version: 3,
    skills: {
      toy: {
        source: 'bilibili/toy',
        sourceType: 'github',
        skillFolderHash: lockHash,
        installedAt: '2026-10-23T10:00:00.000Z',
        updatedAt: '2026-10-23T10:30:00.000Z',
      },
    },
    dismissed: {},
  }))
  const manager = createSkillManager({ agentsHome, run: fakeRunner().run })
  const status = await manager.status()
  assert.equal(status.installed, true)
  assert.equal(status.managed.version, shortHash(lockHash, 12))
  assert.equal(status.managed.contentHash.length, 10)
  assert.equal(status.managed.files, 5)
  assert.equal(status.managed.updatedAt, '2026-10-23T10:30:00.000Z')
  assert.equal(status.managed.upstream, 'bilibili/toy')
})

test('install runs add when absent and update when a managed copy exists', async () => {
  const emptyHome = await tempDir()
  const addRunner = fakeRunner()
  const addManager = createSkillManager({ agentsHome: emptyHome, run: addRunner.run })
  const added = await addManager.install()
  assert.equal(added.ok, true)
  assert.equal(added.action, 'add')
  assert.deepEqual(addRunner.calls[0], ['npx', '--yes', 'skills', 'add', 'bilibili/toy', '--skill', 'toy', '-g', '-a', 'codex', '-y'])

  const installedHome = await tempDir()
  await mkdir(join(installedHome, 'skills', 'toy'), { recursive: true })
  await cp(SKILL_DIR, join(installedHome, 'skills', 'toy'), { recursive: true })
  const updateRunner = fakeRunner()
  const updateManager = createSkillManager({ agentsHome: installedHome, run: updateRunner.run })
  const updated = await updateManager.install()
  assert.equal(updated.ok, true)
  assert.equal(updated.action, 'update')
  assert.deepEqual(updateRunner.calls[0], ['npx', '--yes', 'skills', 'update', '-g', '-y', 'toy'])
})

test('install reports CLI failures, timeouts and a missing npx', async () => {
  const home = await tempDir()
  const failed = createSkillManager({
    agentsHome: home,
    run: async () => ({ ok: false, exitCode: 1, output: 'boom: no network' }),
  })
  const failure = await failed.install()
  assert.equal(failure.ok, false)
  assert.equal(failure.error.kind, 'skills-cli')
  assert.match(failure.error.message, /no network/)

  const timedOut = createSkillManager({
    agentsHome: home,
    run: async () => ({ ok: false, exitCode: null, output: '', timedOut: true }),
  })
  assert.equal((await timedOut.install()).error.kind, 'timeout')

  const missing = createSkillManager({
    agentsHome: home,
    run: async () => ({ ok: false, exitCode: null, output: '', spawnError: new Error('ENOENT') }),
  })
  assert.equal((await missing.install()).error.kind, 'npx-missing')
})

test('resolveAgentsHome honours config, $DSH_AGENTS_HOME, then ~/.agents', () => {
  const saved = process.env.DSH_AGENTS_HOME
  try {
    assert.equal(resolveAgentsHome('/tmp/explicit'), '/tmp/explicit')
    process.env.DSH_AGENTS_HOME = '/tmp/from-env'
    assert.equal(resolveAgentsHome(), '/tmp/from-env')
    delete process.env.DSH_AGENTS_HOME
    assert.match(resolveAgentsHome(), /\.agents$/)
    assert.deepEqual(skillsCommand('add', 'cline').slice(-3), ['-a', 'cline', '-y'])
  } finally {
    if (saved === undefined) delete process.env.DSH_AGENTS_HOME
    else process.env.DSH_AGENTS_HOME = saved
  }
})

test('the shared service exposes skillStatus with the configured agents home', async () => {
  const agentsHome = await tempDir()
  const service = createToyService(resolveConfig({ agentsHome }))
  const status = await service.skillStatus()
  assert.equal(status.ok, true)
  assert.equal(status.agentsHome, agentsHome)
  assert.equal(status.installed, false)
  assert.match(status.installCommand, /skills add/)
  assert.equal(typeof service.installSkill, 'function')
})
