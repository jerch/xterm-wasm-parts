/**
 * Copyright (c) 2023 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import * as assert from 'assert';
import Base64Decoder, { DecodeStatus } from './Base64Decoder.wasm';
import Base64Encoder from './Base64Encoder.wasm';

// eslint-disable-next-line
declare const Buffer: any;


// some helpers
function toBs(bytes: Uint8Array): string {
  let bs = '';
  for (let i = 0; i < bytes.length; ++i) bs += String.fromCharCode(bytes[i]);
  return bs;
}
function fromBs(bs: string): Uint8Array<ArrayBuffer> {
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
        dec.init(4);
        const inp = new Uint8Array([i]);
        const data = fromBs(encNative(inp));
        assert.strictEqual(dec.put(data), DecodeStatus.OK);
        assert.strictEqual(dec.end(), DecodeStatus.OK);
        assert.deepEqual(dec.data8, inp);
      }
    });
    for (let a = 0; a < 256; ++a) {
      it(`1+2 bytes (${a})`, function () {
        const dec = new Base64Decoder(0);
        for (let b = 0; b < 256; ++b) {
          dec.init(4);
          const inp = new Uint8Array([a, b]);
          const data = fromBs(encNative(inp));
          assert.strictEqual(dec.put(data), DecodeStatus.OK);
          assert.strictEqual(dec.end(), DecodeStatus.OK);
          assert.deepEqual(dec.data8, inp);
        }
      });
    }
    for (let a = 0; a < 256; ++a) {
      it(`2+3 bytes (${a})`, function () {
        const dec = new Base64Decoder(0);
        for (let b = 0; b < 256; ++b) {
          dec.init(4);
          const inp = new Uint8Array([0, a, b]);
          const data = fromBs(encNative(inp));
          assert.strictEqual(dec.put(data), DecodeStatus.OK);
          assert.strictEqual(dec.end(), DecodeStatus.OK);
          assert.deepEqual(dec.data8, inp);
        }
      });
    }
    for (let a = 0; a < 256; ++a) {
      it(`3+4 bytes (${a})`, function () {
        const dec = new Base64Decoder(0);
        for (let b = 0; b < 256; ++b) {
          dec.init(8);
          const inp = new Uint8Array([0, 0, a, b]);
          const data = fromBs(encNative(inp));
          assert.strictEqual(dec.put(data), DecodeStatus.OK);
          assert.strictEqual(dec.end(), DecodeStatus.OK);
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
        let enc = fromBs(encData[i]);
        dec.init(enc.length);
        assert.strictEqual(dec.put(enc), DecodeStatus.OK);
        assert.strictEqual(dec.end(), DecodeStatus.OK);
        assert.deepEqual(dec.data8, d.slice(0, i + 1));
        // w'o padding
        enc = fromBs(encDataTrimmed[i]);
        dec.init(enc.length);
        assert.strictEqual(dec.put(enc), DecodeStatus.OK);
        assert.strictEqual(dec.end(), DecodeStatus.OK);
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
          dec.init(8);
          inp[pos] = i;
          // note: explicitly allow '=' in last position
          assert.strictEqual(
            dec.put(inp) || dec.end(),
            MAP.includes(i) || (pos === 7 && i == 61)
              ? DecodeStatus.OK
              : DecodeStatus.DECODE_ERROR
          );
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
    it('keep 1 page (keepSize 65535)', () => {
      const dec = new Base64Decoder(65535);
      dec.init(512);
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
    it('realloc', () => {
      const DATA1 = new Uint8Array([66]);
      const dec = new Base64Decoder(0, 11, 1);
      dec.init(); // pulls values from ctor
      assert.strictEqual((dec as any)._bytes, 1);
      // write 1. byte
      assert.strictEqual(dec.put(DATA1), DecodeStatus.OK);
      assert.strictEqual((dec as any)._bytes, 1);
      // write 2. byte
      assert.strictEqual(dec.put(DATA1), DecodeStatus.OK);
      assert.strictEqual((dec as any)._bytes, 2);
      // write 3. & 4. byte
      assert.strictEqual(dec.put(DATA1), DecodeStatus.OK);
      assert.strictEqual((dec as any)._bytes, 4);
      assert.strictEqual(dec.put(DATA1), DecodeStatus.OK);
      assert.strictEqual((dec as any)._bytes, 4);
      // write 5. - 8. byte
      assert.strictEqual(dec.put(DATA1), DecodeStatus.OK);
      assert.strictEqual((dec as any)._bytes, 8);
      assert.strictEqual(dec.put(DATA1), DecodeStatus.OK);
      assert.strictEqual(dec.put(DATA1), DecodeStatus.OK);
      assert.strictEqual(dec.put(DATA1), DecodeStatus.OK);
      assert.strictEqual((dec as any)._bytes, 8);
      // 9. byte clamps to maxByte
      assert.strictEqual(dec.put(DATA1), DecodeStatus.OK);
      assert.strictEqual((dec as any)._bytes, 11);
      assert.strictEqual(dec.put(DATA1), DecodeStatus.OK);
      assert.strictEqual(dec.put(DATA1), DecodeStatus.OK);
      // 12. byte returns size error
      assert.strictEqual(dec.put(DATA1), DecodeStatus.SIZE_EXCEEDED);
      // end still works and gives correct result
      assert.strictEqual(dec.end(), DecodeStatus.OK);
      assert.deepEqual(dec.data8, Buffer.from('B'.repeat(11), 'base64'));
    });
    it('realloc with memory.grow', () => {
      const DATA = fromBs('B'.repeat(65536));
      // magic number 5152 - lower memory taken by LUT
      const dec = new Base64Decoder(0, 125000, 30192);  // 30192 = (65536 - 5152) / 2
      dec.init();
      assert.strictEqual((dec as any)._bytes, 30192);
      // writing 30192 bytes should not realloc
      assert.strictEqual(dec.put(DATA.subarray(0, 30192)), DecodeStatus.OK);
      assert.strictEqual((dec as any)._bytes, 30192);
      assert.strictEqual(dec.freeBytes, 125000-30192);
      // write next byte reallocs w'o grow
      assert.strictEqual(dec.put(DATA.subarray(0, 1)), DecodeStatus.OK);
      assert.strictEqual((dec as any)._bytes, 30192*2);
      assert.strictEqual(dec.freeBytes, 125000-30192-1);
      // writing 30192-1 bytes should not realloc
      assert.strictEqual(dec.put(DATA.subarray(0, 30192-1)), DecodeStatus.OK);
      assert.strictEqual((dec as any)._bytes, 30192*2);
      assert.strictEqual((dec as any)._mem.buffer.byteLength, 65536);
      assert.strictEqual(dec.freeBytes, 125000-30192-1-30192+1);
      // write next byte reallocs with grow
      assert.strictEqual(dec.put(DATA.subarray(0, 1)), DecodeStatus.OK);
      assert.strictEqual((dec as any)._bytes, 30192*4);
      assert.strictEqual((dec as any)._mem.buffer.byteLength, 65536*2);
      assert.strictEqual(dec.freeBytes, 125000-30192-1-30192+1-1);
      // don't grow beyond 125000
      assert.strictEqual(dec.put(DATA.subarray(0, 30192*2-1)), DecodeStatus.OK);
      assert.strictEqual((dec as any)._bytes, 30192*4);
      assert.strictEqual(dec.put(DATA.subarray(0, 1)), DecodeStatus.OK);
      assert.strictEqual((dec as any)._bytes, 125000);
      assert.strictEqual(dec.freeBytes, 125000-30192-1-30192+1-1-30192*2+1-1);
      // write to 125000
      assert.strictEqual(dec.put(DATA.subarray(0, dec.freeBytes)), DecodeStatus.OK);
      assert.strictEqual(dec.put(DATA.subarray(0, 1)), DecodeStatus.SIZE_EXCEEDED);
      assert.strictEqual(dec.end(), DecodeStatus.OK);
      assert.deepEqual(dec.data8, Buffer.from('B'.repeat(125000), 'base64'));
    });
  });
  describe('lifecycling & properties', () => {
    it('defaults', () => {
      const dec = new Base64Decoder();
      dec.init();
      assert.strictEqual(dec.freeBytes, 65535*65536);
      assert.strictEqual((dec as any)._bytes, 32768);
      assert.strictEqual(dec.keepSize, 1024*1024);
      dec.release();
      assert.notEqual((dec as any)._inst, null);
      dec.init();
      assert.strictEqual(dec.put(fromBs('B'.repeat(1024*1024+2))), DecodeStatus.OK);
      assert.strictEqual(dec.end(), DecodeStatus.OK);
      assert.deepEqual(dec.data8, Buffer.from('B'.repeat(1024*1024+2), 'base64'));
      assert.strictEqual(dec.loadedBytes, 1024*1024+2);
      assert.strictEqual(dec.freeBytes, 65535*65536-1024*1024-2);
      dec.release();
      assert.strictEqual((dec as any)._inst, null);
    });
    it('ctor args', () => {
      let dec = new Base64Decoder(1024, 128, 16);
      dec.init();
      assert.strictEqual(dec.freeBytes, 128);
      assert.strictEqual((dec as any)._bytes, 16);
      assert.strictEqual(dec.keepSize, 1024);
      dec = new Base64Decoder(undefined, undefined, undefined);
      dec.init();
      assert.strictEqual(dec.freeBytes, 65535*65536);
      assert.strictEqual((dec as any)._bytes, 32768);
      assert.strictEqual(dec.keepSize, 1024*1024);
    });
    it('initialBytes > maxBytes throws', () => {
      assert.throws(() => {new Base64Decoder(undefined, 16, 32)});
      assert.throws(() => {(new Base64Decoder()).init(16, 32)});
    });
    it('init args overwrite ctor args', () =>{
      let dec = new Base64Decoder();
      dec.init(32);
      assert.strictEqual(dec.freeBytes, 32);
      assert.strictEqual((dec as any)._bytes, 32);
      assert.strictEqual(dec.keepSize, 1024*1024);

      dec = new Base64Decoder();
      dec.init(32, 8);
      assert.strictEqual(dec.freeBytes, 32);
      assert.strictEqual((dec as any)._bytes, 8);
      assert.strictEqual(dec.keepSize, 1024*1024);

      dec = new Base64Decoder();
      dec.init(undefined, 8);
      assert.strictEqual(dec.freeBytes, 65535*65536);
      assert.strictEqual((dec as any)._bytes, 8);
      assert.strictEqual(dec.keepSize, 1024*1024);
    });
    it('old static behavior', () => {
      // maxBytes == initialBytes allocates all at once
      let dec = new Base64Decoder(undefined, 1024*1024, 1024*1024);
      dec.init();
      assert.strictEqual(
        (dec as any)._mem.buffer.byteLength / 65536,
        Math.ceil((1024 * 1024 + 5152) / 65536)
      );

      dec = new Base64Decoder();
      dec.init(1024*1024, 1024*1024);
      assert.strictEqual(
        (dec as any)._mem.buffer.byteLength / 65536,
        Math.ceil((1024 * 1024 + 5152) / 65536)
      );
      // keepSize == maxBytes == initialBytes retains everything w'o reallocation
      dec = new Base64Decoder(1024*1024, 1024*1024, 1024*1024);
      dec.init();
      assert.strictEqual(
        (dec as any)._mem.buffer.byteLength / 65536,
        Math.ceil((1024 * 1024 + 5152) / 65536)
      );
      dec.release();
      assert.notEqual((dec as any)._inst, null);

      dec = new Base64Decoder(1024*1024);
      dec.init(1024*1024, 1024*1024);
      assert.strictEqual(
        (dec as any)._mem.buffer.byteLength / 65536,
        Math.ceil((1024 * 1024 + 5152) / 65536)
      );
      dec.release();
      assert.notEqual((dec as any)._inst, null);
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
