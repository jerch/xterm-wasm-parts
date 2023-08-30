/**
 * Copyright (c) 2023 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import { InWasm, OutputMode, OutputType } from 'inwasm';

const enum P8 {
  LUT_P = 1024,
  DST_P = 9216
};

const wasmEncode = InWasm({
  name: 'encode',
  type: OutputType.INSTANCE,
  mode: OutputMode.SYNC,
  srctype: 'Clang-C',
  imports: {
    env: { memory: new WebAssembly.Memory({ initial: 1 }) }
  },
  exports: {
    enc: (src: number, length: number) => 0
  },
  compile: {
    switches: ['-Wl,-z,stack-size=0', '-Wl,--stack-first']
  },
  code: `
    static unsigned short PAD = 0x3D3D; // ==
    unsigned short *LUT = (unsigned short *) ${P8.LUT_P};

    void* enc(unsigned char *src, int length) {
      unsigned char *dst = (unsigned char *) ${P8.DST_P};

      unsigned char *src_end3 = src + length - 2;
      unsigned int accu;

      // 4x loop unrolling (~25% speedup)
      unsigned char *src_end12 = src + length - 11;
      while (src < src_end12) {
        accu = src[0] << 16 | src[1] << 8 | src[2];
        *((unsigned short *) dst) = LUT[ accu >> 12 ];
        *((unsigned short *) (dst+2)) = LUT[ accu & 0xFFF ];

        accu = src[3] << 16 | src[4] << 8 | src[5];
        *((unsigned short *) (dst+4)) = LUT[ accu >> 12 ];
        *((unsigned short *) (dst+6)) = LUT[ accu & 0xFFF ];

        accu = src[6] << 16 | src[7] << 8 | src[8];
        *((unsigned short *) (dst+8)) = LUT[ accu >> 12 ];
        *((unsigned short *) (dst+10)) = LUT[ accu & 0xFFF ];

        accu = src[9] << 16 | src[10] << 8 | src[11];
        *((unsigned short *) (dst+12)) = LUT[ accu >> 12 ];
        *((unsigned short *) (dst+14)) = LUT[ accu & 0xFFF ];

        src += 12;
        dst += 16;
      }

      // operate in 3-byte blocks
      while (src < src_end3) {
        accu = src[0] << 16 | src[1] << 8 | src[2];
        *((unsigned short *) dst) = LUT[ accu >> 12 ];
        *((unsigned short *) (dst+2)) = LUT[ accu & 0xFFF ];
        src += 3;
        dst += 4;
      }

      // tail handling with padding
      int pad = src_end3 + 2 - src;
      if (pad == 2) {
        accu = src[0] << 10 | src[1] << 2;
        *((unsigned short *) dst) = LUT[ accu >> 6 ];
        *((unsigned short *) (dst+2)) = PAD & 0xFF00 | LUT[accu & 0x3F] >> 8;
        dst += 4;
      } else if (pad == 1) {
        *((unsigned short *) dst) = LUT[ src[0] << 4 ];
        *((unsigned short *) (dst+2)) = PAD;
        dst += 4;
      }

      return dst;
    }
    `
});

// SIMD version (speedup ~1.6x, not covered by tests yet)
/*
const wasmEncode = InWasm({
  name: 'encode',
  type: OutputType.INSTANCE,
  mode: OutputMode.SYNC,
  srctype: 'Clang-C',
  imports: {
    env: { memory: new WebAssembly.Memory({ initial: 1 }) }
  },
  exports: {
    enc: (src: number, length: number) => 0
  },
  compile: {
    switches: ['-msimd128', '-Wl,-z,stack-size=0', '-Wl,--stack-first']
  },
  code: `
    #include <wasm_simd128.h>

    static unsigned short PAD = 0x3D3D; // ==
    unsigned short *LUT = (unsigned short *) ${P8.LUT_P};

    void* enc(unsigned char *src, int length) {
      unsigned char *dst = (unsigned char *) ${P8.DST_P};

      unsigned char *src_end3 = src + length - 2;
      unsigned int accu;

      unsigned char *src_end12 = src + length - 15;
      while (src < src_end12) {
        v128_t v1 = wasm_v128_load((v128_t *) src);

        // unpack
        v128_t v2 = wasm_i8x16_swizzle(v1, wasm_i8x16_const(1, 0, 2, 1, 4, 3, 5, 4, 7, 6, 8, 7, 10, 9, 11, 10));
        v128_t index_a = wasm_v128_and(wasm_u32x4_shr(v2, 10), wasm_i32x4_splat(0x0000003f));
        v128_t index_b = wasm_v128_and(wasm_i32x4_shl(v2, 4),  wasm_i32x4_splat(0x00003f00));
        v128_t index_c = wasm_v128_and(wasm_u32x4_shr(v2, 6),  wasm_i32x4_splat(0x003f0000));
        v128_t index_d = wasm_v128_and(wasm_i32x4_shl(v2, 8),  wasm_i32x4_splat(0x3f000000));
        v128_t a_b = wasm_v128_or(index_a, index_b);
        v128_t c_d = wasm_v128_or(index_c, index_d);
        v128_t indices = wasm_v128_or(a_b, c_d);

        // lookup with pshufb improved variant
        // see http://0x80.pl/notesen/2016-01-12-sse-base64-encoding.html#sse-version
        v128_t result = wasm_u8x16_sub_sat(indices, wasm_i8x16_splat(51));
        const v128_t less = wasm_i8x16_gt(wasm_i8x16_splat(26), indices);
        result = wasm_v128_or(result, wasm_v128_and(less, wasm_i8x16_splat(13)));
        const v128_t shift_LUT = wasm_i8x16_const(
            'a' - 26, '0' - 52, '0' - 52, '0' - 52,
            '0' - 52, '0' - 52, '0' - 52, '0' - 52,
            '0' - 52, '0' - 52, '0' - 52, '+' - 62,
            '/' - 63,      'A',        0,        0
        );
        result = wasm_i8x16_swizzle(shift_LUT, result);
        result = wasm_i8x16_add(result, indices);

        wasm_v128_store((v128_t *) dst, result);
        src += 12;
        dst += 16;
      }

      // operate in 3-byte blocks
      while (src < src_end3) {
        accu = src[0] << 16 | src[1] << 8 | src[2];
        *((unsigned short *) dst) = LUT[ accu >> 12 ];
        *((unsigned short *) (dst+2)) = LUT[ accu & 0xFFF ];
        src += 3;
        dst += 4;
      }

      // tail handling with padding
      int pad = src_end3 + 2 - src;
      if (pad == 2) {
        accu = src[0] << 10 | src[1] << 2;
        *((unsigned short *) dst) = LUT[ accu >> 6 ];
        *((unsigned short *) (dst+2)) = PAD & 0xFF00 | LUT[accu & 0x3F] >> 8;
        dst += 4;
      } else if (pad == 1) {
        *((unsigned short *) dst) = LUT[ src[0] << 4 ];
        *((unsigned short *) (dst+2)) = PAD;
        dst += 4;
      }

      return dst;
    }
    `
});
*/

