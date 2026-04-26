/**
 * Copyright (c) 2023, 2026 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import { InWasm, OutputMode, OutputType } from 'inwasm-runtime';


/**
 * Decoder return values.
 * Issue: Currently esbuild cannot pull const enum values from
 *        upstream packages, thus changing these values needs
 *        changes on downstream side as well.
 */
export const enum DecodeStatus {
  /**
   * No error.
   */
  OK = 0,
  /**
   * Error during base64 decoding.
   * Most likely caused by malformed base64 data.
   */
  DECODE_ERROR = -1,
  /**
   * Decoder is not initialized.
   */
  NOT_INITIALIZED = -2,
  /**
   * Memory needed exceeds `maxBytes`.
   */
  SIZE_EXCEEDED = -3
}


// memory addresses in uint32
const enum P32 {
  // 1. byte table
  D0 = 256,
  // 2. byte table
  D1 = 512,
  // 3. byte table
  D2 = 768,
  // 4. byte table
  D3 = 1024,
  // address of state struct
  STATE = 1280,
  // state.wp: end of base64 data
  STATE_WP = 1280,
  // state.sp: read position of base64 data
  STATE_SP = 1281,
  // state.dp: write position of decoded data
  STATE_DP = 1282,
  // state.e_size: max byte expected
  //STATE_ESIZE = 1283, // unused
  // state.data: data[0]
  STATE_DATA = 1288   // 16 byte aligned
}


/**
 * wasm base64 decoder.
 */

const wasmDecode = InWasm({
  name: 'decode',
  type: OutputType.INSTANCE,
  mode: OutputMode.SYNC,
  srctype: 'Clang-C',
  imports: {
    env: { memory: new WebAssembly.Memory({ initial: 1 }) }
  },
  exports: {
    dec: () => 0 as DecodeStatus,
    end: () => 0 as DecodeStatus
  },
  compile: {
    switches: ['-Wl,-z,stack-size=0', '-Wl,--stack-first']
  },
  code: `
    typedef struct {
      unsigned int wp;
      unsigned int sp;
      unsigned int dp;
      unsigned int e_size;
      unsigned int dummy[4];
      unsigned char data[0];
    } State;

    unsigned int *D0 = (unsigned int *) ${P32.D0*4};
    unsigned int *D1 = (unsigned int *) ${P32.D1*4};
    unsigned int *D2 = (unsigned int *) ${P32.D2*4};
    unsigned int *D3 = (unsigned int *) ${P32.D3*4};
    State *state = (State *) ${P32.STATE*4};

    __attribute__((noinline)) int dec() {
      unsigned int nsp = (state->wp - 1) & ~3;
      unsigned char *src = state->data + state->sp;
      unsigned char *end = state->data + nsp;
      unsigned char *dst = state->data + state->dp;
      unsigned int error = 0;

      // 4x loop unrolling (~30% speedup)
      // FIXME: investigate why zeroing the last bits of nsp does not always work here
      //        a temp fix is the line below, which always subtracts 16 from the end pointer
      //        this has a tiny penalty of always doing the last portion in 4-bytes
      //unsigned char *end16 = state->data + (nsp & ~15);
      unsigned char *end16 = state->data + nsp - 16;
      while (src < end16) {
        error |= *((unsigned int *)  dst   ) = D0[src[ 0]] | D1[src[ 1]] | D2[src[ 2]] | D3[src[ 3]];
        error |= *((unsigned int *) (dst+3)) = D0[src[ 4]] | D1[src[ 5]] | D2[src[ 6]] | D3[src[ 7]];
        error |= *((unsigned int *) (dst+6)) = D0[src[ 8]] | D1[src[ 9]] | D2[src[10]] | D3[src[11]];
        error |= *((unsigned int *) (dst+9)) = D0[src[12]] | D1[src[13]] | D2[src[14]] | D3[src[15]];
        dst += 12;
        src += 16;
      }

      // operate on 4-byte blocks
      while (src < end) {
        error |= *((unsigned int *) dst) = D0[src[0]] | D1[src[1]] | D2[src[2]] | D3[src[3]];
        dst += 3;
        src += 4;
      }

      // eval error state lazy (opportunistic, favors good over bad data)
      if (error >> 24) return -1;
      state->sp = nsp;
      state->dp = dst - state->data;
      return 0;
    }

    int end() {
      int rem = state->wp - state->sp;
      if (rem > 4 && dec()) return -1;
      rem = state->wp - state->sp;
      if (rem < 2) return -1;

      unsigned char *src = state->data + state->sp;
      if (rem == 4) {
        if (src[3] == 61) rem--;
        if (src[2] == 61) rem--;
      }
      unsigned int accu = D0[src[0]] | D1[src[1]];
      int dp = 1;
      if (rem > 2) {
        accu |= D2[src[2]];
        dp++;
        if (rem == 4) {
          accu |= D3[src[3]];
          dp++;
        }
      }
      if (accu >> 24) return -1;
      *((unsigned int *) (state->data + state->dp)) = accu;
      state->dp += dp;
      return 0;
    }
    `
});

