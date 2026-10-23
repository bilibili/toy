/**
 * Image header inspection for the local precheck.
 *
 * Covers exactly the formats Toy accepts for a poster/icon (PNG and JPEG), plus
 * a format name for anything else so the report can say what the file actually
 * is instead of "could not read dimensions". Only the headers are parsed — the
 * pixel data is never decoded.
 *
 * @module dsh-toy/images
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const GIF_SIGNATURE = Buffer.from('GIF8', 'ascii')

/**
 * @typedef {{ format: 'png' | 'jpeg' | 'gif' | 'webp' | 'unknown', width: number, height: number } | { format: 'png' | 'jpeg' | 'gif' | 'webp' | 'unknown', width: null, height: null }} ImageInfo
 */

/**
 * Read pixel dimensions from a PNG or JPEG header.
 * @param {Buffer} data file bytes (only the head is inspected)
 * @returns {ImageInfo | null} null when the bytes are not a recognizable image
 */
export function imageDimensions(data) {
  if (!Buffer.isBuffer(data) || data.length === 0) return null

  if (data.length >= 24 && data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    if (data.toString('ascii', 12, 16) !== 'IHDR') return { format: 'png', width: null, height: null }
    return { format: 'png', width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
  }

  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    const size = jpegDimensions(data)
    return size === null
      ? { format: 'jpeg', width: null, height: null }
      : { format: 'jpeg', width: size.width, height: size.height }
  }

  if (data.length >= 10 && data.subarray(0, 4).equals(GIF_SIGNATURE)) {
    return { format: 'gif', width: data.readUInt16LE(6), height: data.readUInt16LE(8) }
  }

  if (data.length >= 30 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = data.toString('ascii', 12, 16)
    if (chunk === 'VP8X' && data.length >= 30) {
      const width = 1 + data.readUIntLE(24, 3)
      const height = 1 + data.readUIntLE(27, 3)
      return { format: 'webp', width, height }
    }
    return { format: 'webp', width: null, height: null }
  }

  return null
}

/**
 * Walk JPEG segment markers to the first start-of-frame.
 * @param {Buffer} data
 * @returns {{ width: number, height: number } | null}
 */
function jpegDimensions(data) {
  let offset = 2
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = data[offset + 1]
    offset += 2
    if (marker === 0xd8 || marker === 0xd9) continue
    if (offset + 2 > data.length) return null
    const length = data.readUInt16BE(offset)
    if (length < 2 || offset + length > data.length) return null
    const isFrame = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    if (isFrame) {
      if (offset + 7 > data.length) return null
      return { height: data.readUInt16BE(offset + 3), width: data.readUInt16BE(offset + 5) }
    }
    offset += length
  }
  return null
}
