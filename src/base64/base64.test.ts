/**
 * Copyright (c) 2023 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import * as assert from 'assert';
import Base64Decoder from './Base64Decoder.wasm';
import Base64Encoder from './Base64Encoder.wasm';

// eslint-disable-next-line
declare const Buffer: any;


// some helpers
function toBs(bytes: Uint8Array): string {
  let bs = '';
  for (let i = 0; i < bytes.length; ++i) bs += String.fromCharCode(bytes[i]);
  return bs;
}
function fromBs(bs: string): Uint8Array {
  const r = new Uint8Array(bs.length);
  for (let i = 0; i < r.length; ++i) r[i] = bs.charCodeAt(i);
  return r;
}
function encNative(bytes: Uint8Array): string {
  return typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : btoa(toBs(bytes));
}
function rtrim(x: string, c: string): string {
  let end = x.length - 1;
  while (c.indexOf(x[end]) >= 0) end -= 1;
  return x.slice(0, end + 1);
}
const MAP = new Uint8Array(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .split('')
    .map(el => el.charCodeAt(0))
);


describe('Base64Decoder', () => {
  describe('decoding', () => {
    it('single bytes', function () {
      this.timeout(20000);
      const dec = new Base64Decoder(0);
      for (let i = 0; i < 256; ++i) {
        dec.init(1);
        const inp = new Uint8Array([i]);
        const data = fromBs(encNative(inp));
        assert.strictEqual(dec.put(data), 0);
        assert.strictEqual(dec.end(), 0);
        assert.deepEqual(dec.data8, inp);
      }
    });
    for (let a = 0; a < 256; ++a) {
      it(`1+2 bytes (${a})`, function () {
        const dec = new Base64Decoder(0);
        for (let b = 0; b < 256; ++b) {
          dec.init(2);
          const inp = new Uint8Array([a, b]);
          const data = fromBs(encNative(inp));
          assert.strictEqual(dec.put(data), 0);
          assert.strictEqual(dec.end(), 0);
          assert.deepEqual(dec.data8, inp);
        }
      });
    }
    for (let a = 0; a < 256; ++a) {
      it(`2+3 bytes (${a})`, function () {
        const dec = new Base64Decoder(0);
        for (let b = 0; b < 256; ++b) {
          dec.init(3);
          const inp = new Uint8Array([0, a, b]);
          const data = fromBs(encNative(inp));
          assert.strictEqual(dec.put(data), 0);
          assert.strictEqual(dec.end(), 0);
          assert.deepEqual(dec.data8, inp);
        }
      });
    }
    for (let a = 0; a < 256; ++a) {
      it(`3+4 bytes (${a})`, function () {
        const dec = new Base64Decoder(0);
        for (let b = 0; b < 256; ++b) {
          dec.init(4);
          const inp = new Uint8Array([0, 0, a, b]);
          const data = fromBs(encNative(inp));
          assert.strictEqual(dec.put(data), 0);
          assert.strictEqual(dec.end(), 0);
          assert.deepEqual(dec.data8, inp);
        }
      });
    }
    it('padding', () => {
      const dec = new Base64Decoder(0);
      const d = fromBs('Hello, here comes the mouse');
      const encData = [];
      const encDataTrimmed = [];
      for (let i = 1; i < d.length; ++i) {
        encData.push(encNative(d.slice(0, i)));
        encDataTrimmed.push(rtrim(encNative(d.slice(0, i)), '='));
      }
      for (let i = 0; i < encData.length; ++i) {
        // with padding
        dec.init(i + 1);
        let enc = fromBs(encData[i]);
        assert.strictEqual(dec.put(enc), 0);
        assert.strictEqual(dec.end(), 0);
        assert.deepEqual(dec.data8, d.slice(0, i + 1));
        // w'o padding
        dec.init(i + 1);
        enc = fromBs(encDataTrimmed[i]);
        assert.strictEqual(dec.put(enc), 0);
        assert.strictEqual(dec.end(), 0);
        assert.deepEqual(dec.data8, d.slice(0, i + 1));
      }
    });
    it('exit on false byte', function () {
      this.timeout(20000);
      const dec = new Base64Decoder(0);
      for (let pos = 0; pos < 8; ++pos) {
        const inp = new Uint8Array([65, 65, 65, 65, 65, 65, 65, 65]);
        for (let i = 0; i < 256; ++i) {
          dec.release();
          dec.init(6);
          inp[pos] = i;
          // note: explicitly allow '=' in last position
          assert.strictEqual(dec.put(inp) || dec.end(), MAP.includes(i) || (pos === 7 && i == 61) ? 0 : 1);
        }
      }
    });
  });
  describe('memory', () => {
    it('always release (keepSize 0)', () => {
      const dec = new Base64Decoder(0);
      dec.init(16);
      dec.put(fromBs('A'.repeat(16)));
      dec.end();
      assert.strictEqual(dec.data8.length, 12);
      dec.release();
      assert.strictEqual(dec.data8.length, 0);
      assert.strictEqual((dec as any)._mem, null);
    });
    it('keep 1 page (keepSize 65536)', () => {
      const dec = new Base64Decoder(65536);
      dec.init(384);
      dec.put(fromBs('A'.repeat(512)));
      dec.end();
      assert.strictEqual(dec.data8.length, 384);
      dec.release();
      assert.strictEqual(dec.data8.length, 0);
      assert.notStrictEqual((dec as any)._mem, null);
      // grow to 2 pages + free afterwards
      dec.init(65536);
      dec.put(fromBs('A'.repeat(65536)));
      dec.end();
      assert.strictEqual(dec.data8.length, 49152);
      dec.release();
      assert.strictEqual(dec.data8.length, 0);
      assert.strictEqual((dec as any)._mem, null);
    });
  });
});


describe('Base64Encoder', () => {
  it('1-byte and padding', () => {
    const enc = new Base64Encoder(65536);
    for (let a = 0; a < 256; ++a) {
      const data = [a];
      const r1 = Buffer.from(enc.encode(new Uint8Array(data))).toString();
      const r2 = Buffer.from(data).toString('base64');
      assert.strictEqual(r1, r2);
    }
  });
  it('2-bytes and padding', () => {
    const enc = new Base64Encoder(65536);
    for (let a = 0; a < 256; ++a) {
      for (let b = 0; b < 256; ++b) {
        const data = [a, b];
        const r1 = Buffer.from(enc.encode(new Uint8Array(data))).toString();
        const r2 = Buffer.from(data).toString('base64');
        assert.strictEqual(r1, r2);
      }
    }
  });
  describe('3-byte blocks (full block range)', () => {
    const enc = new Base64Encoder(65536);
    for (let a = 0; a < 256; ++a) {
      it(`[${a}, b, c]`, () => {
        for (let b = 0; b < 256; ++b) {
          for (let c = 0; c < 256; ++c) {
            const data = [c, b, a];
            const r1 = Buffer.from(enc.encode(new Uint8Array(data))).toString();
            const r2 = Buffer.from(data).toString('base64');
            assert.strictEqual(r1, r2);
          }
        }
      });
    }
  });
  it('4-bytes (1 block + 1 byte)', () => {
    const enc = new Base64Encoder(65536);
    const DATA = [
      [0, 0, 0, 0],
      [1, 2, 3, 4],
      [255, 0, 0, 0],
      [0, 255, 0, 0],
      [0, 0, 255, 0],
      [0, 0, 0, 255],
      [255, 255, 255, 255]
    ];
    for (const data of DATA) {
      const r1 = Buffer.from(enc.encode(new Uint8Array(data))).toString();
      const r2 = Buffer.from(data).toString('base64');
      assert.strictEqual(r1, r2);
    }
  });
  it('13-bytes (4 blocks + 1 byte)', () => {
    const enc = new Base64Encoder(65536);
    const DATA = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255]
    ];
    for (const data of DATA) {
      const r1 = Buffer.from(enc.encode(new Uint8Array(data))).toString();
      const r2 = Buffer.from(data).toString('base64');
      assert.strictEqual(r1, r2);
    }
  });
});