// SIMD version (speedup ~1.4x, not covered by tests yet)
/*
const wasmDecode = InWasm({
  name: 'decode',
  type: OutputType.INSTANCE,
  mode: OutputMode.SYNC,
  srctype: 'Clang-C',
  imports: {
    env: { memory: new WebAssembly.Memory({ initial: 1 }) }
  },
  exports: {
    dec: () => 0,
    end: () => 0
  },
  compile: {
    switches: ['-msimd128', '-Wl,-z,stack-size=0', '-Wl,--stack-first']
  },
  code: `
    #include <wasm_simd128.h>
    typedef struct {
      unsigned int wp;
      unsigned int sp;
      unsigned int dp;
      unsigned int e_size;
      unsigned int dummy[4];
      unsigned char data[0];
    } State;

    unsigned int *D0 = (unsigned int *) ${P32.D0 * 4};
    unsigned int *D1 = (unsigned int *) ${P32.D1 * 4};
    unsigned int *D2 = (unsigned int *) ${P32.D2 * 4};
    unsigned int *D3 = (unsigned int *) ${P32.D3 * 4};
    State *state = (State *) ${P32.STATE * 4};

    #define packed_byte(x) wasm_i8x16_splat((char) x)
    #define packed_dword(x) wasm_i32x4_splat(x)
    #define masked(x, mask) wasm_v128_and(x, wasm_i32x4_splat(mask))

    __attribute__((noinline)) int dec() {
      unsigned int nsp = (state->wp - 1) & ~3;
      unsigned char *src = state->data + state->sp;
      unsigned char *end = state->data + nsp;
      unsigned char *dst = state->data + state->dp;
      unsigned int error = 0;

      v128_t err = wasm_i8x16_splat(0);
      unsigned char *end16 = state->data + (nsp & ~15);
      while (src < end16) {
        v128_t data = wasm_v128_load((v128_t *) src);

        // wasm-simd rewrite of http://0x80.pl/notesen/2016-01-17-sse-base64-decoding.html#vector-lookup-pshufb
        const v128_t higher_nibble = wasm_u32x4_shr(data, 4) & packed_byte(0x0f);
        const char linv = 1;
        const char hinv = 0;

        const v128_t lower_bound_LUT = wasm_i8x16_const(
          // order: 0 1 2 3 4 5 6 7 8 9 a b c d e f
          linv, linv, 0x2b, 0x30,
          0x41, 0x50, 0x61, 0x70,
          linv, linv, linv, linv,
          linv, linv, linv, linv
        );
        const v128_t upper_bound_LUT = wasm_i8x16_const(
          // order: 0 1 2 3 4 5 6 7 8 9 a b c d e f
          hinv, hinv, 0x2b, 0x39,
          0x4f, 0x5a, 0x6f, 0x7a,
          hinv, hinv, hinv, hinv,
          hinv, hinv, hinv, hinv
        );
        // the difference between the shift and lower bound
        const v128_t shift_LUT = wasm_i8x16_const(
          // order: 0 1 2 3 4 5 6 7 8 9 a b c d e f
          0x00,        0x00,        0x3e - 0x2b, 0x34 - 0x30,
          0x00 - 0x41, 0x0f - 0x50, 0x1a - 0x61, 0x29 - 0x70,
          0x00,        0x00,        0x00,        0x00,
          0x00,        0x00,        0x00,        0x00
        );

        const v128_t upper_bound = wasm_i8x16_swizzle(upper_bound_LUT, higher_nibble);
        const v128_t lower_bound = wasm_i8x16_swizzle(lower_bound_LUT, higher_nibble);

        const v128_t below = wasm_i8x16_lt(data, lower_bound);
        const v128_t above = wasm_i8x16_gt(data, upper_bound);
        const v128_t eq_2f = wasm_i8x16_eq(data, packed_byte(0x2f));

        // in_range = not (below or above) or eq_2f
        // outside  = not in_range = below or above and not eq_2f (from deMorgan law)
        const v128_t outside = wasm_v128_andnot(eq_2f, above | below);
        err = wasm_v128_or(err, outside);

        const v128_t shift  = wasm_i8x16_swizzle(shift_LUT, higher_nibble);
        const v128_t t0     = wasm_i8x16_add(data, shift);
        v128_t v = wasm_i8x16_add(t0, wasm_v128_and(eq_2f, packed_byte(-3)));

        // pack bytes
        const v128_t ca = masked(v, 0x003f003f);
        const v128_t db = masked(v, 0x3f003f00);
        const v128_t t00 = wasm_v128_or(wasm_u32x4_shr(db, 8), wasm_i32x4_shl(ca, 6));
        v128_t res = wasm_v128_or(wasm_u32x4_shr(t00, 16), wasm_i32x4_shl(t00, 12));
        res = wasm_i8x16_swizzle(res, wasm_i8x16_const(2, 1, 0, 6, 5, 4, 10, 9, 8, 14, 13, 12, 16, 16, 16, 16));

        wasm_v128_store((v128_t *) dst, res);
        dst += 12;
        src += 16;
      }
      //if (wasm_i8x16_bitmask(err) != 0) return -1;
      if (wasm_v128_any_true(err)) return -1;

      // operate on 4-byte blocks
      while (src < end) {
        error |= *((unsigned int *) dst) = D0[src[0]] | D1[src[1]] | D2[src[2]] | D3[src[3]];
        dst += 3;
        src += 4;
      }
      if (error >> 24) return -1;
      state->sp = nsp;
      state->dp = dst - state->data;
      return 0;
    }

    int end() {
      int rem = state->wp - state->sp;
      if (rem > 4 && dec()) return -1;
      rem = state->wp - state->sp;
      if (rem < 2) return -1;

      unsigned char *src = state->data + state->sp;
      if (rem == 4) {
        if (src[3] == 61) rem--;
        if (src[2] == 61) rem--;
      }
      unsigned int accu = D0[src[0]] | D1[src[1]];
      int dp = 1;
      if (rem > 2) {
        accu |= D2[src[2]];
        dp++;
        if (rem == 4) {
          accu |= D3[src[3]];
          dp++;
        }
      }
      if (accu >> 24) return -1;
      *((unsigned int *) (state->data + state->dp)) = accu;
      state->dp += dp;
      return 0;
    }
    `
});
*/


