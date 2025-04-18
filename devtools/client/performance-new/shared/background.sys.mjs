/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @ts-check

/**
 * This file contains all of the background logic for controlling the state and
 * configuration of the profiler. It is in a JSM so that the logic can be shared
 * with both the popup client, and the keyboard shortcuts. The shortcuts don't need
 * access to any UI, and need to be loaded independent of the popup.
 */

// The following are not lazily loaded as they are needed during initialization.

import { createLazyLoaders } from "resource://devtools/client/performance-new/shared/typescript-lazy-load.sys.mjs";

// For some reason TypeScript was giving me an error when de-structuring AppConstants. I
// suspect a bug in TypeScript was at play.
const AppConstants = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
).AppConstants;

/**
 * @typedef {import("../@types/perf").RecordingSettings} RecordingSettings
 * @typedef {import("../@types/perf").SymbolTableAsTuple} SymbolTableAsTuple
 * @typedef {import("../@types/perf").Library} Library
 * @typedef {import("../@types/perf").PerformancePref} PerformancePref
 * @typedef {import("../@types/perf").ProfilerWebChannel} ProfilerWebChannel
 * @typedef {import("../@types/perf").PageContext} PageContext
 * @typedef {import("../@types/perf").PrefObserver} PrefObserver
 * @typedef {import("../@types/perf").PrefPostfix} PrefPostfix
 * @typedef {import("../@types/perf").Presets} Presets
 * @typedef {import("../@types/perf").ProfilerViewMode} ProfilerViewMode
 * @typedef {import("../@types/perf").MessageFromFrontend} MessageFromFrontend
 * @typedef {import("../@types/perf").RequestFromFrontend} RequestFromFrontend
 * @typedef {import("../@types/perf").ResponseToFrontend} ResponseToFrontend
 * @typedef {import("../@types/perf").SymbolicationService} SymbolicationService
 * @typedef {import("../@types/perf").ProfilerBrowserInfo} ProfilerBrowserInfo
 * @typedef {import("../@types/perf").ProfileCaptureResult} ProfileCaptureResult
 * @typedef {import("../@types/perf").ProfilerFaviconData} ProfilerFaviconData
 */

/** @type {PerformancePref["Entries"]} */
const ENTRIES_PREF = "devtools.performance.recording.entries";
/** @type {PerformancePref["Interval"]} */
const INTERVAL_PREF = "devtools.performance.recording.interval";
/** @type {PerformancePref["Features"]} */
const FEATURES_PREF = "devtools.performance.recording.features";
/** @type {PerformancePref["Threads"]} */
const THREADS_PREF = "devtools.performance.recording.threads";
/** @type {PerformancePref["ObjDirs"]} */
const OBJDIRS_PREF = "devtools.performance.recording.objdirs";
/** @type {PerformancePref["Duration"]} */
const DURATION_PREF = "devtools.performance.recording.duration";
/** @type {PerformancePref["Preset"]} */
const PRESET_PREF = "devtools.performance.recording.preset";
/** @type {PerformancePref["PopupFeatureFlag"]} */
const POPUP_FEATURE_FLAG_PREF = "devtools.performance.popup.feature-flag";
/* This will be used to observe all profiler-related prefs. */
const PREF_PREFIX = "devtools.performance.recording.";

// The version of the profiler WebChannel.
// This is reported from the STATUS_QUERY message, and identifies the
// capabilities of the WebChannel. The front-end can handle old WebChannel
// versions and has a full list of versions and capabilities here:
// https://github.com/firefox-devtools/profiler/blob/main/src/app-logic/web-channel.js
const CURRENT_WEBCHANNEL_VERSION = 5;

const lazyRequire = {};
// eslint-disable-next-line mozilla/lazy-getter-object-name
ChromeUtils.defineESModuleGetters(lazyRequire, {
  require: "resource://devtools/shared/loader/Loader.sys.mjs",
});
// Lazily load the require function, when it's needed.
// Avoid using ChromeUtils.defineESModuleGetters for now as:
// * we can't replace createLazyLoaders as we still load commonjs+jsm+esm
//   It will be easier once we only load sys.mjs files.
// * we would need to find a way to accomodate typescript to this special function.
// @ts-ignore:next-line
function require(path) {
  // @ts-ignore:next-line
  return lazyRequire.require(path);
}

