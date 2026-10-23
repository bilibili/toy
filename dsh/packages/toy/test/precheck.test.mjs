import assert from 'node:assert/strict'
import { mkdtemp, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { precheck } from '../src/precheck.js'
import { buildZip } from './helpers/zip-writer.mjs'

const roots = []

async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-toy-precheck-'))
  roots.push(dir)
  return dir
}

after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

function errors(result) {
  return result.findings.filter(finding => finding.severity === 'ERROR')
}

function warnings(result) {
  return result.findings.filter(finding => finding.severity === 'WARN')
}

async function packageWith(files) {
  const root = await workspace()
  for (const [name, content] of Object.entries(files)) {
    const full = join(root, name)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, content)
  }
  return root
}

const GOOD_INDEX = '<!doctype html><html><head><title>Toy</title></head><body>ok</body></html>'

test('accepts a minimal valid package', async () => {
  const root = await packageWith({ 'index.html': GOOD_INDEX, 'app.js': 'console.log(1)' })
  const result = await precheck(root)
  assert.equal(result.ok, true, JSON.stringify(errors(result)))
  assert.equal(result.kind, 'dir')
})

test('errors when there is no index.html at all', async () => {
  const root = await packageWith({ 'page.html': '<html></html>' })
  const result = await precheck(root)
  assert.equal(result.ok, false)
  assert.match(errors(result)[0].message, /missing index\.html/)
})

test('errors on root-relative HTML resources, which go white under /toy/<slug>/', async () => {
  const root = await packageWith({
    'index.html': '<html><head><title>x</title><script src="/assets/app.js"></script><link href=\'/style.css\'></head></html>',
  })
  const result = await precheck(root)
  assert.equal(result.ok, false)
  assert.ok(errors(result).some(finding => finding.message.includes('/assets/app.js')))
  assert.ok(errors(result).some(finding => finding.message.includes('/style.css')))
})

