/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test command line processing of URLs meant to be intepreted by DevTools.
 */

/* eslint-env browser */

const { DevToolsStartup } = ChromeUtils.importESModule(
  "resource:///modules/DevToolsStartup.sys.mjs"
);

const { require } = ChromeUtils.importESModule(
  "resource://devtools/shared/loader/Loader.sys.mjs"
);
const { gDevTools } = require("devtools/client/framework/devtools");

const URL_ROOT = "https://example.org/browser/devtools/startup/tests/browser/";

const startup = new DevToolsStartup();
// The feature covered here only work when calling firefox from command line
// while it is already opened. So fake Firefox being already opened:
startup.initialized = true;

registerCleanupFunction(() => {
  for (const pref of [
    "devtools.debugger.pending-selected-location",
    "devtools.debugger.prefs-schema-version",
    "devtools.everOpened",
    "devtools.toolbox.selectedTool",
  ]) {
    Services.prefs.clearUserPref(pref);
  }
});

add_task(async function ignoredUrls() {
  const tabCount = gBrowser.tabs.length;

  // We explicitely try to ignore these URL which looks like line, but are passwords
  sendUrlViaCommandLine("https://foo@user:123");
  sendUrlViaCommandLine("https://foo@user:123");
  sendUrlViaCommandLine("https://foo@123:456");

  // The following is an invalid URL (domain with space)
  sendUrlViaCommandLine("https://foo /index.html:123:456");

  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 1000));

  is(tabCount, gBrowser.tabs.length);
});

/**
 * With DevTools closed, but DevToolsStartup "initialized",
 * the url will be ignored
 */
add_task(async function openingWithDevToolsClosed() {
  const url = URL_ROOT + "command-line.html:5:2";

  const tabCount = gBrowser.tabs.length;
  const ignoredUrl = sendUrlViaCommandLine(url);
  ok(ignoredUrl, "The url is ignored when no devtools are opened");

  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 1000));

  is(tabCount, gBrowser.tabs.length);
});

/**
 * With DevTools opened, but the source isn't in the debugged tab,
 * the url will also be opened via view-source
 */
add_task(async function openingWithDevToolsButUnknownSource() {
  const url = URL_ROOT + "command-line.html:5:2";

  const tab = BrowserTestUtils.addTab(
    gBrowser,
    "data:text/html;charset=utf-8,<title>foo</title>"
  );
  gBrowser.selectedTab = tab;

  const toolbox = await gDevTools.showToolboxForTab(tab, {
    toolId: "jsdebugger",
  });

  const newTabOpened = BrowserTestUtils.waitForNewTab(gBrowser);
  sendUrlViaCommandLine(url);
  const newTab = await newTabOpened;
  is(
    newTab.linkedBrowser.documentURI.spec,
    "view-source:" + URL_ROOT + "command-line.html"
  );

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    // View source may not have updated the selection just yet
    ContentTaskUtils.waitForCondition(() => !!content.getSelection());

    const selection = content.getSelection();
    Assert.equal(
      selection.toString().trimEnd(),
      "  <title>Command line test page</title>",
      "The 5th line is selected in view-source"
    );
  });
  await gBrowser.removeTab(newTab);

  await toolbox.destroy();
  await gBrowser.removeTab(tab);
});

/**
 * With DevTools opened, and the source is debugged by the debugger,
 * the url will be opened in the debugger.
 */
add_task(async function openingWithDevToolsAndKnownSource() {
  const line = 5;
  const column = 2;
  const url = URL_ROOT + `command-line.js:${line}:${column}`;

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    URL_ROOT + "command-line.html"
  );
  const toolbox = await gDevTools.showToolboxForTab(tab, {
    toolId: "jsdebugger",
  });

  info("Open a first URL with line and column");
  sendUrlViaCommandLine(url);

  const dbg = toolbox.getPanel("jsdebugger");
  // Wait for the expected location to be selected and ignore any other default ones.
  const selectedLocation = await BrowserTestUtils.waitForCondition(() => {
    const location = dbg._selectors.getSelectedLocation(dbg._getState());
    return location?.line == line ? location : false;
  });

  is(selectedLocation.source.url, URL_ROOT + "command-line.js");
  is(selectedLocation.line, line);
  is(selectedLocation.column, column - 1);

  info("Open another URL with only a line");
  const secondLine = 6;
  const url2 = URL_ROOT + `command-line.js:${secondLine}`;
  sendUrlViaCommandLine(url2);
  const selectedLocation2 = await BrowserTestUtils.waitForCondition(() => {
    const location = dbg._selectors.getSelectedLocation(dbg._getState());
    return location.line == secondLine ? location : false;
  });
  is(selectedLocation2.source.url, URL_ROOT + "command-line.js");
  is(selectedLocation2.line, secondLine);
  is(selectedLocation2.column, 0);

  await toolbox.destroy();
  await gBrowser.removeTab(tab);
});

// Fake opening an existing firefox instance with a URL
// passed via `-url` command line argument
function sendUrlViaCommandLine(url) {
  const cmdLine = Cu.createCommandLine(
    ["-url", url],
    null,
    Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
  );
  startup.handle(cmdLine);

  // Return true if DevToolsStartup ignored the url
  // and let it be in the command line object.
  return cmdLine.findFlag("url", false) != -1;
}
