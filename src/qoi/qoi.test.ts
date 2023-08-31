/**
 * Copyright (c) 2023 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import * as assert from 'assert';
import QoiDecoder from './QoiDecoder.wasm';
import QoiEncoder from './QoiEncoder.wasm';
import * as fs from 'fs';
import * as path from 'path';

const FIXTUREPATH = path.join('fixtures', 'qoi');
const PALETTE_BLOB = path.join(FIXTUREPATH, 'palette.blob');

const TESTFILES: [string, [number, number]][] = [
  ['dice.qoi', [800, 600]],
  ['edgecase.qoi', [256, 64]],
  ['kodim10.qoi', [512, 768]],
  ['kodim23.qoi', [768, 512]],
  ['qoi_logo.qoi', [448, 220]],
  ['testcard.qoi', [256, 256]],
  ['testcard_rgba.qoi', [256, 256]],
  ['wikipedia_008.qoi', [1152, 858]]
];

const qoiDecoder = new QoiDecoder(1048576);
const qoiEncoder = new QoiEncoder(1048576);

describe('qoi - encode/decode cycling', () => {
  it('palette.blob', () => {
    const pixelData = new Uint8Array(fs.readFileSync(PALETTE_BLOB));
    const rgbData = qoiEncoder.encode(pixelData, 640, 80);
    const rgbDecoded = qoiDecoder.decode(rgbData);
    assert.strictEqual(qoiDecoder.width, 640);
    assert.strictEqual(qoiDecoder.height, 80);
    assert.strictEqual(rgbDecoded.length, pixelData.length);
    assert.deepStrictEqual(rgbDecoded, pixelData);
    assert.strictEqual(rgbData[12], 4);
  });
  for (const [filename, [width, height]] of TESTFILES) {
    it(`testfile - ${filename}`, () => {
      const orig = new Uint8Array(fs.readFileSync(path.join(FIXTUREPATH, filename)));
      const decoded = qoiDecoder.decode(orig).slice();
      assert.strictEqual(qoiDecoder.width, width);
      assert.strictEqual(qoiDecoder.height, height);
      const encoded = qoiEncoder.encode(decoded, width, height);
      const decoded2 = qoiDecoder.decode(encoded).slice();
      assert.strictEqual(qoiDecoder.width, width);
      assert.strictEqual(qoiDecoder.height, height);
      assert.deepStrictEqual(decoded2, decoded);
    });
  }
});
