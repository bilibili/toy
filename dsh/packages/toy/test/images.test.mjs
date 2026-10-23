import assert from 'node:assert/strict'
import { test } from 'node:test'

import { imageDimensions } from '../src/images.js'

function png(width, height) {
  const buffer = Buffer.alloc(33)
  buffer.write('89504e470d0a1a0a', 0, 'hex')
  buffer.writeUInt32BE(13, 8)
  buffer.write('IHDR', 12, 'ascii')
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

function jpeg(width, height) {
  // SOI + APP0-ish padding + SOF0 with the dimensions the reader must find.
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ])
}

test('reads PNG dimensions from the IHDR header', () => {
  assert.deepEqual(imageDimensions(png(1200, 900)), { format: 'png', width: 1200, height: 900 })
})

test('reads JPEG dimensions from the first start-of-frame marker', () => {
  assert.deepEqual(imageDimensions(jpeg(640, 480)), { format: 'jpeg', width: 640, height: 480 })
})

test('recognizes a GIF and a WEBP instead of pretending they are PNG/JPEG', () => {
  const gif = Buffer.alloc(10)
  gif.write('GIF89a', 0, 'ascii')
  gif.writeUInt16LE(32, 6)
  gif.writeUInt16LE(16, 8)
  assert.deepEqual(imageDimensions(gif), { format: 'gif', width: 32, height: 16 })
})

test('returns null for bytes that are not an image', () => {
  assert.equal(imageDimensions(Buffer.from('hello world')), null)
  assert.equal(imageDimensions(Buffer.alloc(0)), null)
  assert.equal(imageDimensions(null), null)
})
