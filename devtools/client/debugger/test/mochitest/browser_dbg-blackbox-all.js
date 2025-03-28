/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// This contains tests for
// 1) The context menu items that blackboxes multiple files in the Sources Panel.
// Checks if submenu works correctly for options:
// - 'Un/Blackbox files in this group'
// - 'Un/Blackbox files outside this group'
// - 'Un/Blackbox files in this directory'
// - 'Un/Blackbox files outside this directory'
// 2) The context menu item to hide/show the blackboxed files.

"use strict";

const SOURCE_FILES = {
  nestedSource: "nested-source.js",
  codeReload1: "code_reload_1.js",
};

const NODE_SELECTORS = {
  nodeBlackBoxAll: "#node-blackbox-all",
  nodeBlackBoxAllInside: "#node-blackbox-all-inside",
  nodeUnBlackBoxAllInside: "#node-unblackbox-all-inside",
  nodeBlackBoxAllOutside: "#node-blackbox-all-outside",
  nodeUnBlackBoxAllOutside: "#node-unblackbox-all-outside",
};

add_task(async function testBlackBoxOnMultipleFiles() {
  const dbg = await initDebugger(
    "doc-blackbox-all.html",
    SOURCE_FILES.nestedSource,
    SOURCE_FILES.codeReload1
  );

  // Expand the SourceTree and wait for all sources to be visible,
  // so that we can assert the visible state of blackboxing in the source tree.
  await waitForSourcesInSourceTree(dbg, Object.values(SOURCE_FILES));

  info("Loads the source file and sets a breakpoint at line 2.");
  await selectSource(dbg, SOURCE_FILES.nestedSource);
  await addBreakpoint(dbg, SOURCE_FILES.nestedSource, 2);

  info("Selecting the source will highlight it and expand the tree down to it");
  await waitForAllElements(dbg, "sourceTreeFolderNode", 3);
  const sourceTreeFolderNodeEls = findAllElements(dbg, "sourceTreeFolderNode");
  const sourceTreeRootNodeEl = findElement(dbg, "sourceTreeRootNode");

  info("Blackbox files in this directory.");
  rightClickEl(dbg, sourceTreeFolderNodeEls[1]);
  await waitForContextMenu(dbg);
  await openContextMenuSubmenu(dbg, NODE_SELECTORS.nodeBlackBoxAll);
  await assertContextMenuLabel(
    dbg,
    NODE_SELECTORS.nodeBlackBoxAllInside,
    "Ignore files in this directory"
  );
  await assertContextMenuLabel(
    dbg,
    NODE_SELECTORS.nodeBlackBoxAllOutside,
    "Ignore files outside this directory"
  );
  selectContextMenuItem(dbg, NODE_SELECTORS.nodeBlackBoxAllInside);
  await waitForDispatch(dbg.store, "BLACKBOX_WHOLE_SOURCES");
  await waitForBlackboxCount(dbg, 1);
  await waitForRequestsToSettle(dbg);

  assertSourceNodeIsBlackBoxed(dbg, SOURCE_FILES.nestedSource, true);
  assertSourceNodeIsBlackBoxed(dbg, SOURCE_FILES.codeReload1, false);

  info("The invoked function is blackboxed and the debugger does not pause.");
  invokeInTab("computeSomething");
  assertNotPaused(dbg);

  info("Unblackbox files outside this directory.");
  rightClickEl(dbg, sourceTreeFolderNodeEls[2]);
  await waitForContextMenu(dbg);
  await openContextMenuSubmenu(dbg, NODE_SELECTORS.nodeBlackBoxAll);
  await assertContextMenuLabel(
    dbg,
    NODE_SELECTORS.nodeBlackBoxAllInside,
    "Ignore files in this directory"
  );
  await assertContextMenuLabel(
    dbg,
    NODE_SELECTORS.nodeUnBlackBoxAllOutside,
    "Unignore files outside this directory"
  );
  selectContextMenuItem(dbg, NODE_SELECTORS.nodeUnBlackBoxAllOutside);
  await waitForDispatch(dbg.store, "UNBLACKBOX_WHOLE_SOURCES");
  await waitForBlackboxCount(dbg, 0);
  await waitForRequestsToSettle(dbg);
  info("Wait for any breakpoints in the source to get enabled");
  await waitForDispatch(dbg.store, "SET_BREAKPOINT");

  assertSourceNodeIsBlackBoxed(dbg, SOURCE_FILES.nestedSource, false);
  assertSourceNodeIsBlackBoxed(dbg, SOURCE_FILES.codeReload1, false);

  info("All sources are unblackboxed and the debugger pauses on line 2.");
  invokeInTab("computeSomething");
  await waitForPaused(dbg);
  await resume(dbg);

  info("Blackbox files in this group.");
  rightClickEl(dbg, sourceTreeRootNodeEl);
  await waitForContextMenu(dbg);
  await assertContextMenuLabel(
    dbg,
    NODE_SELECTORS.nodeBlackBoxAllInside,
    "Ignore files in this group"
  );
  selectContextMenuItem(dbg, NODE_SELECTORS.nodeBlackBoxAllInside);
  await waitForBlackboxCount(dbg, 2);
  await waitForRequestsToSettle(dbg);

  assertSourceNodeIsBlackBoxed(dbg, SOURCE_FILES.nestedSource, true);
  assertSourceNodeIsBlackBoxed(dbg, SOURCE_FILES.codeReload1, true);

  info("Unblackbox files in this group.");
  rightClickEl(dbg, sourceTreeRootNodeEl);
  await waitForContextMenu(dbg);
  await assertContextMenuLabel(
    dbg,
    NODE_SELECTORS.nodeUnBlackBoxAllInside,
    "Unignore files in this group"
  );
  selectContextMenuItem(dbg, NODE_SELECTORS.nodeUnBlackBoxAllInside);
  await waitForBlackboxCount(dbg, 0);
  await waitForRequestsToSettle(dbg);

  assertSourceNodeIsBlackBoxed(dbg, SOURCE_FILES.nestedSource, false);
  assertSourceNodeIsBlackBoxed(dbg, SOURCE_FILES.codeReload1, false);
});