// The following utilities are lazily loaded as they are not needed when controlling the
// global state of the profiler, and only are used during specific funcationality like
// symbolication or capturing a profile.
const lazy = createLazyLoaders({
  Utils: () =>
    require("resource://devtools/client/performance-new/shared/utils.js"),
  BrowserModule: () =>
    require("resource://devtools/client/performance-new/shared/browser.js"),
  RecordingUtils: () =>
    require("resource://devtools/shared/performance-new/recording-utils.js"),
  CustomizableUI: () =>
    ChromeUtils.importESModule("resource:///modules/CustomizableUI.sys.mjs"),
  PerfSymbolication: () =>
    ChromeUtils.importESModule(
      "resource://devtools/client/performance-new/shared/symbolication.sys.mjs"
    ),
  ProfilerMenuButton: () =>
    ChromeUtils.importESModule(
      "resource://devtools/client/performance-new/popup/menu-button.sys.mjs"
    ),
  PlacesUtils: () =>
    ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs")
      .PlacesUtils,
});

// The presets that we find in all interfaces are defined here.

// The property l10nIds contain all FTL l10n IDs for these cases:
// - properties in "popup" are used in the popup's select box.
// - properties in "devtools" are used in other UIs (about:profiling and devtools panels).
//
// Properties for both cases have the same values, but because they're not used
// in the same way we need to duplicate them.
// Their values for the en-US locale are in the files:
//   devtools/client/locales/en-US/perftools.ftl
//   browser/locales/en-US/browser/appmenu.ftl
//
// IMPORTANT NOTE: Please keep the existing profiler presets in sync with their
// Fenix counterparts and consider adding any new presets to Fenix:
// https://github.com/mozilla-mobile/firefox-android/blob/1d177e7e78d027e8ab32cedf0fc68316787d7454/fenix/app/src/main/java/org/mozilla/fenix/perf/ProfilerUtils.kt

