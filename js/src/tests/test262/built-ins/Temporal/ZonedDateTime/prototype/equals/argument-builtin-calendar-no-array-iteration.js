// |reftest| skip-if(!this.hasOwnProperty('Temporal')) -- Temporal is not enabled unconditionally
// Copyright (C) 2023 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.zoneddatetime.prototype.equals
description: >
  Calling the method with a property bag argument with a builtin calendar causes
  no observable array iteration when getting the calendar fields.
features: [Temporal]
---*/

const arrayPrototypeSymbolIteratorOriginal = Array.prototype[Symbol.iterator];
Array.prototype[Symbol.iterator] = function arrayIterator() {
  throw new Test262Error("Array should not be iterated");
}

const timeZone = "UTC";
const instance = new Temporal.ZonedDateTime(0n, timeZone);
const arg = { year: 2000, month: 5, day: 2, hour: 21, minute: 43, second: 5, timeZone, calendar: "iso8601" };
instance.equals(arg);

Array.prototype[Symbol.iterator] = arrayPrototypeSymbolIteratorOriginal;

reportCompare(0, 0);
