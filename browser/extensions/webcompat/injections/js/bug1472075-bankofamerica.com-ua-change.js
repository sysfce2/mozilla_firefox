/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 1472075 - Build UA override for Bank of America for OSX & Linux
 * WebCompat issue #2787 - https://webcompat.com/issues/2787
 *
 * BoA is showing a red warning to Linux and macOS users, while accepting
 * Windows users without warning. From our side, there is no difference here
 * and we receive a lot of user complains about the warnings, so we spoof
 * as Firefox on Windows in those cases.
 */

/* globals exportFunction */

if (!navigator.platform.includes("Win")) {
  console.info(
    "The user agent has been overridden for compatibility reasons. See https://webcompat.com/issues/2787 for details."
  );

  const WINDOWS_UA = navigator.userAgent.replace(
    /\(.*; rv:/i,
    "(Windows NT 10.0; Win64; x64; rv:"
  );

  const nav = Object.getPrototypeOf(navigator.wrappedJSObject);

  const ua = Object.getOwnPropertyDescriptor(nav, "userAgent");
  ua.get = exportFunction(() => WINDOWS_UA, window);
  Object.defineProperty(nav, "userAgent", ua);

  const appVersion = Object.getOwnPropertyDescriptor(nav, "appVersion");
  appVersion.get = exportFunction(() => "appVersion", window);
  Object.defineProperty(nav, "appVersion", appVersion);

  const platform = Object.getOwnPropertyDescriptor(nav, "platform");
  platform.get = exportFunction(() => "Win64", window);
  Object.defineProperty(nav, "platform", platform);
}