// base64 map
const MAP = new Uint8Array(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .split('')
    .map(el => el.charCodeAt(0))
);


// init decoder maps in LE order
const D = new Uint32Array(1024);
D.fill(0xFF000000);
for (let i = 0; i < MAP.length; ++i) D[MAP[i]] = i << 2;
for (let i = 0; i < MAP.length; ++i) D[256 + MAP[i]] = i >> 4 | ((i << 4) & 0xFF) << 8;
for (let i = 0; i < MAP.length; ++i) D[512 + MAP[i]] = (i >> 2) << 8 | ((i << 6) & 0xFF) << 16;
for (let i = 0; i < MAP.length; ++i) D[768 + MAP[i]] = i << 16;


const EMPTY = new Uint8Array(0);


/**
 * Some decoder defaults.
 */
const enum Bytes {
  /**
   * Default initial is <65536 to stay within one memory page.
   */
  INITIAL = 32768,
  /**
   * Max bytes is capped at 65535 memory pages
   * (one page reserved for LUTs).
   */
  MAX = 4294901760,
  /**
   * Default keep size in bytes.
   */
  KEEP = 1048576,

  // internal
  _DATA_OFFSET = P32.STATE_DATA * 4
}


/**
 * base64 stream decoder.
 *
 * Features / assumptions:
 * - lazy chunkwise decoding
 * - errors out on any non base64 chars (no support for NL formatted base64)
 * - decodes in wasm
 * - inplace decoding to save memory
 * - supports a keepSize for lazy memory release
 */
export default class Base64Decoder {
  private _d!: Uint8Array<ArrayBuffer>;
  private _m32!: Uint32Array<ArrayBuffer>;
  private _inst: ReturnType<typeof wasmDecode> | null = null;
  private _mem!: WebAssembly.Memory;
  private _ended = true;
  private _bytes = 0;
  public keepSize: number;
  public maxBytes: number;

  /**
   * @param keepSize Keep the wasm instance below this limit when calling `release()`.
   * @param maxBytes Max allowed bytes to allocate.
   * @param initialBytes Initial bytes to allocate.
   */
  constructor(keepSize?: number, maxBytes?: number, initialBytes?: number) {
    this.keepSize = keepSize ?? Bytes.KEEP;
    this.maxBytes = maxBytes ?? Bytes.MAX;
    this._bytes = initialBytes ?? Bytes.INITIAL;
    if (this._bytes > this.maxBytes || this.maxBytes > Bytes.MAX) {
      throw new Error('invalid byte settings');
    }
  }

  /**
   * Currently decoded bytes (borrowed).
   * Must be accessed before calling `release` or `init`.
   */
  public get data8(): Uint8Array<ArrayBuffer> {
    return this._inst ? this._d.subarray(0, this._m32[P32.STATE_DP]) : EMPTY;
  }

