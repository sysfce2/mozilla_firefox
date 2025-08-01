/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/* import-globals-from clipboard_helper.js */

"use strict";

clipboardTypes.forEach(function (type) {
  if (!clipboard.isClipboardTypeSupported(type)) {
    add_task(async function test_clipboard_getDataSnapshot_not_support() {
      info(`Test getDataSnapshot request throwing on ${type}`);
      SimpleTest.doesThrow(
        () => clipboard.getDataSnapshot(["text/plain"], type, {}),
        "Passing unsupported clipboard type should throw"
      );
    });
    return;
  }

  add_task(async function test_clipboard_getDataSnapshot_throw() {
    info(`Test getDataSnapshot request throwing on ${type}`);
    SimpleTest.doesThrow(
      () => clipboard.getDataSnapshot([], type, {}),
      "Passing empty flavor list should throw"
    );

    SimpleTest.doesThrow(
      () => clipboard.getDataSnapshot(["text/plain"], type, null),
      "Passing no callback should throw"
    );
  });

  add_task(async function test_clipboard_getDataSnapshot_no_matched_flavor() {
    info(`Test getDataSnapshot have no matched flavor on ${type}`);
    await cleanupAllClipboard();
    is(getClipboardData("text/plain", type), null, "ensure clipboard is empty");

    writeRandomStringToClipboard("text/plain", type);
    let request = await new Promise(resolve => {
      clipboard.getDataSnapshot(
        ["text/html"],
        type,
        null,
        SpecialPowers.Services.scriptSecurityManager.getSystemPrincipal(),
        {
          QueryInterface: SpecialPowers.ChromeUtils.generateQI([
            "nsIClipboardGetDataSnapshotCallback",
          ]),
          // nsIClipboardGetDataSnapshotCallback
          onSuccess: SpecialPowers.wrapCallback(
            function (aAsyncGetClipboardData) {
              resolve(aAsyncGetClipboardData);
            }
          ),
        }
      );
    });
    isDeeply(request.flavorList, [], "Check flavorList");
  });

  add_task(async function test_empty_data() {
    info(`Test getDataSnapshot request with empty data on ${type}`);
    await cleanupAllClipboard();
    is(getClipboardData("text/plain", type), null, "ensure clipboard is empty");

    let request = await getClipboardDataSnapshot(type);
    isDeeply(request.flavorList, [], "Check flavorList");
    await asyncClipboardRequestGetData(request, "text/plain", true).catch(e => {
      is(
        e,
        Cr.NS_ERROR_FAILURE,
        "should be rejected with NS_ERROR_FAILURE error"
      );
    });
    syncClipboardRequestGetData(request, "text/plain", Cr.NS_ERROR_FAILURE);
  });

  add_task(async function test_clipboard_getDataSnapshot_after_write() {
    info(`Test getDataSnapshot request after write on ${type}`);

    let str = writeRandomStringToClipboard("text/plain", type);
    let request = await getClipboardDataSnapshot(type);
    isDeeply(request.flavorList, ["text/plain"], "Check flavorList");
    is(
      await asyncClipboardRequestGetData(request, "text/plain"),
      str,
      "Check data"
    );
    ok(request.valid, "request should still be valid");
    is(
      syncClipboardRequestGetData(request, "text/plain"),
      str,
      "Check data (sync)"
    );
    ok(request.valid, "request should still be valid");
    // Requesting a flavor that is not in the list should throw error.
    await asyncClipboardRequestGetData(request, "text/html", true).catch(e => {
      is(
        e,
        Cr.NS_ERROR_FAILURE,
        "should be rejected with NS_ERROR_FAILURE error"
      );
    });
    ok(request.valid, "request should still be valid");
    syncClipboardRequestGetData(request, "text/html", Cr.NS_ERROR_FAILURE);
    ok(request.valid, "request should still be valid");

    // Writing a new data should invalid existing get request.
    str = writeRandomStringToClipboard("text/plain", type);
    await asyncClipboardRequestGetData(request, "text/plain").then(
      () => {
        ok(false, "asyncClipboardRequestGetData should not success");
      },
      e => {
        is(
          e,
          Cr.NS_ERROR_NOT_AVAILABLE,
          "should throw NS_ERROR_NOT_AVAILABLE error"
        );
        ok(true, "asyncClipboardRequestGetData should reject");
      }
    );
    ok(!request.valid, "request should no longer be valid");
    syncClipboardRequestGetData(
      request,
      "text/plain",
      Cr.NS_ERROR_NOT_AVAILABLE
    );
    ok(!request.valid, "request should no longer be valid");

    info(`check clipboard data again`);
    request = await getClipboardDataSnapshot(type);
    isDeeply(request.flavorList, ["text/plain"], "Check flavorList");
    is(
      await asyncClipboardRequestGetData(request, "text/plain"),
      str,
      "Check data"
    );
    is(
      syncClipboardRequestGetData(request, "text/plain"),
      str,
      "Check data (sync)"
    );

    await cleanupAllClipboard();
  });

  add_task(async function test_clipboard_getDataSnapshot_after_empty() {
    info(`Test getDataSnapshot request after empty on ${type}`);

    let str = writeRandomStringToClipboard("text/plain", type);
    let request = await getClipboardDataSnapshot(type);
    isDeeply(request.flavorList, ["text/plain"], "Check flavorList");
    is(
      await asyncClipboardRequestGetData(request, "text/plain"),
      str,
      "Check data"
    );
    ok(request.valid, "request should still be valid");
    is(
      syncClipboardRequestGetData(request, "text/plain"),
      str,
      "Check data (sync)"
    );
    ok(request.valid, "request should still be valid");

    // Empty clipboard data
    emptyClipboardData(type);
    is(getClipboardData("text/plain", type), null, "ensure clipboard is empty");

    await asyncClipboardRequestGetData(request, "text/plain").then(
      () => {
        ok(false, "asyncClipboardRequestGetData should not success");
      },
      e => {
        is(
          e,
          Cr.NS_ERROR_NOT_AVAILABLE,
          "asyncClipboardRequestGetData should reject with NS_ERROR_NOT_AVAILABLE error"
        );
      }
    );
    ok(!request.valid, "request should no longer be valid");

    info(`check clipboard data again`);
    request = await getClipboardDataSnapshot(type);
    isDeeply(request.flavorList, [], "Check flavorList");

    await cleanupAllClipboard();
  });
});

