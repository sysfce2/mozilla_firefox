/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

enum RTCDataChannelState {
  "connecting",
  "open",
  "closing",
  "closed"
};

enum RTCDataChannelType {
  "arraybuffer",
  "blob"
};

[Exposed=Window]
interface RTCDataChannel : EventTarget
{
  readonly attribute UTF8String label;
  readonly attribute boolean negotiated;
  readonly attribute boolean ordered;
  readonly attribute unsigned short? maxPacketLifeTime;
  readonly attribute unsigned short? maxRetransmits;
  readonly attribute UTF8String protocol;
  readonly attribute unsigned short? id;
  readonly attribute RTCDataChannelState readyState;
  readonly attribute unsigned long bufferedAmount;
  attribute unsigned long bufferedAmountLowThreshold;
  attribute EventHandler onopen;
  attribute EventHandler onerror;
  attribute EventHandler onclose;
  undefined close();
  attribute EventHandler onmessage;
  attribute EventHandler onbufferedamountlow;
  attribute RTCDataChannelType binaryType;
  [Throws]
  undefined send(USVString data);
  [Throws]
  undefined send(Blob data);
  [Throws]
  undefined send(ArrayBuffer data);
  [Throws]
  undefined send(ArrayBufferView data);
};
