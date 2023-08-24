## xterm-wasm-parts

Project to hold wasm sources used in xterm.js. The npm package contains only the final wasm definitions and type declarations, and can be used like this:

```bash
$> yarn add -D xterm-wasm-parts
```

in your source code (example showing base64 decoder):

```typescript
import Base64Decoder from 'xterm-wasm-parts/lib/base64/Base64Decoder.wasm';
const b64Decoder = new Base64Decoder(123);   // keep memory if below 123 bytes
b64Decoder.init(3);                          // init decoder for 3 bytes (pulls wasm instance)
const data = new Uint8Array([65,65,65,65]);
b64Decoder.put(data, 0, 4);                  // == AAAA == \x00\x00\x00 decoded
b64Decoder.end();                            // end of chunk inputs
b64Decoder.data8;                            // --> Uint8Array(3) [ 0, 0, 0 ] == \x00\x00\x00
b64Decoder.release();                        // release memory if 123 exceeded
...
b64Decoder.init(3);                          // init decoder for next data to be decoded

```

Note that the wasm files are compiled as CJS, currently they will not work in TS projects set to ESM module output. This will change once `inwasm` has proper ESM support.
