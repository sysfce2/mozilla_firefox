// |reftest| shell-option(--enable-temporal) skip-if(!this.hasOwnProperty('Temporal')||!xulRuntime.shell) -- Temporal is not enabled unconditionally, requires shell-options
// Copyright (C) 2022 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.instant.prototype.equals
description: UTC offset not valid with format that does not include a time
features: [Temporal]
---*/

const instance = new Temporal.Instant(0n);

const validStrings = [
  "1970-01-01T00Z",
  "1970-01-01T00Z[UTC]",
  "1970-01-01T00Z[!UTC]",
  "1970-01-01T00Z[Europe/Vienna]",
  "1970-01-01T00+00:00",
  "1970-01-01T00+00:00[UTC]",
  "1970-01-01T00+00:00[!UTC]",
  "1969-12-31T16-08:00[America/Vancouver]",
];

for (const arg of validStrings) {
  const result = instance.equals(arg);

  assert.sameValue(
    result,
    true,
    `"${arg}" is a valid UTC offset with time for Instant`
  );
}

const invalidStrings = [
  "2022-09-15Z",
  "2022-09-15Z[UTC]",
  "2022-09-15Z[Europe/Vienna]",
  "2022-09-15+00:00",
  "2022-09-15+00:00[UTC]",
  "2022-09-15-02:30",
  "2022-09-15-02:30[America/St_Johns]",
];

for (const arg of invalidStrings) {
  assert.throws(
    RangeError,
    () => instance.equals(arg),
    `"${arg}" UTC offset without time is not valid for Instant`
  );
}

reportCompare(0, 0);