test('errors on a missing local resource but ignores anchors and remote URLs', async () => {
  const root = await packageWith({
    'index.html': '<html><head><title>x</title></head><body><a href="#section">s</a><img src="https://i0.hdslb.com/a.png"><script src="./missing.js"></script></body></html>',
  })
  const result = await precheck(root)
  assert.equal(result.ok, false)
  const messages = errors(result).map(finding => finding.message).join('\n')
  assert.match(messages, /missing\.js/)
  assert.doesNotMatch(messages, /#section/)
  assert.doesNotMatch(messages, /hdslb/)
})

test('flags root-relative CSS url() inside style blocks and attributes, not JS URLs', async () => {
  const root = await packageWith({
    'index.html': '<html><head><title>x</title><style>body{background:url(/bg.png)}</style></head><body><div style="background:url(\'/x.png\')"></div><script>const u = new URL(location)</script></body></html>',
  })
  const result = await precheck(root)
  const messages = errors(result).map(finding => finding.message).join('\n')
  assert.match(messages, /\/bg\.png/)
  assert.match(messages, /\/x\.png/)
  assert.doesNotMatch(messages, /new URL/)
})

test('errors when the entry index.html decompresses over 1 MB', async () => {
  const root = await packageWith({ 'index.html': `<html><head><title>x</title></head><body>${'a'.repeat(1024 * 1024)}</body></html>` })
  const result = await precheck(root)
  assert.equal(result.ok, false)
  assert.match(errors(result).map(finding => finding.message).join('\n'), /over the 1 MB limit/)
})

test('warns (not errors) when index.html is only inside a first-level folder', async () => {
  const root = await packageWith({ 'dist/index.html': GOOD_INDEX, 'dist/app.js': '1' })
  const result = await precheck(root)
  assert.equal(result.ok, true, JSON.stringify(result.findings))
  assert.ok(warnings(result).some(finding => finding.message.includes('dist/index.html')))
})

test('requireRootIndex turns the first-level case into an error', async () => {
  const root = await packageWith({ 'dist/index.html': GOOD_INDEX })
  const result = await precheck(root, { requireRootIndex: true })
  assert.equal(result.ok, false)
})

test('errors when two first-level index.html files make the entry ambiguous', async () => {
  const root = await packageWith({ 'a/index.html': GOOD_INDEX, 'b/index.html': GOOD_INDEX })
  const result = await precheck(root)
  assert.equal(result.ok, false)
  assert.ok(errors(result).some(finding => finding.message.includes('multiple first-level index.html')))
})

test('validates slug rules exactly like the server', async () => {
  const root = await packageWith({ 'index.html': GOOD_INDEX })
  const bad = await precheck(root, { slug: 'has space' })
  assert.equal(bad.ok, false)
  const long = await precheck(root, { slug: 'a'.repeat(65) })
  assert.equal(long.ok, false)
  const good = await precheck(root, { slug: 'my_toy-1' })
  assert.equal(good.ok, true, JSON.stringify(errors(good)))
})

test('validates the poster format and prefers a 4:3 landscape cover', async () => {
  const root = await packageWith({
    'index.html': GOOD_INDEX,
    'poster.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x03, 0x20, 0, 0, 0x03, 0x20]),
    'portrait.gif': (() => {
      const gif = Buffer.alloc(10)
      gif.write('GIF89a', 0, 'ascii')
      gif.writeUInt16LE(32, 6)
      gif.writeUInt16LE(64, 8)
      return gif
    })(),
    'notes.txt': 'x',
  })
  const portrait = await precheck(root, { poster: join(root, 'portrait.gif') })
  // A suffix/content mismatch is advice, not a blocker: the CLI validates by
  // content and stays the final authority.
  assert.equal(portrait.ok, true)
  assert.ok(warnings(portrait).some(finding => finding.message.includes('poster formats')))
  assert.ok(warnings(portrait).some(finding => finding.message.includes('poster content is gif')))

  const square = await precheck(root, { poster: join(root, 'poster.png') })
  assert.equal(square.ok, true)
  assert.ok(warnings(square).some(finding => finding.message.includes('4:3 landscape')))
})

test('warns (not errors) when an icon is over the CLI limits, since the limits are versioned', async () => {
  const root = await packageWith({
    'index.html': GOOD_INDEX,
    'icon.png': Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x08, 0x00, 0, 0, 0x08, 0x00]),
      Buffer.alloc(512 * 1024),
    ]),
  })
  const result = await precheck(root, { icon: join(root, 'icon.png') })
  assert.equal(result.ok, true, JSON.stringify(result.findings))
  const messages = warnings(result).map(finding => finding.message).join('\n')
  assert.match(messages, /icon is \d+ bytes/)
  assert.match(messages, /1024px/)
})

test('inspects a ZIP package using decompressed sizes', async () => {
  const big = `<html><head><title>x</title></head><body>${'a'.repeat(1024 * 1024)}</body></html>`
  const archive = buildZip([
    { name: 'index.html', data: big },
    { name: 'assets/app.js', data: 'console.log(1)' },
  ])
  const dir = await workspace()
  const file = join(dir, 'toy.zip')
  await writeFile(file, archive)
  const result = await precheck(file)
  assert.equal(result.kind, 'zip')
  assert.equal(result.ok, false)
  assert.match(errors(result).map(finding => finding.message).join('\n'), /over the 1 MB limit/)
})

test('treats a single HTML file as the package root index.html', async () => {
  const dir = await workspace()
  const file = join(dir, 'game.html')
  await writeFile(file, '<html><head><title>x</title></head><body><img src="./nope.png"></body></html>')
  const result = await precheck(file)
  assert.equal(result.kind, 'html')
  // A single HTML upload has no sibling assets, so a relative reference is
  // reported exactly like it would be inside a zip with the same entries.
  assert.equal(result.ok, false)
})

test('warns on a framework source root and on assets without content hashes', async () => {
  const root = await packageWith({
    'index.html': GOOD_INDEX,
    'package.json': '{}',
    'src/main.js': '1',
    'app.js': '1',
    'style.css': '2',
  })
  const result = await precheck(root)
  assert.equal(result.ok, true)
  const messages = warnings(result).map(finding => finding.message).join('\n')
  assert.match(messages, /framework source root/)
  assert.match(messages, /content hash/)
})

