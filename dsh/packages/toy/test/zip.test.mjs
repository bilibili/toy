import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeEntryName, readZipEntries, readZipEntry } from '../src/zip.js'
import { buildZip } from './helpers/zip-writer.mjs'

test('reads the central directory of a deflated archive', () => {
  const archive = buildZip([
    { name: 'index.html', data: '<html><title>toy</title></html>' },
    { name: 'assets/app.js', data: 'console.log("hi")' },
  ])
  const entries = readZipEntries(archive)
  assert.deepEqual(entries.map(entry => entry.name), ['index.html', 'assets/app.js'])
  assert.equal(entries[0].size, Buffer.byteLength('<html><title>toy</title></html>'))
  assert.equal(entries[0].directory, false)
})

test('inflates one member on demand and leaves the others alone', () => {
  const archive = buildZip([
    { name: 'index.html', data: '<h1>toy</h1>' },
    { name: 'a.css', data: 'body{color:red}', deflate: false },
  ])
  const entries = readZipEntries(archive)
  assert.equal(readZipEntry(archive, entries, 'index.html').toString(), '<h1>toy</h1>')
  assert.equal(readZipEntry(archive, entries, 'a.css').toString(), 'body{color:red}')
})

test('rejects bytes that are not a ZIP archive', () => {
  assert.throws(() => readZipEntries(Buffer.from('definitely not a zip')), /not a readable ZIP file/)
  assert.throws(() => readZipEntries(Buffer.alloc(0)), /not a readable ZIP file/)
})

test('normalizes member names and defuses traversal', () => {
  assert.equal(normalizeEntryName('/dist//index.html'), 'dist/index.html')
  assert.equal(normalizeEntryName('a\\b\\c.txt'), 'a/b/c.txt')
  assert.equal(normalizeEntryName('../../etc/passwd'), 'etc/passwd')
  assert.equal(normalizeEntryName('./ok/./file.js'), 'ok/file.js')
})
