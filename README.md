## xterm-wasm-parts

Project to hold wasm sources used in xterm.js. The npm package contains only the final wasm definitions and type declarations, thus can be used like this:

```bash
$> yarn add -D xterm-wasm-parts
```

and use in your source code like this:

```typescript
import Base64Decoder from 'xterm-wasm-parts/lib/base64/Base64Decoder.wasm';

...
const b64Decoder = new Base64Decoder(12345);
```

Note that the wasm files are currently compiled as CJS, currently they will not work in TS projects set to ESM module output. This will change once `inwasm` has proper ESM support.