test('warns about polling cloud-storage calls without blocking', async () => {
  const root = await packageWith({
    'index.html': GOOD_INDEX,
    'app.js': 'setInterval(() => toy.setCloudStorage({ a: 1 }), 1000)',
  })
  const result = await precheck(root)
  assert.equal(result.ok, true)
  assert.ok(warnings(result).some(finding => finding.message.includes('setCloudStorage')))
})

test('reports a missing path instead of throwing', async () => {
  const result = await precheck('/tmp/definitely-missing-toy-package-xyz')
  assert.equal(result.ok, false)
  assert.equal(result.kind, 'dir')
  assert.match(errors(result)[0].message, /path does not exist/)
})

test('errors on a packaged image with a side at or over the CLI 10000px limit', async () => {
  const png = Buffer.alloc(33)
  png.write('89504e470d0a1a0a', 0, 'hex')
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12, 'ascii')
  png.writeUInt32BE(12000, 16)
  png.writeUInt32BE(400, 20)
  const root = await packageWith({ 'index.html': GOOD_INDEX, 'assets/huge.png': png })
  const result = await precheck(root)
  assert.equal(result.ok, false)
  assert.match(errors(result).map(finding => finding.message).join('\n'), /12000x400/)
})

test('warns when the icon content is not PNG/JPEG even with an image suffix', async () => {
  const root = await packageWith({
    'index.html': GOOD_INDEX,
    'icon.png': (() => {
      const gif = Buffer.alloc(10)
      gif.write('GIF89a', 0, 'ascii')
      gif.writeUInt16LE(32, 6)
      gif.writeUInt16LE(32, 8)
      return gif
    })(),
  })
  const result = await precheck(root, { icon: join(root, 'icon.png') })
  assert.equal(result.ok, true, JSON.stringify(result.findings))
  assert.match(warnings(result).map(finding => finding.message).join('\n'), /icon content is gif/)
})

test('warns about ZIP entries that escape the archive root', async () => {
  const archive = buildZip([
    { name: 'index.html', data: GOOD_INDEX },
    { name: '../evil.js', data: 'x' },
  ])
  const dir = await workspace()
  const file = join(dir, 'toy.zip')
  await writeFile(file, archive)
  const result = await precheck(file)
  assert.equal(result.ok, true, JSON.stringify(result.findings))
  assert.ok(warnings(result).some(finding => /escaping the archive root/.test(finding.message)))
})

test('does not block valid references: self/dir links, query-only hrefs, comments, data URIs', async () => {
  const root = await packageWith({
    'index.html': [
      '<html><head><title>x</title><base href="./"></head><body>',
      '<a href="./">home</a>',
      '<a href=".">self</a>',
      '<a href="?x=1">query</a>',
      '<a href="./sub/">dir</a>',
      '<!-- <script src="/assets/commented-out.js"></script> -->',
      '<img srcset="data:image/png;base64,AAAA 1x, ./real.png 2x">',
      '</body></html>',
    ].join(''),
    'sub/index.html': '<html><head><title>sub</title></head><body>ok</body></html>',
    'real.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x00, 0x10, 0, 0, 0x00, 0x10]),
  })
  const result = await precheck(root)
  assert.equal(result.ok, true, JSON.stringify(errors(result)))
})

test('does not block query-only, directory, <base>-relative or entity references', async () => {
  const root = await packageWith({
    'index.html': [
      '<html><head><title>x</title><base href="./sub/"></head><body>',
      '<a href="./?x=1">q</a>',
      '<a href="./sub/?q=1">dirq</a>',
      '<img srcset="./sub/b.png?w=1,2 1x">',
      '<img src="a&amp;b.png">',
      '<script src="app.js"></script>',
      '</body></html>',
    ].join(''),
    'sub/index.html': '<html><head><title>sub</title></head><body>ok</body></html>',
    'sub/a&b.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x00, 0x10, 0, 0, 0x00, 0x10]),
    'sub/app.js': 'console.log(1)',
  })
  const result = await precheck(root)
  assert.equal(result.ok, true, JSON.stringify(errors(result)))
})
