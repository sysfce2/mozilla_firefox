/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionCreators: "resource://newtab/common/Actions.mjs",
  actionTypes: "resource://newtab/common/Actions.mjs",
  Utils: "resource://services-settings/Utils.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  WallpaperFeed: "resource://newtab/lib/WallpaperFeed.sys.mjs",
});

const PREF_WALLPAPERS_ENABLED =
  "browser.newtabpage.activity-stream.newtabWallpapers.enabled";

add_task(async function test_construction() {
  let feed = new WallpaperFeed();

  info("WallpaperFeed constructor should create initial values");

  Assert.ok(feed, "Could construct a WallpaperFeed");
  Assert.ok(feed.loaded === false, "WallpaperFeed is not loaded");
  Assert.ok(
    feed.wallpaperClient === null,
    "wallpaperClient is initialized as null"
  );
});

add_task(async function test_onAction_INIT() {
  let sandbox = sinon.createSandbox();
  let feed = new WallpaperFeed();
  Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
  const attachment = {
    attachment: {
      location: "attachment",
    },
  };
  sandbox.stub(feed, "RemoteSettings").returns({
    get: () => [attachment],
    on: () => {},
  });
  feed.store = {
    dispatch: sinon.spy(),
  };
  sandbox
    .stub(Utils, "baseAttachmentsURL")
    .returns("http://localhost:8888/base_url/");

  info("WallpaperFeed.onAction INIT should initialize wallpapers");

  await feed.onAction({
    type: actionTypes.INIT,
  });

  Assert.ok(feed.store.dispatch.calledThrice);
  Assert.ok(
    feed.store.dispatch.secondCall.calledWith(
      actionCreators.BroadcastToContent({
        type: actionTypes.WALLPAPERS_SET,
        data: [
          {
            ...attachment,
            wallpaperUrl: "http://localhost:8888/base_url/attachment",
            category: "",
          },
        ],
        meta: {
          isStartup: true,
        },
      })
    )
  );
  Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);
  sandbox.restore();
});

add_task(async function test_onAction_PREF_CHANGED() {
  let sandbox = sinon.createSandbox();
  let feed = new WallpaperFeed();
  Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
  sandbox.stub(feed, "wallpaperSetup").returns();

  info("WallpaperFeed.onAction PREF_CHANGED should call wallpaperSetup");

  feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "newtabWallpapers.enabled" },
  });

  Assert.ok(feed.wallpaperSetup.calledOnce);
  Assert.ok(feed.wallpaperSetup.calledWith(false));

  Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);
  sandbox.restore();
});

add_task(async function test_onAction_WALLPAPER_UPLOAD() {
  let sandbox = sinon.createSandbox();
  let feed = new WallpaperFeed();
  const fileData = {};

  Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
  sandbox.stub(feed, "wallpaperUpload").returns();

  info("WallpaperFeed.onAction WALLPAPER_UPLOAD should call wallpaperUpload");

  feed.onAction({
    type: actionTypes.WALLPAPER_UPLOAD,
    data: fileData,
  });

  Assert.ok(feed.wallpaperUpload.calledOnce);
  Assert.ok(feed.wallpaperUpload.calledWith(fileData));

  Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);

  sandbox.restore();
});
