## xterm-wasm-parts

Project to hold wasm sources used in xterm.js. The npm package contains only the final wasm definitions and type declarations, and can be used like this:

```bash
$> yarn add -D xterm-wasm-parts
```

in your source code:

```typescript
import Base64Decoder from 'xterm-wasm-parts/lib/base64/Base64Decoder.wasm';
const b64Decoder = new Base64Decoder();
b64Decoder.init(3);                                   // init decoder for 3 bytes
b64Decoder.put(new Uint8Array([65,65,65,65]), 0, 4);  // == AAAA == \x00\x00\x00 decoded
b64Decoder.end();
b64Decoder.data8;
// --> Uint8Array(3) [ 0, 0, 0 ]
```

Note that the wasm files are compiled as CJS, currently they will not work in TS projects set to ESM module output. This will change once `inwasm` has proper ESM support.
