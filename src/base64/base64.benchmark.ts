import { ThroughputRuntimeCase, perfContext } from 'xterm-benchmark';
import Base64Decoder from './Base64Decoder.wasm';
import Base64Encoder from './Base64Encoder.wasm';

// eslint-disable-next-line
declare const Buffer: any;

function toBytes(s: string): Uint8Array {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; ++i) {
    bytes[i] = s.charCodeAt(i) & 0xFF;
  }
  return bytes;
}

const d256 = 'ABCD'.repeat(64);
const d4096 = 'ABCD'.repeat(64 * 16);
const d65536 = 'ABCD'.repeat(64 * 16 * 16);
const d1M = 'ABCD'.repeat(64 * 16 * 16 * 16);
const b256   = toBytes(d256);
const b4096  = toBytes(d4096);
const b65536 = toBytes(d65536);
const b1M    = toBytes(d1M);
const dec = new Base64Decoder(4000000);
const enc = new Base64Encoder(4000000);

const RUNS = 100;

perfContext('Base64 - decode', () => {
  perfContext('Node - Buffer', () => {
    new ThroughputRuntimeCase('256', () => {
      Buffer.from(d256, 'base64');
      return { payloadSize: d256.length };
    }, { repeat: RUNS }).showAverageThroughput();

    new ThroughputRuntimeCase('4096', () => {
      Buffer.from(d4096, 'base64');
      return { payloadSize: d4096.length };
    }, { repeat: RUNS }).showAverageThroughput();

    new ThroughputRuntimeCase('65536', () => {
      Buffer.from(d65536, 'base64');
      return { payloadSize: d65536.length };
    }, { repeat: RUNS }).showAverageThroughput();

    new ThroughputRuntimeCase('1048576', () => {
      Buffer.from(d1M, 'base64');
      return { payloadSize: d1M.length };
    }, { repeat: RUNS }).showAverageThroughput();
  });

  perfContext('Base64Decoder', () => {
    new ThroughputRuntimeCase('256', () => {
      dec.init(192);
      dec.put(b256);
      dec.end();
      return { payloadSize: b256.length };
    }, { repeat: RUNS }).showAverageThroughput();

    new ThroughputRuntimeCase('4096', () => {
      dec.init(3072);
      dec.put(b4096);
      dec.end();
      return { payloadSize: b4096.length };
    }, { repeat: RUNS }).showAverageThroughput();

    new ThroughputRuntimeCase('65536', () => {
      dec.init(49152);
      dec.put(b65536);
      dec.end();
      return { payloadSize: b65536.length };
    }, { repeat: RUNS }).showAverageThroughput();

    new ThroughputRuntimeCase('1048576', () => {
      dec.init(786432);
      dec.put(b1M);
      dec.end();
      return { payloadSize: b1M.length };
    }, { repeat: RUNS }).showAverageThroughput();
  });
});

perfContext('Base64 - encode', () => {
  perfContext('Node - Buffer', () => {
    new ThroughputRuntimeCase('256', () => {
      const data = b256.subarray(0, 192);
      Buffer.from(data).toString('base64');
      return { payloadSize: data.length };
    }, { repeat: RUNS }).showAverageThroughput();

    new ThroughputRuntimeCase('4096', () => {
      const data = b4096.subarray(0, 3072);
      Buffer.from(data).toString('base64');
      return { payloadSize: data.length };
    }, { repeat: RUNS }).showAverageThroughput();

    new ThroughputRuntimeCase('65536', () => {
      const data = b65536.subarray(0, 49152);
      Buffer.from(data).toString('base64');
      return { payloadSize: data.length };
    }, { repeat: RUNS }).showAverageThroughput();

    new ThroughputRuntimeCase('1048576', () => {
      const data = b1M.subarray(0, 786432);
      Buffer.from(data).toString('base64');
      return { payloadSize: data.length };
    }, { repeat: RUNS }).showAverageThroughput();
  });
  
  perfContext('Base64Encoder', () => {
    new ThroughputRuntimeCase('256', () => {
      const data = b256.subarray(0, 192);
      enc.encode(data);
      return { payloadSize: data.length };
    }, { repeat: RUNS }).showAverageThroughput();

    new ThroughputRuntimeCase('4096', () => {
      const data = b4096.subarray(0, 3072);
      enc.encode(data);
      return { payloadSize: data.length };
    }, { repeat: RUNS }).showAverageThroughput();

    new ThroughputRuntimeCase('65536', () => {
      const data = b65536.subarray(0, 49152);
      enc.encode(data);
      return { payloadSize: data.length };
    }, { repeat: RUNS }).showAverageThroughput();

    new ThroughputRuntimeCase('1048576', () => {
      const data = b1M.subarray(0, 786432);
      enc.encode(data);
      return { payloadSize: data.length };
    }, { repeat: RUNS }).showAverageThroughput();
  });
});