/** @type {Presets} */
export const presets = {
  "web-developer": {
    entries: 128 * 1024 * 1024,
    interval: 1,
    features: ["screenshots", "js", "cpu", "memory"],
    threads: ["GeckoMain", "Compositor", "Renderer", "DOM Worker"],
    duration: 0,
    profilerViewMode: "active-tab",
    l10nIds: {
      popup: {
        label: "profiler-popup-presets-web-developer-label",
        description: "profiler-popup-presets-web-developer-description",
      },
      devtools: {
        label: "perftools-presets-web-developer-label",
        description: "perftools-presets-web-developer-description",
      },
    },
  },
  "firefox-platform": {
    entries: 128 * 1024 * 1024,
    interval: 1,
    features: [
      "screenshots",
      "js",
      "stackwalk",
      "cpu",
      "java",
      "processcpu",
      "memory",
    ],
    threads: [
      "GeckoMain",
      "Compositor",
      "Renderer",
      "SwComposite",
      "DOM Worker",
    ],
    duration: 0,
    l10nIds: {
      popup: {
        label: "profiler-popup-presets-firefox-label",
        description: "profiler-popup-presets-firefox-description",
      },
      devtools: {
        label: "perftools-presets-firefox-label",
        description: "perftools-presets-firefox-description",
      },
    },
  },
  graphics: {
    entries: 128 * 1024 * 1024,
    interval: 1,
    features: ["stackwalk", "js", "cpu", "java", "processcpu", "memory"],
    threads: [
      "GeckoMain",
      "Compositor",
      "Renderer",
      "SwComposite",
      "RenderBackend",
      "GlyphRasterizer",
      "SceneBuilder",
      "WrWorker",
      "CanvasWorkers",
      "TextureUpdate",
    ],
    duration: 0,
    l10nIds: {
      popup: {
        label: "profiler-popup-presets-graphics-label",
        description: "profiler-popup-presets-graphics-description",
      },
      devtools: {
        label: "perftools-presets-graphics-label",
        description: "perftools-presets-graphics-description",
      },
    },
  },
  media: {
    entries: 128 * 1024 * 1024,
    interval: 1,
    features: [
      "js",
      "stackwalk",
      "cpu",
      "audiocallbacktracing",
      "ipcmessages",
      "processcpu",
      "memory",
    ],
    threads: [
      "BackgroundThreadPool",
      "Compositor",
      "DOM Worker",
      "GeckoMain",
      "IPDL Background",
      "InotifyEventThread",
      "ModuleProcessThread",
      "PacerThread",
      "RemVidChild",
      "RenderBackend",
      "Renderer",
      "Socket Thread",
      "SwComposite",
      "TextureUpdate",
      "audio",
      "camera",
      "capture",
      "cubeb",
      "decoder",
      "gmp",
      "graph",
      "grph",
      "media",
      "webrtc",
    ],
    duration: 0,
    l10nIds: {
      popup: {
        label: "profiler-popup-presets-media-label",
        description: "profiler-popup-presets-media-description2",
      },
      devtools: {
        label: "perftools-presets-media-label",
        description: "perftools-presets-media-description2",
      },
    },
  },
  networking: {
    entries: 128 * 1024 * 1024,
    interval: 1,
    features: [
      "screenshots",
      "js",
      "stackwalk",
      "cpu",
      "java",
      "processcpu",
      "bandwidth",
      "memory",
    ],
    threads: [
      "Cache2 I/O",
      "Compositor",
      "DNS Resolver",
      "DOM Worker",
      "GeckoMain",
      "Renderer",
      "Socket Thread",
      "StreamTrans",
      "SwComposite",
      "TRR Background",
    ],
    duration: 0,
    l10nIds: {
      popup: {
        label: "profiler-popup-presets-networking-label",
        description: "profiler-popup-presets-networking-description",
      },
      devtools: {
        label: "perftools-presets-networking-label",
        description: "perftools-presets-networking-description",
      },
    },
  },
  power: {
    entries: 128 * 1024 * 1024,
    interval: 10,
    features: [
      "screenshots",
      "js",
      "stackwalk",
      "cpu",
      "processcpu",
      "nostacksampling",
      "ipcmessages",
      "markersallthreads",
      "power",
      "bandwidth",
      "memory",
    ],
    threads: ["GeckoMain", "Renderer"],
    duration: 0,
    l10nIds: {
      popup: {
        label: "profiler-popup-presets-power-label",
        description: "profiler-popup-presets-power-description",
      },
      devtools: {
        label: "perftools-presets-power-label",
        description: "perftools-presets-power-description",
      },
    },
  },
  debug: {
    entries: 128 * 1024 * 1024,
    interval: 1,
    features: [
      "cpu",
      "ipcmessages",
      "js",
      "markersallthreads",
      "processcpu",
      "samplingallthreads",
      "stackwalk",
      "unregisteredthreads",
    ],
    threads: ["*"],
    duration: 0,
    l10nIds: {
      popup: {
        label: "profiler-popup-presets-debug-label",
        description: "profiler-popup-presets-debug-description",
      },
      devtools: {
        label: "perftools-presets-debug-label",
        description: "perftools-presets-debug-description",
      },
    },
  },
};

/**
 * Return the proper view mode for the Firefox Profiler front-end timeline by
 * looking at the proper preset that is selected.
 * Return value can be undefined when the preset is unknown or custom.
 * @param {PageContext} pageContext
 * @return {ProfilerViewMode | undefined}
 */
export function getProfilerViewModeForCurrentPreset(pageContext) {
  const prefPostfix = getPrefPostfix(pageContext);
  const presetName = Services.prefs.getCharPref(PRESET_PREF + prefPostfix);

  if (presetName === "custom") {
    return undefined;
  }

  const preset = presets[presetName];
  if (!preset) {
    console.error(`Unknown profiler preset was encountered: "${presetName}"`);
    return undefined;
  }
  return preset.profilerViewMode;
}

/**
 * This function is called when the profile is captured with the shortcut
 * keys, with the profiler toolbarbutton, or with the button inside the
 * popup.
 * @param {PageContext} pageContext
 * @return {Promise<void>}
 */
