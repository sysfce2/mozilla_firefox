// |reftest| shell-option(--enable-temporal) skip-if(!this.hasOwnProperty('Temporal')||!xulRuntime.shell) -- Temporal is not enabled unconditionally, requires shell-options
// Copyright (C) 2022 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.duration.prototype.tostring
description: Properties on objects passed to toString() are accessed in the correct order
includes: [compareArray.js, temporalHelpers.js]
features: [Temporal]
---*/

const expected = [
  "get options.fractionalSecondDigits",
  "get options.fractionalSecondDigits.toString",
  "call options.fractionalSecondDigits.toString",
  "get options.roundingMode",
  "get options.roundingMode.toString",
  "call options.roundingMode.toString",
  "get options.smallestUnit",
];
const actual = [];

const instance = new Temporal.Duration(1, 1, 1, 1, 1, 1, 1, 1, 1, 1);

const expectedForSmallestUnit = expected.concat([
  "get options.smallestUnit.toString",
  "call options.smallestUnit.toString",
]);

instance.toString(
  TemporalHelpers.propertyBagObserver(actual, {
    fractionalSecondDigits: "auto",
    roundingMode: "halfExpand",
    smallestUnit: "millisecond",
  }, "options"),
);
assert.compareArray(actual, expectedForSmallestUnit, "order of operations");
actual.splice(0); // clear

instance.toString(
  TemporalHelpers.propertyBagObserver(actual, {
    fractionalSecondDigits: "auto",
    roundingMode: "halfExpand",
    smallestUnit: undefined,
  }, "options"),
);
assert.compareArray(actual, expected, "order of operations with smallestUnit undefined");

reportCompare(0, 0);
