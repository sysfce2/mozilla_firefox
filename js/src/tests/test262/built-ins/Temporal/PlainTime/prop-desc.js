// |reftest| shell-option(--enable-temporal) skip-if(!this.hasOwnProperty('Temporal')||!xulRuntime.shell) -- Temporal is not enabled unconditionally, requires shell-options
// Copyright (C) 2021 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.plaintime
description: The "PlainTime" property of Temporal
includes: [propertyHelper.js]
features: [Temporal]
---*/

assert.sameValue(
  typeof Temporal.PlainTime,
  "function",
  "`typeof PlainTime` is `function`"
);

verifyProperty(Temporal, "PlainTime", {
  writable: true,
  enumerable: false,
  configurable: true,
});

reportCompare(0, 0);