export async function captureProfile(pageContext) {
  if (!Services.profiler.IsActive()) {
    // The profiler is not active, ignore.
    return;
  }
  if (Services.profiler.IsPaused()) {
    // The profiler is already paused for capture, ignore.
    return;
  }

  // Pause profiler before we collect the profile, so that we don't capture
  // more samples while the parent process waits for subprocess profiles.
  Services.profiler.Pause();

  /**
   * @type {MockedExports.ProfileGenerationAdditionalInformation | undefined}
   */
  let additionalInfo;
  /**
   * @type {ProfileCaptureResult}
   */
  const profileCaptureResult = await Services.profiler
    .getProfileDataAsGzippedArrayBuffer()
    .then(
      ({ profile, additionalInformation }) => {
        additionalInfo = additionalInformation;
        return { type: "SUCCESS", profile };
      },
      error => {
        console.error(error);
        return { type: "ERROR", error };
      }
    );

  const profilerViewMode = getProfilerViewModeForCurrentPreset(pageContext);
  const sharedLibraries = additionalInfo?.sharedLibraries
    ? additionalInfo.sharedLibraries
    : Services.profiler.sharedLibraries;
  const objdirs = getObjdirPrefValue();

  const { createLocalSymbolicationService } = lazy.PerfSymbolication();
  const symbolicationService = createLocalSymbolicationService(
    sharedLibraries,
    objdirs
  );

  const { openProfilerTab } = lazy.BrowserModule();
  const browser = await openProfilerTab({ profilerViewMode });
  registerProfileCaptureForBrowser(
    browser,
    profileCaptureResult,
    symbolicationService
  );

  Services.profiler.StopProfiler();
}

/**
 * This function is called when the profiler is started with the shortcut
 * keys, with the profiler toolbarbutton, or with the button inside the
 * popup.
 * @param {PageContext} pageContext
 */
export function startProfiler(pageContext) {
  const { entries, interval, features, threads, duration } =
    getRecordingSettings(pageContext, Services.profiler.GetFeatures());

  // Get the active Browser ID from browser.
  const { getActiveBrowserID } = lazy.RecordingUtils();
  const activeTabID = getActiveBrowserID();

  Services.profiler.StartProfiler(
    entries,
    interval,
    features,
    threads,
    activeTabID,
    duration
  );
}

/**
 * This function is called directly by devtools/startup/DevToolsStartup.jsm when
 * using the shortcut keys to capture a profile.
 * @type {() => void}
 */
export function stopProfiler() {
  Services.profiler.StopProfiler();
}

/**
 * This function is called directly by devtools/startup/DevToolsStartup.jsm when
 * using the shortcut keys to start and stop the profiler.
 * @param {PageContext} pageContext
 * @return {void}
 */
export function toggleProfiler(pageContext) {
  if (Services.profiler.IsPaused()) {
    // The profiler is currently paused, which means that the user is already
    // attempting to capture a profile. Ignore this request.
    return;
  }
  if (Services.profiler.IsActive()) {
    stopProfiler();
  } else {
    startProfiler(pageContext);
  }
}

/**
 * @param {PageContext} pageContext
 */
export function restartProfiler(pageContext) {
  stopProfiler();
  startProfiler(pageContext);
}

/**
 * @param {string} prefName
 * @return {string[]}
 */
function _getArrayOfStringsPref(prefName) {
  const text = Services.prefs.getCharPref(prefName);
  return JSON.parse(text);
}

/**
 * The profiler recording workflow uses two different pref paths. One set of prefs
 * is stored for local profiling, and another for remote profiling. This function
 * decides which to use. The remote prefs have ".remote" appended to the end of
 * their pref names.
 *
 * @param {PageContext} pageContext
 * @returns {PrefPostfix}
 */
function getPrefPostfix(pageContext) {
  switch (pageContext) {
    case "devtools":
    case "aboutprofiling":
    case "aboutlogging":
      // Don't use any postfix on the prefs.
      return "";
    case "devtools-remote":
    case "aboutprofiling-remote":
      return ".remote";
    default: {
      const { UnhandledCaseError } = lazy.Utils();
      throw new UnhandledCaseError(pageContext, "Page Context");
    }
  }
}

/**
 * @param {string[]} objdirs
 */
function setObjdirPrefValue(objdirs) {
  Services.prefs.setCharPref(OBJDIRS_PREF, JSON.stringify(objdirs));
}