  /**
   * Release memory conditionally based on `keepSize`.
   * If memory gets released, also the wasm instance will be freed and recreated on next `init`,
   * otherwise the instance will be reused.
   */
  public release(): void {
    if (!this._inst) return;
    if (this._bytes > this.keepSize) {
      this._inst = this._m32 = this._d = this._mem = null!;
    } else {
      this._m32[P32.STATE_WP] = 0;
      this._m32[P32.STATE_SP] = 0;
      this._m32[P32.STATE_DP] = 0;
    }
  }

  /**
   * Initializes the decoder for new base64 data.
   * Must be called before doing any decoding attempts.
   * The method will either spawn a new wasm instance or grow
   * the needed memory of an existing instance.
   * @param maxBytes Max allowed bytes to allocate (overwrites ctor value).
   * @param initialBytes Initial bytes to allocate (overwrites ctor value).
   */
  public init(maxBytes?: number, initialBytes?: number): void {
    this.maxBytes = maxBytes ?? this.maxBytes;
    this._bytes = initialBytes ?? Math.min(this._bytes, this.maxBytes);
    if (this._bytes > this.maxBytes || this.maxBytes > Bytes.MAX) {
      throw Error('invalid byte settings');
    }

    let m = this._m32;
    const bytes = this._bytes + Bytes._DATA_OFFSET;
    if (!this._inst) {
      this._mem = new WebAssembly.Memory({ initial: Math.ceil(bytes / 65536) });
      this._inst = wasmDecode({ env: { memory: this._mem } });
      m = new Uint32Array(this._mem.buffer, 0);
      m.set(D, P32.D0);
      this._d = new Uint8Array(this._mem.buffer, Bytes._DATA_OFFSET);
    } else if (this._mem.buffer.byteLength < bytes) {
      this._mem.grow(Math.ceil((bytes - this._mem.buffer.byteLength) / 65536));
      m = new Uint32Array(this._mem.buffer, 0);
      this._d = new Uint8Array(this._mem.buffer, Bytes._DATA_OFFSET);
    }
    m[P32.STATE_WP] = 0;
    m[P32.STATE_SP] = 0;
    m[P32.STATE_DP] = 0;
    this._m32 = m;
    this._ended = false;
  }

  /**
   * Realloc memory. Realloc only happens, if the requested
   * size doesn't fit in the current memory.
   * The new size will be capped by `maxBytes`.
   * @param requested Bytes to be stored.
   */
  private _realloc(requested: number): DecodeStatus {
    const needed = this._m32[P32.STATE_WP] + requested;
    if (this._bytes < needed) {
      if (needed > this.maxBytes) {
        return DecodeStatus.SIZE_EXCEEDED;
      }
      let newSize = this._bytes;
      while ((newSize *= 2) < needed) {}
      newSize = Math.min(newSize, this.maxBytes);
      if (newSize < needed) {
        return DecodeStatus.SIZE_EXCEEDED;
      }
      if (newSize + Bytes._DATA_OFFSET > this._mem.buffer.byteLength) {
        const addPages = Math.ceil((newSize + Bytes._DATA_OFFSET - this._mem.buffer.byteLength) / 65536);
        this._mem.grow(addPages);
        this._m32 = new Uint32Array(this._mem.buffer, 0);
        this._d = new Uint8Array(this._mem.buffer, Bytes._DATA_OFFSET);
      }
      this._bytes = newSize;
    }
    return DecodeStatus.OK;
  }

  /**
   * Put bytes in `data` into the decoder.
   * Additionally decodes the payload, if it reached 2^17 bytes.
   * The return value indicates the type of issue.
   * @param data Bytes to be loaded.
   */
  public put(data: Uint8Array | Uint16Array | Uint32Array): DecodeStatus {
    if (!this._inst || this._ended) {
      return DecodeStatus.NOT_INITIALIZED;
    }
    if (this._realloc(data.length)){
      return DecodeStatus.SIZE_EXCEEDED;
    }
    const m = this._m32;
    this._d.set(data, m[P32.STATE_WP]);
    m[P32.STATE_WP] += data.length;
    // max chunk in input handler is 2^17, try to run in "tandem mode"
    return m[P32.STATE_WP] - m[P32.STATE_SP] >= 131072
      ? this._inst.exports.dec()
      : DecodeStatus.OK;
  }

  /**
   * End the current decoding.
   * Also decodes leftover payload from previous put calls.
   */
  public end(): DecodeStatus {
    this._ended = true;
    return this._inst
      ? this._inst.exports.end()
      : DecodeStatus.NOT_INITIALIZED;
  }

  /**
   * Bytes loaded into the decoder.
   */
  public get loadedBytes(): number {
    return this._inst
      ? this._m32[P32.STATE_WP]
      : 0;
  }

  /**
   * Free bytes to feed to the decoder.
   */
  public get freeBytes(): number {
    return this._inst
      ? this.maxBytes - this._m32[P32.STATE_WP]
      : 0;
  }
}