add_task(async function testHideAndShowBlackBoxedFiles() {
  Services.prefs.setBoolPref("devtools.debugger.hide-ignored-sources", false);

  const dbg = await initDebugger(
    "doc-blackbox-all.html",
    SOURCE_FILES.nestedSource,
    SOURCE_FILES.codeReload1
  );

  await waitForSourcesInSourceTree(dbg, Object.values(SOURCE_FILES));
  await selectSource(dbg, SOURCE_FILES.nestedSource);
  clickElement(dbg, "blackbox");
  await waitForDispatch(dbg.store, "BLACKBOX_WHOLE_SOURCES");

  info("Assert and click the hide ignored files button in the settings menu");
  await toggleSourcesTreeSettingsMenuItem(dbg, {
    className: ".debugger-settings-menu-item-hide-ignored-sources",
    isChecked: false,
  });

  info("Wait until ignored sources are no longer visible");
  await waitUntil(
    () => !findSourceNodeWithText(dbg, SOURCE_FILES.nestedSource)
  );

  is(
    Services.prefs.getBoolPref("devtools.debugger.hide-ignored-sources"),
    true,
    "Hide ignored files is enabled"
  );

  is(
    dbg.win.document.querySelector(".source-list-footer").innerText,
    "Ignored sources are hidden.\nShow all sources",
    "Notification is visible with the correct message"
  );

  info("Assert that newly ignored files are automatically hidden");
  await selectSource(dbg, SOURCE_FILES.codeReload1);
  await triggerSourceTreeContextMenu(
    dbg,
    findSourceNodeWithText(dbg, SOURCE_FILES.codeReload1),
    "#node-menu-blackbox"
  );
  await waitForDispatch(dbg.store, "BLACKBOX_WHOLE_SOURCES");
  await waitUntil(() => !findSourceNodeWithText(dbg, SOURCE_FILES.codeReload1));

  info("Show the hidden ignored files using the button in the notification");
  clickElementWithSelector(dbg, ".source-list-footer button");

  info("Wait until ignored sources are visible");
  await waitUntil(() => findSourceNodeWithText(dbg, SOURCE_FILES.nestedSource));

  is(
    Services.prefs.getBoolPref("devtools.debugger.hide-ignored-sources"),
    false,
    "Hide ignored files is disabled"
  );

  ok(
    !document.querySelector(".source-list-footer"),
    "Notification is no longer visible"
  );
});

function waitForBlackboxCount(dbg, count) {
  return waitForState(
    dbg,
    () => Object.keys(dbg.selectors.getBlackBoxRanges()).length === count
  );
}

function assertSourceNodeIsBlackBoxed(dbg, sourceFilename, shouldBeBlackBoxed) {
  const treeItem = findSourceNodeWithText(dbg, sourceFilename);
  ok(treeItem, `Found tree item for ${sourceFilename}`);
  is(
    !!treeItem.querySelector(".img.blackBox"),
    shouldBeBlackBoxed,
    `${sourceFilename} is ${shouldBeBlackBoxed ? "" : "not"} blackboxed`
  );
}