add_task(async function test_html_data() {
  info(`Test getDataSnapshot request with html data`);

  const html_str = `<img src="https://example.com/oops">`;
  writeStringToClipboard(html_str, "text/html", clipboard.kGlobalClipboard);

  let request = await getClipboardDataSnapshot(clipboard.kGlobalClipboard);
  isDeeply(request.flavorList, ["text/html"], "Check flavorList");
  // On Windows, widget adds extra data into HTML clipboard.
  let expectedData = navigator.platform.includes("Win")
    ? `<html><body>\n<!--StartFragment-->${html_str}<!--EndFragment-->\n</body>\n</html>`
    : html_str;
  is(
    await asyncClipboardRequestGetData(request, "text/html"),
    expectedData,
    "Check data"
  );
  // Requesting a flavor that is not in the list should throw error.
  await asyncClipboardRequestGetData(request, "text/plain", true).catch(e => {
    is(
      e,
      Cr.NS_ERROR_FAILURE,
      "should be rejected with NS_ERROR_FAILURE error"
    );
  });

  is(
    syncClipboardRequestGetData(request, "text/html"),
    expectedData,
    "Check data (sync)"
  );
  // Requesting a flavor that is not in the list should throw error.
  syncClipboardRequestGetData(request, "text/plain", Cr.NS_ERROR_FAILURE);
});

// Test for bug 1935127.
add_task(async function test_invalidate_dataSnapshot() {
  const type = clipboard.kGlobalClipboard;
  writeRandomStringToClipboard("text/plain", type);
  let request = await getClipboardDataSnapshot(type);
  ok(request.valid, "request should be valid");

  // Writing a new data should invalid existing get request.
  writeRandomStringToClipboard("text/plain", type);

  info(
    "The ClipboardDataSnapshot should no longer be valid as the clipboard content has changed"
  );
  syncClipboardRequestGetData(request, "text/plain", Cr.NS_ERROR_NOT_AVAILABLE);

  info("Requesting data again immediately should not cause a crash");
  await Promise.all([
    asyncClipboardRequestGetData(request, "text/plain").then(
      () => {
        ok(false, "should not success");
      },
      e => {
        is(
          e,
          Cr.NS_ERROR_NOT_AVAILABLE,
          "should be rejected with NS_ERROR_NOT_AVAILABLE error"
        );
      }
    ),
    syncClipboardRequestGetData(
      request,
      "text/plain",
      Cr.NS_ERROR_NOT_AVAILABLE
    ),
  ]);
});