/**
 * Before Firefox 92, the objdir lists for local and remote profiling were
 * stored in separate lists. In Firefox 92 those two prefs were merged into
 * one. This function performs the migration.
 */
function migrateObjdirsPrefsIfNeeded() {
  const OLD_REMOTE_OBJDIRS_PREF = OBJDIRS_PREF + ".remote";
  const remoteString = Services.prefs.getCharPref(OLD_REMOTE_OBJDIRS_PREF, "");
  if (remoteString === "") {
    // No migration necessary.
    return;
  }

  const remoteList = JSON.parse(remoteString);
  const localList = _getArrayOfStringsPref(OBJDIRS_PREF);

  // Merge the two lists, eliminating any duplicates.
  const mergedList = [...new Set(localList.concat(remoteList))];
  setObjdirPrefValue(mergedList);
  Services.prefs.clearUserPref(OLD_REMOTE_OBJDIRS_PREF);
}

/**
 * @returns {string[]}
 */
function getObjdirPrefValue() {
  migrateObjdirsPrefsIfNeeded();
  return _getArrayOfStringsPref(OBJDIRS_PREF);
}

/**
 * @param {PageContext} pageContext
 * @param {string[]} supportedFeatures
 * @returns {RecordingSettings}
 */
export function getRecordingSettings(pageContext, supportedFeatures) {
  const objdirs = getObjdirPrefValue();
  const prefPostfix = getPrefPostfix(pageContext);
  const presetName = Services.prefs.getCharPref(PRESET_PREF + prefPostfix);

  // First try to get the values from a preset. If the preset is "custom" or
  // unrecognized, getRecordingSettingsFromPreset will return null and we will
  // get the settings from individual prefs instead.
  return (
    getRecordingSettingsFromPreset(presetName, supportedFeatures, objdirs) ??
    getRecordingSettingsFromPrefs(supportedFeatures, objdirs, prefPostfix)
  );
}

/**
 * @param {string} presetName
 * @param {string[]} supportedFeatures
 * @param {string[]} objdirs
 * @return {RecordingSettings | null}
 */
function getRecordingSettingsFromPreset(
  presetName,
  supportedFeatures,
  objdirs
) {
  if (presetName === "custom") {
    return null;
  }

  const preset = presets[presetName];
  if (!preset) {
    console.error(`Unknown profiler preset was encountered: "${presetName}"`);
    return null;
  }

  return {
    presetName,
    entries: preset.entries,
    interval: preset.interval,
    // Validate the features before passing them to the profiler.
    features: preset.features.filter(feature =>
      supportedFeatures.includes(feature)
    ),
    threads: preset.threads,
    objdirs,
    duration: preset.duration,
  };
}

/**
 * @param {string[]} supportedFeatures
 * @param {string[]} objdirs
 * @param {PrefPostfix} prefPostfix
 * @return {RecordingSettings}
 */
function getRecordingSettingsFromPrefs(
  supportedFeatures,
  objdirs,
  prefPostfix
) {
  // If you add a new preference here, please do not forget to update
  // `revertRecordingSettings` as well.

  const entries = Services.prefs.getIntPref(ENTRIES_PREF + prefPostfix);
  const intervalInMicroseconds = Services.prefs.getIntPref(
    INTERVAL_PREF + prefPostfix
  );
  const interval = intervalInMicroseconds / 1000;
  const features = _getArrayOfStringsPref(FEATURES_PREF + prefPostfix);
  const threads = _getArrayOfStringsPref(THREADS_PREF + prefPostfix);
  const duration = Services.prefs.getIntPref(DURATION_PREF + prefPostfix);

  return {
    presetName: "custom",
    entries,
    interval,
    // Validate the features before passing them to the profiler.
    features: features.filter(feature => supportedFeatures.includes(feature)),
    threads,
    objdirs,
    duration,
  };
}

/**
 * @param {PageContext} pageContext
 * @param {RecordingSettings} prefs
 */