type WasmEncodeType = ReturnType<typeof wasmEncode>;

// base64 map
const MAP = new Uint8Array(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .split('')
    .map(el => el.charCodeAt(0))
);

const LUT = new Uint16Array(4096);
for (let i = 0; i < MAP.length; ++i) {
  const ii = i * 64;
  for (let k = 0; k < MAP.length; ++k) {
    LUT[ii + k] = MAP[k] << 8 | MAP[i];
  }
}


/**
 * Base64 Encoder
 *
 * Other than the decoder, the encoder does not work chunkwise.
 * To simulate chunkwise encoding, split the data source in multiples of 3 bytes
 * and concat the output afterwards.
 *
 * The implementation uses a 16-bit LUT to map 12 input bits to 2 base64 digits
 * roughly doubling the throughput compared to a simple scalar implementation.
 */
export default class Base64Encoder {
  private _inst!: WasmEncodeType;
  private _mem!: WebAssembly.Memory;
  private _d!: Uint8Array;

  constructor(public keepSize: number) {}

  /**
   * Encode bytes in `d` as base64.
   * Returns encoded byte array (borrowed).
   */
  public encode(d: Uint8Array): Uint8Array {
    const bytes = Math.ceil(d.length * 1.4) + P8.DST_P;
    if (!this._inst) {
      this._mem = new WebAssembly.Memory({ initial: Math.ceil(bytes / 65536) });
      (new Uint16Array(this._mem.buffer)).set(LUT, P8.LUT_P/2);
      this._inst = wasmEncode({ env: { memory: this._mem }});
    } else if (this._mem.buffer.byteLength < bytes) {
      this._mem.grow(Math.ceil((bytes - this._mem.buffer.byteLength) / 65536));
      this._d = null!;
    }
    if (!this._d) {
      this._d = new Uint8Array(this._mem.buffer);
    }
    // put src data at the end of memory, also align to 256
    const chunkP = (this._mem.buffer.byteLength - d.length) & ~0xFF;
    this._d.set(d, chunkP);
    const end = this._inst.exports.enc(chunkP, d.length);
    return this._d.subarray(P8.DST_P, end);
  }

  /**
   * Release memory conditionally based on `keepSize`.
   * If memory gets released, also the wasm instance will be freed and recreated on next `encode`,
   * otherwise the instance will be reused.
   */
  public release(): void {
    if (!this._inst) return;
    if (this._mem.buffer.byteLength > this.keepSize) {
      this._inst = this._d = this._mem = null!;
    }
  }
}
