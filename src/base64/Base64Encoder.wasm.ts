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

      int pad = length % 3;
      length -= pad;

      unsigned char *src_end3 = src + length;
      unsigned int accu;

      // 4x loop unrolling (~25% speedup)
      unsigned char *src_end12 = src_end3 - 12;
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

      while (src < src_end3) {
        accu = src[0] << 16 | src[1] << 8 | src[2];
        *((unsigned short *) dst) = LUT[ accu >> 12 ];
        *((unsigned short *) (dst+2)) = LUT[ accu & 0xFFF ];
        src += 3;
        dst += 4;
      }

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