export function setRecordingSettings(pageContext, prefs) {
  const prefPostfix = getPrefPostfix(pageContext);
  Services.prefs.setCharPref(PRESET_PREF + prefPostfix, prefs.presetName);
  Services.prefs.setIntPref(ENTRIES_PREF + prefPostfix, prefs.entries);
  // The interval pref stores the value in microseconds for extra precision.
  const intervalInMicroseconds = prefs.interval * 1000;
  Services.prefs.setIntPref(
    INTERVAL_PREF + prefPostfix,
    intervalInMicroseconds
  );
  Services.prefs.setCharPref(
    FEATURES_PREF + prefPostfix,
    JSON.stringify(prefs.features)
  );
  Services.prefs.setCharPref(
    THREADS_PREF + prefPostfix,
    JSON.stringify(prefs.threads)
  );
  setObjdirPrefValue(prefs.objdirs);
}

export const platform = AppConstants.platform;

/**
 * Revert the recording prefs for both local and remote profiling.
 * @return {void}
 */
export function revertRecordingSettings() {
  for (const prefPostfix of ["", ".remote"]) {
    Services.prefs.clearUserPref(PRESET_PREF + prefPostfix);
    Services.prefs.clearUserPref(ENTRIES_PREF + prefPostfix);
    Services.prefs.clearUserPref(INTERVAL_PREF + prefPostfix);
    Services.prefs.clearUserPref(FEATURES_PREF + prefPostfix);
    Services.prefs.clearUserPref(THREADS_PREF + prefPostfix);
    Services.prefs.clearUserPref(DURATION_PREF + prefPostfix);
  }
  Services.prefs.clearUserPref(OBJDIRS_PREF);
  Services.prefs.clearUserPref(POPUP_FEATURE_FLAG_PREF);
}

/**
 * Change the prefs based on a preset. This mechanism is used by the popup to
 * easily switch between different settings.
 * @param {string} presetName
 * @param {PageContext} pageContext
 * @param {string[]} supportedFeatures
 * @return {void}
 */
export function changePreset(pageContext, presetName, supportedFeatures) {
  const prefPostfix = getPrefPostfix(pageContext);
  const objdirs = getObjdirPrefValue();
  let recordingSettings = getRecordingSettingsFromPreset(
    presetName,
    supportedFeatures,
    objdirs
  );

  if (!recordingSettings) {
    // No recordingSettings were found for that preset. Most likely this means this
    // is a custom preset, or it's one that we dont recognize for some reason.
    // Get the preferences from the individual preference values.
    Services.prefs.setCharPref(PRESET_PREF + prefPostfix, presetName);
    recordingSettings = getRecordingSettings(pageContext, supportedFeatures);
  }

  setRecordingSettings(pageContext, recordingSettings);
}

/**
 * Add an observer for the profiler-related preferences.
 * @param {PrefObserver} observer
 * @return {void}
 */
export function addPrefObserver(observer) {
  Services.prefs.addObserver(PREF_PREFIX, observer);
}

/**
 * Removes an observer for the profiler-related preferences.
 * @param {PrefObserver} observer
 * @return {void}
 */
export function removePrefObserver(observer) {
  Services.prefs.removeObserver(PREF_PREFIX, observer);
}

/**
 * This map stores information that is associated with a "profile capturing"
 * action, so that we can look up this information for WebChannel messages
 * from the profiler tab.
 * Most importantly, this stores the captured profile. When the profiler tab
 * requests the profile, we can respond to the message with the correct profile.
 * This works even if the request happens long after the tab opened. It also
 * works for an "old" tab even if new profiles have been captured since that
 * tab was opened.
 * Supporting tab refresh is important because the tab sometimes reloads itself:
 * If an old version of the front-end is cached in the service worker, and the
 * browser supplies a profile with a newer format version, then the front-end
 * updates its service worker and reloads itself, so that the updated version
 * can parse the profile.
 *
 * This is a WeakMap so that the profile can be garbage-collected when the tab
 * is closed.
 *
 * @type {WeakMap<MockedExports.Browser, ProfilerBrowserInfo>}
 */
const infoForBrowserMap = new WeakMap();

/**
 * This handler computes the response for any messages coming
 * from the WebChannel from profiler.firefox.com.
 *
 * @param {RequestFromFrontend} request
 * @param {MockedExports.Browser} browser - The tab's browser.
 * @return {Promise<ResponseToFrontend>}
 */
