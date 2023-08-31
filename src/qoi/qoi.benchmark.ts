/**
 * Copyright (c) 2023 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import { ThroughputRuntimeCase, perfContext } from 'xterm-benchmark';
import QoiDecoder from './QoiDecoder.wasm';
import QoiEncoder from './QoiEncoder.wasm';

const qoiDecoder = new QoiDecoder(16777216);
const qoiEncoder = new QoiEncoder(16777216);

import * as fs from 'fs';
import * as path from 'path';
const EXAMPLE_QOI = new Uint8Array(fs.readFileSync(path.join('fixtures', 'qoi', 'wikipedia_008.qoi')));
const EXAMPLE_RAW = qoiDecoder.decode(EXAMPLE_QOI).slice();
const RUNS = 50;

perfContext('qoi - 1521134 bytes (1152x858 px)', () => {
  new ThroughputRuntimeCase('decode', () => {
    qoiDecoder.decode(EXAMPLE_QOI);
    qoiDecoder.release();
    return { payloadSize: 1521134 };
  }, { repeat: RUNS }).showAverageThroughput();

  new ThroughputRuntimeCase('encode', () => {
    qoiEncoder.encode(EXAMPLE_RAW, 1152, 858);
    qoiEncoder.release();
    return { payloadSize: 1521134 };
  }, { repeat: RUNS }).showAverageThroughput();
});
