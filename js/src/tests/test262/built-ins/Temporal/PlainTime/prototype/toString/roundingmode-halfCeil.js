// |reftest| shell-option(--enable-temporal) skip-if(!this.hasOwnProperty('Temporal')||!xulRuntime.shell) -- Temporal is not enabled unconditionally, requires shell-options
// Copyright (C) 2022 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.plaintime.prototype.tostring
description: halfCeil value for roundingMode option
features: [Temporal]
---*/

const time = new Temporal.PlainTime(12, 34, 56, 123, 987, 500);

const result1 = time.toString({ smallestUnit: "microsecond", roundingMode: "halfCeil" });
assert.sameValue(result1, "12:34:56.123988",
  "roundingMode is halfCeil (with 6 digits from smallestUnit)");

const result2 = time.toString({ fractionalSecondDigits: 6, roundingMode: "halfCeil" });
assert.sameValue(result2, "12:34:56.123988",
  "roundingMode is halfCeil (with 6 digits from fractionalSecondDigits)");

const result3 = time.toString({ smallestUnit: "millisecond", roundingMode: "halfCeil" });
assert.sameValue(result3, "12:34:56.124",
  "roundingMode is halfCeil (with 3 digits from smallestUnit)");

const result4 = time.toString({ fractionalSecondDigits: 3, roundingMode: "halfCeil" });
assert.sameValue(result4, "12:34:56.124",
  "roundingMode is halfCeil (with 3 digits from fractionalSecondDigits)");

const result5 = time.toString({ smallestUnit: "second", roundingMode: "halfCeil" });
assert.sameValue(result5, "12:34:56",
  "roundingMode is halfCeil (with 0 digits from smallestUnit)");

const result6 = time.toString({ fractionalSecondDigits: 0, roundingMode: "halfCeil" });
assert.sameValue(result6, "12:34:56",
  "roundingMode is halfCeil (with 0 digits from fractionalSecondDigits)");

const result7 = time.toString({ smallestUnit: "minute", roundingMode: "halfCeil" });
assert.sameValue(result7, "12:35", "roundingMode is halfCeil (round to minute)");

reportCompare(0, 0);