async function getResponseForMessage(request, browser) {
  switch (request.type) {
    case "STATUS_QUERY": {
      // The content page wants to know if this channel exists. It does, so respond
      // back to the ping.
      const { ProfilerMenuButton } = lazy.ProfilerMenuButton();
      return {
        version: CURRENT_WEBCHANNEL_VERSION,
        menuButtonIsEnabled: ProfilerMenuButton.isInNavbar(),
      };
    }
    case "ENABLE_MENU_BUTTON": {
      const { ownerDocument } = browser;
      if (!ownerDocument) {
        throw new Error(
          "Could not find the owner document for the current browser while enabling " +
            "the profiler menu button"
        );
      }
      // Ensure the widget is enabled.
      Services.prefs.setBoolPref(POPUP_FEATURE_FLAG_PREF, true);

      // Force the preset to be "firefox-platform" if we enable the menu button
      // via web channel. If user goes through profiler.firefox.com to enable
      // it, it means that either user is a platform developer or filing a bug
      // report for performance engineers to look at.
      const supportedFeatures = Services.profiler.GetFeatures();
      changePreset("aboutprofiling", "firefox-platform", supportedFeatures);

      // Enable the profiler menu button.
      const { ProfilerMenuButton } = lazy.ProfilerMenuButton();
      ProfilerMenuButton.addToNavbar();

      // Dispatch the change event manually, so that the shortcuts will also be
      // added.
      const { CustomizableUI } = lazy.CustomizableUI();
      CustomizableUI.dispatchToolboxEvent("customizationchange");

      // Open the popup with a message.
      ProfilerMenuButton.openPopup(ownerDocument);

      // There is no response data for this message.
      return undefined;
    }
    case "GET_PROFILE": {
      const infoForBrowser = infoForBrowserMap.get(browser);
      if (infoForBrowser === undefined) {
        throw new Error("Could not find a profile for this tab.");
      }
      const { profileCaptureResult } = infoForBrowser;
      switch (profileCaptureResult.type) {
        case "SUCCESS":
          return profileCaptureResult.profile;
        case "ERROR":
          throw profileCaptureResult.error;
        default: {
          const { UnhandledCaseError } = lazy.Utils();
          throw new UnhandledCaseError(
            profileCaptureResult,
            "profileCaptureResult"
          );
        }
      }
    }
    case "GET_SYMBOL_TABLE": {
      const { debugName, breakpadId } = request;
      const symbolicationService = getSymbolicationServiceForBrowser(browser);
      return symbolicationService.getSymbolTable(debugName, breakpadId);
    }
    case "QUERY_SYMBOLICATION_API": {
      const { path, requestJson } = request;
      const symbolicationService = getSymbolicationServiceForBrowser(browser);
      return symbolicationService.querySymbolicationApi(path, requestJson);
    }
    case "GET_EXTERNAL_POWER_TRACKS": {
      const { startTime, endTime } = request;
      const externalPowerUrl = Services.prefs.getCharPref(
        "devtools.performance.recording.power.external-url",
        ""
      );
      if (externalPowerUrl) {
        const response = await fetch(
          `${externalPowerUrl}?start=${startTime}&end=${endTime}`
        );
        return response.json();
      }
      return [];
    }
    case "GET_EXTERNAL_MARKERS": {
      const { startTime, endTime } = request;
      const externalMarkersUrl = Services.prefs.getCharPref(
        "devtools.performance.recording.markers.external-url",
        ""
      );
      if (externalMarkersUrl) {
        const response = await fetch(
          `${externalMarkersUrl}?start=${startTime}&end=${endTime}`
        );
        return response.json();
      }
      return [];
    }
    case "GET_PAGE_FAVICONS": {
      const { pageUrls } = request;
      return getPageFavicons(pageUrls);
    }
    case "OPEN_SCRIPT_IN_DEBUGGER": {
      // This webchannel message type is added with version 5.
      const { tabId, scriptUrl, line, column } = request;
      const { openScriptInDebugger } = lazy.BrowserModule();
      return openScriptInDebugger(tabId, scriptUrl, line, column);
    }

    default: {
      console.error(
        "An unknown message type was received by the profiler's WebChannel handler.",
        request
      );
      const { UnhandledCaseError } = lazy.Utils();
      throw new UnhandledCaseError(request, "WebChannel request");
    }
  }
}

