// Copyright 2015 Microsoft Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
description: Testing descriptor property of Math.expm1
includes: [propertyHelper.js]
es6id: 20.2.2.15
---*/

verifyProperty(Math, "expm1", {
  writable: true,
  enumerable: false,
  configurable: true
});

reportCompare(0, 0);
