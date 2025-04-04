// Copyright 2023 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-%typedarray%.prototype.sort
description: >
  TypedArray.p.sort behaves correctly on TypedArrays backed by resizable buffers
  and passed a user-provided comparison callback.
includes: [compareArray.js, resizableArrayBufferUtils.js]
features: [resizable-arraybuffer]
---*/

for (let ctor of ctors) {
  const rab = CreateResizableArrayBuffer(4 * ctor.BYTES_PER_ELEMENT, 8 * ctor.BYTES_PER_ELEMENT);
  const fixedLength = new ctor(rab, 0, 4);
  const fixedLengthWithOffset = new ctor(rab, 2 * ctor.BYTES_PER_ELEMENT, 2);
  const lengthTracking = new ctor(rab, 0);
  const lengthTrackingWithOffset = new ctor(rab, 2 * ctor.BYTES_PER_ELEMENT);
  const taFull = new ctor(rab, 0);
  function WriteUnsortedData() {
    // Write some data into the array.
    for (let i = 0; i < taFull.length; ++i) {
      taFull[i] = MayNeedBigInt(taFull, 10 - i);
    }
  }
  function OddBeforeEvenComparison(a, b) {
    // Sort all odd numbers before even numbers.
    a = Number(a);
    b = Number(b);
    if (a % 2 == 1 && b % 2 == 0) {
      return -1;
    }
    if (a % 2 == 0 && b % 2 == 1) {
      return 1;
    }
    if (a < b) {
      return -1;
    }
    if (a > b) {
      return 1;
    }
    return 0;
  }
  // Orig. array: [10, 9, 8, 7]
  //              [10, 9, 8, 7] << fixedLength
  //                     [8, 7] << fixedLengthWithOffset
  //              [10, 9, 8, 7, ...] << lengthTracking
  //                     [8, 7, ...] << lengthTrackingWithOffset

  WriteUnsortedData();
  fixedLength.sort(OddBeforeEvenComparison);
  assert.compareArray(ToNumbers(taFull), [
    7,
    9,
    8,
    10
  ]);
  WriteUnsortedData();
  fixedLengthWithOffset.sort(OddBeforeEvenComparison);
  assert.compareArray(ToNumbers(taFull), [
    10,
    9,
    7,
    8
  ]);
  WriteUnsortedData();
  lengthTracking.sort(OddBeforeEvenComparison);
  assert.compareArray(ToNumbers(taFull), [
    7,
    9,
    8,
    10
  ]);
  WriteUnsortedData();
  lengthTrackingWithOffset.sort(OddBeforeEvenComparison);
  assert.compareArray(ToNumbers(taFull), [
    10,
    9,
    7,
    8
  ]);

  // Shrink so that fixed length TAs go out of bounds.
  rab.resize(3 * ctor.BYTES_PER_ELEMENT);

  // Orig. array: [10, 9, 8]
  //              [10, 9, 8, ...] << lengthTracking
  //                     [8, ...] << lengthTrackingWithOffset

  WriteUnsortedData();
  assert.throws(TypeError, () => {
    fixedLength.sort(OddBeforeEvenComparison);
  });
  assert.compareArray(ToNumbers(taFull), [
    10,
    9,
    8
  ]);
  assert.throws(TypeError, () => {
    fixedLengthWithOffset.sort(OddBeforeEvenComparison);
  });
  assert.compareArray(ToNumbers(taFull), [
    10,
    9,
    8
  ]);
  WriteUnsortedData();
  lengthTracking.sort(OddBeforeEvenComparison);
  assert.compareArray(ToNumbers(taFull), [
    9,
    8,
    10
  ]);
  WriteUnsortedData();
  lengthTrackingWithOffset.sort(OddBeforeEvenComparison);
  assert.compareArray(ToNumbers(taFull), [
    10,
    9,
    8
  ]);

  // Shrink so that the TAs with offset go out of bounds.
  rab.resize(1 * ctor.BYTES_PER_ELEMENT);
  WriteUnsortedData();
  assert.throws(TypeError, () => {
    fixedLength.sort(OddBeforeEvenComparison);
  });
  assert.compareArray(ToNumbers(taFull), [10]);
  assert.throws(TypeError, () => {
    fixedLengthWithOffset.sort(OddBeforeEvenComparison);
  });
  assert.compareArray(ToNumbers(taFull), [10]);
  assert.throws(TypeError, () => {
    lengthTrackingWithOffset.sort(OddBeforeEvenComparison);
  });
  assert.compareArray(ToNumbers(taFull), [10]);

  WriteUnsortedData();
  lengthTracking.sort(OddBeforeEvenComparison);
  assert.compareArray(ToNumbers(taFull), [10]);

  // Shrink to zero.
  rab.resize(0);
  assert.throws(TypeError, () => {
    fixedLength.sort(OddBeforeEvenComparison);
  });
  assert.throws(TypeError, () => {
    fixedLengthWithOffset.sort(OddBeforeEvenComparison);
  });
  assert.throws(TypeError, () => {
    lengthTrackingWithOffset.sort(OddBeforeEvenComparison);
  });

  lengthTracking.sort(OddBeforeEvenComparison);
  assert.compareArray(ToNumbers(taFull), []);

  // Grow so that all TAs are back in-bounds.
  rab.resize(6 * ctor.BYTES_PER_ELEMENT);

  // Orig. array: [10, 9, 8, 7, 6, 5]
  //              [10, 9, 8, 7] << fixedLength
  //                     [8, 7] << fixedLengthWithOffset
  //              [10, 9, 8, 7, 6, 5, ...] << lengthTracking
  //                     [8, 7, 6, 5, ...] << lengthTrackingWithOffset

  WriteUnsortedData();
  fixedLength.sort(OddBeforeEvenComparison);
  assert.compareArray(ToNumbers(taFull), [
    7,
    9,
    8,
    10,
    6,
    5
  ]);
  WriteUnsortedData();
  fixedLengthWithOffset.sort(OddBeforeEvenComparison);
  assert.compareArray(ToNumbers(taFull), [
    10,
    9,
    7,
    8,
    6,
    5
  ]);
  WriteUnsortedData();
  lengthTracking.sort(OddBeforeEvenComparison);
  assert.compareArray(ToNumbers(taFull), [
    5,
    7,
    9,
    6,
    8,
    10
  ]);
  WriteUnsortedData();
  lengthTrackingWithOffset.sort(OddBeforeEvenComparison);
  assert.compareArray(ToNumbers(taFull), [
    10,
    9,
    5,
    7,
    6,
    8
  ]);
}

reportCompare(0, 0);