/**
 * Get the symbolicationService for the capture that opened this browser's
 * tab, or a fallback service for browsers from tabs opened by the user.
 *
 * @param {MockedExports.Browser} browser
 * @return {SymbolicationService}
 */
function getSymbolicationServiceForBrowser(browser) {
  // We try to serve symbolication requests that come from tabs that we
  // opened when a profile was captured, and for tabs that the user opened
  // independently, for example because the user wants to load an existing
  // profile from a file.
  const infoForBrowser = infoForBrowserMap.get(browser);
  if (infoForBrowser !== undefined) {
    // We opened this tab when a profile was captured. Use the symbolication
    // service for that capture.
    return infoForBrowser.symbolicationService;
  }

  // For the "foreign" tabs, we provide a fallback symbolication service so that
  // we can find symbols for any libraries that are loaded in this process. This
  // means that symbolication will work if the existing file has been captured
  // from the same build.
  const { createLocalSymbolicationService } = lazy.PerfSymbolication();
  return createLocalSymbolicationService(
    Services.profiler.sharedLibraries,
    getObjdirPrefValue()
  );
}

/**
 * This handler handles any messages coming from the WebChannel from profiler.firefox.com.
 *
 * @param {ProfilerWebChannel} channel
 * @param {string} id
 * @param {any} message
 * @param {MockedExports.WebChannelTarget} target
 */
export async function handleWebChannelMessage(channel, id, message, target) {
  if (typeof message !== "object" || typeof message.type !== "string") {
    console.error(
      "An malformed message was received by the profiler's WebChannel handler.",
      message
    );
    return;
  }
  const messageFromFrontend = /** @type {MessageFromFrontend} */ (message);
  const { requestId } = messageFromFrontend;

  try {
    const response = await getResponseForMessage(
      messageFromFrontend,
      target.browser
    );
    channel.send(
      {
        type: "SUCCESS_RESPONSE",
        requestId,
        response,
      },
      target
    );
  } catch (error) {
    let errorMessage;
    if (error instanceof Error) {
      errorMessage = `${error.name}: ${error.message}`;
    } else {
      errorMessage = `${error}`;
    }
    channel.send(
      {
        type: "ERROR_RESPONSE",
        requestId,
        error: errorMessage,
      },
      target
    );
  }
}

/**
 * @param {MockedExports.Browser} browser - The tab's browser.
 * @param {ProfileCaptureResult} profileCaptureResult - The Gecko profile.
 * @param {SymbolicationService} symbolicationService - An object which implements the
 *   SymbolicationService interface, whose getSymbolTable method will be invoked
 *   when profiler.firefox.com sends GET_SYMBOL_TABLE WebChannel messages to us. This
 *   method should obtain a symbol table for the requested binary and resolve the
 *   returned promise with it.
 */
export function registerProfileCaptureForBrowser(
  browser,
  profileCaptureResult,
  symbolicationService
) {
  infoForBrowserMap.set(browser, {
    profileCaptureResult,
    symbolicationService,
  });
}

/**
 * Get page favicons data and return them.
 *
 * @param {Array<string>} pageUrls
 *
 * @returns {Promise<Array<ProfilerFaviconData | null>>} favicon data as binary array.
 */
async function getPageFavicons(pageUrls) {
  if (!pageUrls || pageUrls.length === 0) {
    // Return early if the pages are not provided.
    return [];
  }

  // Get the data of favicons and return them.
  const { promiseFaviconData } = lazy.PlacesUtils();

  const promises = pageUrls.map(pageUrl =>
    promiseFaviconData(pageUrl, /* preferredWidth = */ 32)
      .then(favicon => {
        // Check if data is found in the database and return it if so.
        if (favicon.dataLen > 0 && favicon.data) {
          return {
            // PlacesUtils returns a number array for the data. Converting it to
            // the Uint8Array here to send it to the tab more efficiently.
            data: new Uint8Array(favicon.data).buffer,
            mimeType: favicon.mimeType,
          };
        }

        return null;
      })
      .catch(() => {
        // Couldn't find a favicon for this page, return null explicitly.
        return null;
      })
  );

  return Promise.all(promises);
}
