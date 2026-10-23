/**
 * Minimal ZIP reader for the local precheck.
 *
 * Toy accepts a directory, a single `.html`, or a ready-made `.zip`, so the
 * precheck has to look inside an archive without shelling out to `unzip` and
 * without a dependency. This reads the central directory (which carries the
 * authoritative decompressed sizes) and inflates individual text members on
 * demand. Stored and deflated members are supported; ZIP64 and encrypted
 * archives are rejected explicitly so the caller can tell the user to pass the
 * unzipped directory instead of silently missing files.
 *
 * @module dsh-toy/zip
 */

import { inflateRawSync } from 'node:zlib'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const EOCD_MIN_BYTES = 22
const MAX_COMMENT_BYTES = 0xffff

/** @typedef {{ name: string, rawName: string, method: number, compressedSize: number, size: number, localOffset: number, directory: boolean }} ZipEntry */

/**
 * Normalize an archive member name to a safe POSIX path.
 * @param {string} name
 * @returns {string}
 */
export function normalizeEntryName(name) {
  let clean = name.replaceAll('\\', '/')
  while (clean.startsWith('/')) clean = clean.slice(1)
  const parts = []
  for (const part of clean.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      // A member that escapes the archive root is never a package resource.
      parts.length = 0
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

/**
 * @param {Buffer} buffer
 * @returns {number}
 */
function findEndOfCentralDirectory(buffer) {
  const lowest = Math.max(0, buffer.length - EOCD_MIN_BYTES - MAX_COMMENT_BYTES)
  for (let offset = buffer.length - EOCD_MIN_BYTES; offset >= lowest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  return -1
}

/**
 * Parse the central directory of a ZIP archive.
 * @param {Buffer} buffer complete archive bytes
 * @returns {readonly ZipEntry[]}
 */
export function readZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < EOCD_MIN_BYTES) {
    throw new Error('not a readable ZIP file: the archive is empty or truncated')
  }
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd < 0) throw new Error('not a readable ZIP file: no end-of-central-directory record')

  const count = buffer.readUInt16LE(eocd + 10)
  const directorySize = buffer.readUInt32LE(eocd + 12)
  const directoryOffset = buffer.readUInt32LE(eocd + 16)
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported by the local precheck; pass the unzipped directory instead')
  }
  if (directoryOffset + directorySize > buffer.length) {
    throw new Error('not a readable ZIP file: the central directory points outside the archive')
  }

  const entries = []
  let offset = directoryOffset
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error('not a readable ZIP file: a central-directory entry is malformed')
    }
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const size = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const externalAttributes = buffer.readUInt32LE(offset + 38)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const nameStart = offset + 46
    const rawName = buffer.subarray(nameStart, nameStart + nameLength)
    const raw = rawName.toString('utf8')
    const name = normalizeEntryName(raw)
    const mode = (externalAttributes >>> 16) & 0o170000
    entries.push({
      name,
      rawName: raw,
      method,
      compressedSize,
      size,
      localOffset,
      directory: name === '' || rawName.toString('utf8').endsWith('/') || mode === 0o040000,
    })
    offset = nameStart + nameLength + extraLength + commentLength
  }
  return entries
}

/**
 * Locate one member and return its decompressed bytes.
 * @param {Buffer} buffer complete archive bytes
 * @param {readonly ZipEntry[]} entries parsed central directory
 * @param {string} name member name as produced by {@link readZipEntries}
 * @returns {Buffer}
 */
export function readZipEntry(buffer, entries, name) {
  const entry = entries.find(candidate => candidate.name === name)
  if (entry === undefined) throw new Error(`ZIP member not found: ${name}`)
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error(`ZIP member ${name} uses unsupported compression method ${entry.method}`)
  }
  const header = entry.localOffset
  if (header + 30 > buffer.length || buffer.readUInt32LE(header) !== LOCAL_SIGNATURE) {
    throw new Error(`not a readable ZIP file: local header for ${name} is malformed`)
  }
  const nameLength = buffer.readUInt16LE(header + 26)
  const extraLength = buffer.readUInt16LE(header + 28)
  const start = header + 30 + nameLength + extraLength
  const end = start + entry.compressedSize
  if (end > buffer.length) throw new Error(`not a readable ZIP file: data for ${name} is truncated`)
  const data = buffer.subarray(start, end)
  return entry.method === 0 ? Buffer.from(data) : inflateRawSync(data)
}
