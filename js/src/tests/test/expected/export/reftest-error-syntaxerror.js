// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Jeff Walden <jwalden+code@mit.edu>
esid: sec-let-and-const-declarations
description: |
  Outside AsyncFunction, |await| is a perfectly cromulent LexicalDeclaration variable name.  Therefore ASI doesn't apply, and so the |0| where a |=| was expected is a syntax error.
flags: [noStrict]
negative:
  phase: parse
  type: SyntaxError
---*/
function f() {
    let
    await 0;
}
$DONOTEVALUATE();
