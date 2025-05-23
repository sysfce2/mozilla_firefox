// Copyright 2024 Mathias Bynens. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Mathias Bynens
description: >
  Unicode property escapes for `Unified_Ideograph`
info: |
  Generated by https://github.com/mathiasbynens/unicode-property-escapes-tests
  Unicode v16.0.0
esid: sec-static-semantics-unicodematchproperty-p
features: [regexp-unicode-property-escapes]
includes: [regExpUtils.js]
---*/

const matchSymbols = buildString({
  loneCodePoints: [
    0x00FA11,
    0x00FA1F,
    0x00FA21
  ],
  ranges: [
    [0x003400, 0x004DBF],
    [0x004E00, 0x009FFF],
    [0x00FA0E, 0x00FA0F],
    [0x00FA13, 0x00FA14],
    [0x00FA23, 0x00FA24],
    [0x00FA27, 0x00FA29],
    [0x020000, 0x02A6DF],
    [0x02A700, 0x02B739],
    [0x02B740, 0x02B81D],
    [0x02B820, 0x02CEA1],
    [0x02CEB0, 0x02EBE0],
    [0x02EBF0, 0x02EE5D],
    [0x030000, 0x03134A],
    [0x031350, 0x0323AF]
  ]
});
testPropertyEscapes(
  /^\p{Unified_Ideograph}+$/u,
  matchSymbols,
  "\\p{Unified_Ideograph}"
);
testPropertyEscapes(
  /^\p{UIdeo}+$/u,
  matchSymbols,
  "\\p{UIdeo}"
);

const nonMatchSymbols = buildString({
  loneCodePoints: [
    0x00FA10,
    0x00FA12,
    0x00FA20,
    0x00FA22
  ],
  ranges: [
    [0x00DC00, 0x00DFFF],
    [0x000000, 0x0033FF],
    [0x004DC0, 0x004DFF],
    [0x00A000, 0x00DBFF],
    [0x00E000, 0x00FA0D],
    [0x00FA15, 0x00FA1E],
    [0x00FA25, 0x00FA26],
    [0x00FA2A, 0x01FFFF],
    [0x02A6E0, 0x02A6FF],
    [0x02B73A, 0x02B73F],
    [0x02B81E, 0x02B81F],
    [0x02CEA2, 0x02CEAF],
    [0x02EBE1, 0x02EBEF],
    [0x02EE5E, 0x02FFFF],
    [0x03134B, 0x03134F],
    [0x0323B0, 0x10FFFF]
  ]
});
testPropertyEscapes(
  /^\P{Unified_Ideograph}+$/u,
  nonMatchSymbols,
  "\\P{Unified_Ideograph}"
);
testPropertyEscapes(
  /^\P{UIdeo}+$/u,
  nonMatchSymbols,
  "\\P{UIdeo}"
);

reportCompare(0, 0);
