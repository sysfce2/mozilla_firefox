/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.utils

import io.mockk.every
import io.mockk.spyk
import mozilla.components.concept.engine.Engine.HttpsOnlyMode.DISABLED
import mozilla.components.concept.engine.Engine.HttpsOnlyMode.ENABLED
import mozilla.components.concept.engine.Engine.HttpsOnlyMode.ENABLED_PRIVATE_ONLY
import mozilla.components.feature.sitepermissions.SitePermissionsRules
import mozilla.components.feature.sitepermissions.SitePermissionsRules.Action.ALLOWED
import mozilla.components.feature.sitepermissions.SitePermissionsRules.Action.ASK_TO_ALLOW
import mozilla.components.feature.sitepermissions.SitePermissionsRules.Action.BLOCKED
import mozilla.components.feature.sitepermissions.SitePermissionsRules.AutoplayAction
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.browser.browsingmode.BrowsingMode
import org.mozilla.fenix.components.toolbar.ToolbarPosition
import org.mozilla.fenix.settings.PhoneFeature
import org.mozilla.fenix.settings.deletebrowsingdata.DeleteBrowsingDataOnQuitType
import org.robolectric.RobolectricTestRunner
import java.util.Calendar

@RunWith(RobolectricTestRunner::class)
class SettingsTest {

    lateinit var settings: Settings

    private val defaultPermissions = SitePermissionsRules(
        camera = ASK_TO_ALLOW,
        location = ASK_TO_ALLOW,
        microphone = ASK_TO_ALLOW,
        notification = ASK_TO_ALLOW,
        autoplayAudible = AutoplayAction.BLOCKED,
        autoplayInaudible = AutoplayAction.ALLOWED,
        persistentStorage = ASK_TO_ALLOW,
        mediaKeySystemAccess = ASK_TO_ALLOW,
        crossOriginStorageAccess = ASK_TO_ALLOW,
    )

    @Before
    fun setUp() {
        settings = Settings(testContext)
    }

    @Test
    fun launchLinksInPrivateTab() {
        // When just created
        // Then
        assertFalse(settings.openLinksInAPrivateTab)

        // When
        settings.openLinksInAPrivateTab = true

        // Then
        assertTrue(settings.openLinksInAPrivateTab)
    }

    @Test
    fun shouldReturnToBrowser() {
        // When just created
        // Then
        assertFalse(settings.shouldReturnToBrowser)

        // When
        settings.shouldReturnToBrowser = true

        // Then
        assertTrue(settings.shouldReturnToBrowser)
    }

    @Test
    fun clearDataOnQuit() {
        // When just created
        // Then
        assertFalse(settings.shouldDeleteBrowsingDataOnQuit)

        // When
        settings.shouldDeleteBrowsingDataOnQuit = true

        // Then
        assertTrue(settings.shouldDeleteBrowsingDataOnQuit)

        // When
        settings.shouldDeleteBrowsingDataOnQuit = false

        // Then
        assertFalse(settings.shouldDeleteBrowsingDataOnQuit)
    }

    @Test
    fun clearAnyDataOnQuit() {
        // When just created
        // Then
        assertFalse(settings.shouldDeleteAnyDataOnQuit())

        // When
        settings.setDeleteDataOnQuit(DeleteBrowsingDataOnQuitType.TABS, true)

        // Then
        assertTrue(settings.shouldDeleteAnyDataOnQuit())

        // When
        settings.setDeleteDataOnQuit(DeleteBrowsingDataOnQuitType.PERMISSIONS, true)

        // Then
        assertTrue(settings.shouldDeleteAnyDataOnQuit())

        // When
        settings.setDeleteDataOnQuit(DeleteBrowsingDataOnQuitType.TABS, false)
        settings.setDeleteDataOnQuit(DeleteBrowsingDataOnQuitType.PERMISSIONS, false)

        // Then
        assertFalse(settings.shouldDeleteAnyDataOnQuit())
    }

    @Test
    fun defaultSearchEngineName() {
        // When just created
        // Then
        assertEquals("", settings.defaultSearchEngineName)

        // When
        settings.defaultSearchEngineName = "Mozilla"

        // Then
        assertEquals("Mozilla", settings.defaultSearchEngineName)
    }

    @Test
    fun isRemoteDebuggingEnabled() {
        // When just created
        // Then
        assertFalse(settings.isRemoteDebuggingEnabled)
    }

    @Test
    fun canShowCfrTest() {
        // When just created
        // Then
        assertEquals(0L, settings.lastCfrShownTimeInMillis)
        assertTrue(settings.canShowCfr)

        // When
        settings.lastCfrShownTimeInMillis = System.currentTimeMillis()

        // Then
        assertFalse(settings.canShowCfr)
    }

    @Test
    fun isTelemetryEnabled() {
        // When just created
        // Then
        assertTrue(settings.isTelemetryEnabled)
    }

    @Test
    fun showLoginsDialogWarningSync() {
        // When just created
        // Then
        assertEquals(0, settings.loginsSecureWarningSyncCount.value)

        // When
        settings.incrementShowLoginsSecureWarningSyncCount()

        // Then
        assertEquals(1, settings.loginsSecureWarningSyncCount.value)
    }

    @Test
    fun shouldShowLoginsDialogWarningSync() {
        // When just created
        // Then
        assertTrue(settings.shouldShowSecurityPinWarningSync)

        // When
        settings.incrementShowLoginsSecureWarningSyncCount()

        // Then
        assertFalse(settings.shouldShowSecurityPinWarningSync)
    }

    @Test
    fun showLoginsDialogWarning() {
        // When just created
        // Then
        assertEquals(0, settings.secureWarningCount.value)

        // When
        settings.incrementSecureWarningCount()

        // Then
        assertEquals(1, settings.secureWarningCount.value)
    }

    @Test
    fun shouldShowLoginsDialogWarning() {
        // When just created
        // Then
        assertTrue(settings.shouldShowSecurityPinWarning)

        // When
        settings.incrementSecureWarningCount()

        // Then
        assertFalse(settings.shouldShowSecurityPinWarning)
    }

    @Test
    fun shouldUseLightTheme() {
        // When just created
        // Then
        assertFalse(settings.shouldUseLightTheme)

        // When
        settings.shouldUseLightTheme = true

        // Then
        assertTrue(settings.shouldUseLightTheme)
    }

    @Test
    fun shouldManuallyCloseTabs() {
        // When just created
        // Then
        assertTrue(settings.manuallyCloseTabs)

        // When
        settings.manuallyCloseTabs = false

        // Then
        assertFalse(settings.manuallyCloseTabs)
    }

    @Test
    fun getTabTimeout() {
        // When just created
        // Then
        assertTrue(settings.manuallyCloseTabs)
        assertEquals(Long.MAX_VALUE, settings.getTabTimeout())

        // When
        settings.manuallyCloseTabs = false
        settings.closeTabsAfterOneDay = true

        // Then
        assertEquals(Settings.ONE_DAY_MS, settings.getTabTimeout())

        // When
        settings.closeTabsAfterOneDay = false
        settings.closeTabsAfterOneWeek = true

        // Then
        assertEquals(Settings.ONE_WEEK_MS, settings.getTabTimeout())

        // When
        settings.closeTabsAfterOneWeek = false
        settings.closeTabsAfterOneMonth = true

        // Then
        assertEquals(Settings.ONE_MONTH_MS, settings.getTabTimeout())
    }

    @Test
    fun shouldUseAutoSize() {
        // When just created
        // Then
        assertTrue(settings.shouldUseAutoSize)

        // When
        settings.shouldUseAutoSize = false

        // Then
        assertFalse(settings.shouldUseAutoSize)
    }

    @Test
    fun shouldAutofill() {
        // When just created
        // Then
        assertTrue(settings.shouldAutofillLogins)

        // When
        settings.shouldAutofillLogins = false

        // Then
        assertFalse(settings.shouldAutofillLogins)
    }

    @Test
    fun fontSizeFactor() {
        // When just created
        // Then
        assertEquals(1f, settings.fontSizeFactor)

        // When
        settings.fontSizeFactor = 2f

        // Then
        assertEquals(2f, settings.fontSizeFactor)
    }

    @Test
    fun shouldShowClipboardSuggestion() {
        // When just created
        // Then
        assertTrue(settings.shouldShowClipboardSuggestions)
    }

    @Test
    fun shouldShowSearchShortcuts() {
        // When just created
        // Then
        assertFalse(settings.shouldShowSearchShortcuts)
    }

    @Test
    fun shouldShowHistorySuggestions() {
        // When just created
        // Then
        assertTrue(settings.shouldShowHistorySuggestions)
    }

    @Test
    fun shouldShowBookmarkSuggestions() {
        // When just created
        // Then
        assertTrue(settings.shouldShowBookmarkSuggestions)
    }

    @Test
    fun shouldUseDarkTheme() {
        // When just created
        // Then
        assertFalse(settings.shouldUseDarkTheme)
    }

    @Test
    fun shouldFollowDeviceTheme() {
        // When just created
        // Then
        assertFalse(settings.shouldFollowDeviceTheme)

        // When
        settings.shouldFollowDeviceTheme = true

        // Then
        assertTrue(settings.shouldFollowDeviceTheme)
    }

    @Test
    fun shouldUseTrackingProtection() {
        // When
        // Then
        assertTrue(settings.shouldUseTrackingProtection)

        // When
        settings.shouldUseTrackingProtection = false

        // Then
        assertFalse(settings.shouldUseTrackingProtection)
    }

    @Test
    fun shouldShowCollectionsPlaceholderOnHome() {
        // When
        // Then
        assertTrue(settings.showCollectionsPlaceholderOnHome)

        // When
        settings.showCollectionsPlaceholderOnHome = false

        // Then
        assertFalse(settings.showCollectionsPlaceholderOnHome)
    }

    @Test
    fun shouldSetOpenInAppOpened() {
        // When
        // Then
        assertFalse(settings.openInAppOpened)

        // When
        settings.openInAppOpened = true

        // Then
        assertTrue(settings.openInAppOpened)
    }

    @Test
    fun shouldSetInstallPwaOpened() {
        // When
        // Then
        assertFalse(settings.installPwaOpened)

        // When
        settings.installPwaOpened = true

        // Then
        assertTrue(settings.installPwaOpened)
    }

    @Test
    fun shouldUseTrackingProtectionStrict() {
        // When
        // Then
        assertFalse(settings.useStrictTrackingProtection)
    }

    @Test
    fun shouldUseAutoBatteryTheme() {
        // When just created
        // Then
        assertFalse(settings.shouldUseAutoBatteryTheme)
    }

    @Test
    fun showSearchSuggestions() {
        // When just created
        // Then
        assertTrue(settings.shouldShowSearchSuggestions)
    }

    @Test
    fun showPwaFragment() {
        // When just created
        // Then
        assertFalse(settings.shouldShowPwaCfr)

        // When visited once
        settings.incrementVisitedInstallableCount()

        // Then
        assertFalse(settings.shouldShowPwaCfr)

        // When visited twice
        settings.incrementVisitedInstallableCount()

        // Then
        assertFalse(settings.shouldShowPwaCfr)

        // When visited thrice
        settings.incrementVisitedInstallableCount()

        // Then
        assertTrue(settings.shouldShowPwaCfr)
    }

    @Test
    fun sitePermissionsPhoneFeatureCameraAction() {
        // When just created
        // Then
        assertEquals(
            ASK_TO_ALLOW,
            settings.getSitePermissionsPhoneFeatureAction(PhoneFeature.CAMERA),
        )

        // When
        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.CAMERA, BLOCKED)

        // Then
        assertEquals(BLOCKED, settings.getSitePermissionsPhoneFeatureAction(PhoneFeature.CAMERA))
    }

    @Test
    fun sitePermissionsPhoneFeatureMicrophoneAction() {
        // When just created
        // Then
        assertEquals(
            ASK_TO_ALLOW,
            settings.getSitePermissionsPhoneFeatureAction(PhoneFeature.MICROPHONE),
        )

        // When
        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.MICROPHONE, BLOCKED)

        // Then
        assertEquals(
            BLOCKED,
            settings.getSitePermissionsPhoneFeatureAction(PhoneFeature.MICROPHONE),
        )
    }

    @Test
    fun sitePermissionsPhoneFeatureNotificationAction() {
        // When just created
        // Then
        assertEquals(
            ASK_TO_ALLOW,
            settings.getSitePermissionsPhoneFeatureAction(PhoneFeature.NOTIFICATION),
        )

        // When
        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.NOTIFICATION, BLOCKED)

        // Then
        assertEquals(
            BLOCKED,
            settings.getSitePermissionsPhoneFeatureAction(PhoneFeature.NOTIFICATION),
        )
    }

    @Test
    fun sitePermissionsPhoneFeatureLocation() {
        // When just created
        // Then
        assertEquals(
            ASK_TO_ALLOW,
            settings.getSitePermissionsPhoneFeatureAction(PhoneFeature.LOCATION),
        )

        // When
        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.LOCATION, BLOCKED)

        // Then
        assertEquals(BLOCKED, settings.getSitePermissionsPhoneFeatureAction(PhoneFeature.LOCATION))
    }

    @Test
    fun getSitePermissionsCustomSettingsRules_default() {
        // When just created
        // Then
        assertEquals(
            defaultPermissions,
            settings.getSitePermissionsCustomSettingsRules(),
        )
    }

    @Test
    fun getSitePermissionsCustomSettingsRules_camera() {
        // When
        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.CAMERA, BLOCKED)

        // Then
        assertEquals(
            defaultPermissions.copy(camera = BLOCKED),
            settings.getSitePermissionsCustomSettingsRules(),
        )
    }

    @Test
    fun getSitePermissionsCustomSettingsRules_notification() {
        // When
        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.NOTIFICATION, BLOCKED)

        // Then
        assertEquals(
            defaultPermissions.copy(notification = BLOCKED),
            settings.getSitePermissionsCustomSettingsRules(),
        )
    }

    @Test
    fun getSitePermissionsCustomSettingsRules_location() {
        // When
        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.LOCATION, BLOCKED)

        // Then
        assertEquals(
            defaultPermissions.copy(location = BLOCKED),
            settings.getSitePermissionsCustomSettingsRules(),
        )
    }

    @Test
    fun getSitePermissionsCustomSettingsRules_microphone() {
        // When
        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.MICROPHONE, BLOCKED)

        // Then
        assertEquals(
            defaultPermissions.copy(microphone = BLOCKED),
            settings.getSitePermissionsCustomSettingsRules(),
        )
    }

    @Test
    fun getSitePermissionsCustomSettingsRules_autoplayAudible() {
        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.AUTOPLAY_AUDIBLE, ALLOWED)

        assertEquals(
            defaultPermissions.copy(autoplayAudible = AutoplayAction.ALLOWED),
            settings.getSitePermissionsCustomSettingsRules(),
        )
    }

    @Test
    fun getSitePermissionsCustomSettingsRules_autoplayInaudible() {
        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.AUTOPLAY_INAUDIBLE, ALLOWED)

        assertEquals(
            defaultPermissions.copy(autoplayInaudible = AutoplayAction.ALLOWED),
            settings.getSitePermissionsCustomSettingsRules(),
        )
    }

    @Test
    fun getSitePermissionsCustomSettingsRules_autoplay_defaults() {
        val settings = Settings(testContext)

        assertEquals(
            AutoplayAction.BLOCKED,
            settings.getSitePermissionsCustomSettingsRules().autoplayAudible,
        )

        assertEquals(
            AutoplayAction.ALLOWED,
            settings.getSitePermissionsCustomSettingsRules().autoplayInaudible,
        )
    }

    @Test
    fun getSitePermissionsCustomSettingsRules_persistentStorage() {
        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.PERSISTENT_STORAGE, ALLOWED)

        assertEquals(
            defaultPermissions.copy(persistentStorage = ALLOWED),
            settings.getSitePermissionsCustomSettingsRules(),
        )

        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.PERSISTENT_STORAGE, BLOCKED)

        assertEquals(
            defaultPermissions.copy(persistentStorage = BLOCKED),
            settings.getSitePermissionsCustomSettingsRules(),
        )
    }

    @Test
    fun getSitePermissionsCustomSettingsRules_crossOriginStorageAccess() {
        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.CROSS_ORIGIN_STORAGE_ACCESS, ALLOWED)

        assertEquals(
            defaultPermissions.copy(crossOriginStorageAccess = ALLOWED),
            settings.getSitePermissionsCustomSettingsRules(),
        )

        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.CROSS_ORIGIN_STORAGE_ACCESS, BLOCKED)

        assertEquals(
            defaultPermissions.copy(crossOriginStorageAccess = BLOCKED),
            settings.getSitePermissionsCustomSettingsRules(),
        )
    }

    @Test
    fun getSitePermissionsCustomSettingsRules_mediaKeySystemAccess() {
        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.MEDIA_KEY_SYSTEM_ACCESS, ALLOWED)

        assertEquals(
            defaultPermissions.copy(mediaKeySystemAccess = ALLOWED),
            settings.getSitePermissionsCustomSettingsRules(),
        )

        settings.setSitePermissionsPhoneFeatureAction(PhoneFeature.MEDIA_KEY_SYSTEM_ACCESS, BLOCKED)

        assertEquals(
            defaultPermissions.copy(mediaKeySystemAccess = BLOCKED),
            settings.getSitePermissionsCustomSettingsRules(),
        )
    }

    @Test
    fun overrideAmoCollection() {
        // When just created
        // Then
        assertEquals("", settings.overrideAmoCollection)
        assertFalse(settings.amoCollectionOverrideConfigured())

        // When
        settings.overrideAmoCollection = "testCollection"

        // Then
        assertEquals("testCollection", settings.overrideAmoCollection)
        assertTrue(settings.amoCollectionOverrideConfigured())
    }

    @Test
    fun overrideAmoUser() {
        // When just created
        // Then
        assertEquals("", settings.overrideAmoUser)
        assertFalse(settings.amoCollectionOverrideConfigured())

        // When
        settings.overrideAmoUser = "testAmoUser"

        // Then
        assertEquals("testAmoUser", settings.overrideAmoUser)
        assertTrue(settings.amoCollectionOverrideConfigured())
    }

    @Test
    fun `GIVEN startOnHomeAlways is selected WHEN calling shouldStartOnHome THEN return true`() {
        settings.alwaysOpenTheHomepageWhenOpeningTheApp = true
        settings.alwaysOpenTheLastTabWhenOpeningTheApp = false
        settings.openHomepageAfterFourHoursOfInactivity = false

        assertTrue(settings.shouldStartOnHome())
    }

    @Test
    fun `GIVEN startOnHomeNever is selected WHEN calling shouldStartOnHome THEN return be false`() {
        settings.alwaysOpenTheLastTabWhenOpeningTheApp = true
        settings.alwaysOpenTheHomepageWhenOpeningTheApp = false
        settings.openHomepageAfterFourHoursOfInactivity = false

        assertFalse(settings.shouldStartOnHome())
    }

    @Test
    fun `GIVEN startOnHomeAfterFourHours is selected after four hours of inactivity WHEN calling shouldStartOnHome THEN return true`() {
        val localSetting = spyk(settings)
        val now = Calendar.getInstance()

        localSetting.openHomepageAfterFourHoursOfInactivity = true
        localSetting.alwaysOpenTheLastTabWhenOpeningTheApp = false
        localSetting.alwaysOpenTheHomepageWhenOpeningTheApp = false

        now.timeInMillis = System.currentTimeMillis()
        localSetting.lastBrowseActivity = now.timeInMillis
        now.add(Calendar.HOUR, 4)

        every { localSetting.timeNowInMillis() } returns now.timeInMillis

        assertTrue(localSetting.shouldStartOnHome())
    }

    @Test
    fun `GIVEN startOnHomeAfterFourHours is selected and with recent activity WHEN calling shouldStartOnHome THEN return false`() {
        val localSetting = spyk(settings)
        val now = System.currentTimeMillis()

        localSetting.openHomepageAfterFourHoursOfInactivity = true
        localSetting.alwaysOpenTheLastTabWhenOpeningTheApp = false
        localSetting.alwaysOpenTheHomepageWhenOpeningTheApp = false

        localSetting.lastBrowseActivity = now

        every { localSetting.timeNowInMillis() } returns now

        assertFalse(localSetting.shouldStartOnHome())
    }

    @Test
    fun `GIVEN re-engagement notification shown and number of app launch THEN should set re-engagement notification returns correct value`() {
        val localSetting = spyk(settings)

        localSetting.reEngagementNotificationShown = false
        localSetting.numberOfAppLaunches = 0
        assert(localSetting.shouldSetReEngagementNotification())

        localSetting.numberOfAppLaunches = 1
        assert(localSetting.shouldSetReEngagementNotification())

        localSetting.numberOfAppLaunches = 2
        assertFalse(localSetting.shouldSetReEngagementNotification())

        localSetting.reEngagementNotificationShown = true
        localSetting.numberOfAppLaunches = 0
        assertFalse(localSetting.shouldSetReEngagementNotification())
    }

    @Test
    fun `GIVEN re-engagement notification shown and is default browser THEN should show re-engagement notification returns correct value`() {
        val localSetting = spyk(settings)

        every { localSetting.isDefaultBrowserBlocking() } returns false

        localSetting.reEngagementNotificationShown = false
        assert(localSetting.shouldShowReEngagementNotification())

        localSetting.reEngagementNotificationShown = true
        assertFalse(localSetting.shouldShowReEngagementNotification())

        every { localSetting.isDefaultBrowserBlocking() } returns true

        localSetting.reEngagementNotificationShown = false
        assertFalse(localSetting.shouldShowReEngagementNotification())

        localSetting.reEngagementNotificationShown = true
        assertFalse(localSetting.shouldShowReEngagementNotification())
    }

    @Test
    fun inactiveTabsAreEnabled() {
        // When just created
        // Then
        assertTrue(settings.inactiveTabsAreEnabled)
    }

    @Test
    fun `GIVEN shouldShowInactiveTabsAutoCloseDialog WHEN the dialog has been dismissed before THEN no show the dialog`() {
        val settings = spyk(settings)
        every { settings.hasInactiveTabsAutoCloseDialogBeenDismissed } returns true

        assertFalse(settings.shouldShowInactiveTabsAutoCloseDialog(20))
    }

    @Test
    fun `GIVEN shouldShowInactiveTabsAutoCloseDialog WHEN the inactive tabs are less than the minimum THEN no show the dialog`() {
        assertFalse(settings.shouldShowInactiveTabsAutoCloseDialog(19))
    }

    @Test
    fun `GIVEN shouldShowInactiveTabsAutoCloseDialog WHEN closeTabsAfterOneMonth is already selected THEN no show the dialog`() {
        val settings = spyk(settings)
        every { settings.closeTabsAfterOneMonth } returns true

        assertFalse(settings.shouldShowInactiveTabsAutoCloseDialog(19))
    }

    @Test
    fun `GIVEN shouldShowInactiveTabsAutoCloseDialog WHEN the dialog has not been dismissed, with more inactive tabs than the queried and closeTabsAfterOneMonth not set THEN show the dialog`() {
        val settings = spyk(settings)
        every { settings.closeTabsAfterOneMonth } returns false
        every { settings.hasInactiveTabsAutoCloseDialogBeenDismissed } returns false

        assertTrue(settings.shouldShowInactiveTabsAutoCloseDialog(20))
    }

    @Test
    fun `GIVEN feature is disabled, hasUserBeenOnboarded is true and isLauncherIntent is true THEN shouldShowOnboarding returns false`() {
        val settings = spyk(settings)

        val actual = settings.shouldShowOnboarding(
            featureEnabled = false,
            hasUserBeenOnboarded = true,
            isLauncherIntent = true,
        )

        assertFalse(actual)
    }

    @Test
    fun `GIVEN feature is enabled, hasUserBeenOnboarded is false and isLauncherIntent is false THEN shouldShowOnboarding returns false`() {
        val settings = spyk(settings)

        val actual = settings.shouldShowOnboarding(
            featureEnabled = true,
            hasUserBeenOnboarded = false,
            isLauncherIntent = false,
        )

        assertFalse(actual)
    }

    @Test
    fun `GIVEN feature is enabled, hasUserBeenOnboarded is true THEN shouldShowOnboarding returns false`() {
        val settings = spyk(settings)

        val actual = settings.shouldShowOnboarding(
            featureEnabled = true,
            hasUserBeenOnboarded = true,
            isLauncherIntent = true,
        )

        assertFalse(actual)
    }

    @Test
    fun `GIVEN feature is enabled, hasUserBeenOnboarded is false and isLauncherIntent is true THEN shouldShowOnboarding returns true`() {
        val settings = spyk(settings)

        val actual = settings.shouldShowOnboarding(
            featureEnabled = true,
            hasUserBeenOnboarded = false,
            isLauncherIntent = true,
        )

        assertTrue(actual)
    }

    @Test
    fun `GIVEN Https-only mode is disabled THEN the engine mode is HttpsOnlyMode#DISABLED`() {
        settings.shouldUseHttpsOnly = false

        val result = settings.getHttpsOnlyMode()

        assertEquals(DISABLED, result)
    }

    @Test
    fun `GIVEN Https-only mode is enabled THEN the engine mode is HttpsOnlyMode#ENABLED`() {
        settings.shouldUseHttpsOnly = true

        val result = settings.getHttpsOnlyMode()

        assertEquals(ENABLED, result)
    }

    @Test
    fun `GIVEN Https-only mode is enabled for all tabs THEN the engine mode is HttpsOnlyMode#ENABLED`() {
        settings.apply {
            shouldUseHttpsOnly = true
            shouldUseHttpsOnlyInAllTabs = true
        }

        val result = settings.getHttpsOnlyMode()

        assertEquals(ENABLED, result)
    }

    @Test
    fun `GIVEN Https-only mode is enabled for only private tabs THEN the engine mode is HttpsOnlyMode#ENABLED_PRIVATE_ONLY`() {
        settings.apply {
            shouldUseHttpsOnly = true
            shouldUseHttpsOnlyInPrivateTabsOnly = true
        }

        val result = settings.getHttpsOnlyMode()

        assertEquals(ENABLED_PRIVATE_ONLY, result)
    }

    @Test
    fun `GIVEN unset user preferences THEN https-only is disabled`() {
        assertFalse(settings.shouldUseHttpsOnly)
    }

    @Test
    fun `GIVEN unset user preferences THEN https-only is enabled for all tabs`() {
        assertTrue(settings.shouldUseHttpsOnlyInAllTabs)
    }

    @Test
    fun `GIVEN unset user preferences THEN https-only is disabled for private tabs`() {
        assertFalse(settings.shouldUseHttpsOnlyInPrivateTabsOnly)
    }

    @Test
    fun `GIVEN open links in apps setting THEN return the correct display string`() {
        settings.openLinksInExternalApp = "pref_key_open_links_in_apps_always"
        settings.lastKnownMode = BrowsingMode.Normal
        assertEquals(settings.getOpenLinksInAppsString(), "Always")

        settings.openLinksInExternalApp = "pref_key_open_links_in_apps_ask"
        assertEquals(settings.getOpenLinksInAppsString(), "Ask before opening")

        settings.openLinksInExternalApp = "pref_key_open_links_in_apps_never"
        assertEquals(settings.getOpenLinksInAppsString(), "Never")

        settings.openLinksInExternalApp = "pref_key_open_links_in_apps_always"
        settings.lastKnownMode = BrowsingMode.Private
        assertEquals(settings.getOpenLinksInAppsString(), "Ask before opening")

        settings.openLinksInExternalApp = "pref_key_open_links_in_apps_ask"
        assertEquals(settings.getOpenLinksInAppsString(), "Ask before opening")

        settings.openLinksInExternalApp = "pref_key_open_links_in_apps_never"
        assertEquals(settings.getOpenLinksInAppsString(), "Never")
    }

    @Test
    fun `GIVEN a written integer value for pref_key_search_widget_installed WHEN reading searchWidgetInstalled THEN do not throw a ClassCastException`() {
        val expectedInt = 5
        val oldPrefKey = "pref_key_search_widget_installed"

        settings.preferences.edit().putInt(oldPrefKey, expectedInt).apply()

        try {
            assertEquals(expectedInt, settings.preferences.getInt(oldPrefKey, 0))
            assertFalse(settings.searchWidgetInstalled)
        } catch (e: ClassCastException) {
            fail("Unexpected ClassCastException")
        }
    }

    @Test
    fun `GIVEN previously stored pref_key_search_widget_installed value WHEN calling migrateSearchWidgetInstalledIfNeeded THEN migrate the value`() {
        val expectedInt = 5
        val oldPrefKey = "pref_key_search_widget_installed"

        settings.preferences.edit().putInt(oldPrefKey, expectedInt).apply()

        assertEquals(expectedInt, settings.preferences.getInt(oldPrefKey, 0))
        assertFalse(settings.searchWidgetInstalled)

        settings.migrateSearchWidgetInstalledPrefIfNeeded()

        assertTrue(settings.searchWidgetInstalled)
    }

    @Test
    fun `GIVEN none previously stored pref_key_search_widget_installed value WHEN calling migrateSearchWidgetInstalledIfNeeded THEN migration should not happen`() {
        val oldPrefKey = "pref_key_search_widget_installed"
        val expectedDefaultValue = 0
        val storedValue = settings.preferences.getInt(oldPrefKey, expectedDefaultValue)

        assertEquals(expectedDefaultValue, storedValue)

        settings.migrateSearchWidgetInstalledPrefIfNeeded()

        assertEquals(expectedDefaultValue, settings.preferences.getInt(oldPrefKey, expectedDefaultValue))
        assertFalse(settings.searchWidgetInstalled)
    }

    @Test
    fun `GIVEN previously stored pref_key_search_widget_installed value is Boolean WHEN calling migrateSearchWidgetInstalledIfNeeded THEN crash should not happen`() {
        val oldPrefKey = "pref_key_search_widget_installed"
        settings.preferences.edit().putBoolean(oldPrefKey, false).apply()

        settings.migrateSearchWidgetInstalledPrefIfNeeded()
        assertFalse(settings.searchWidgetInstalled)
    }

    @Test
    fun `GIVEN only microsurvey is enabled WHEN getBottomToolbarContainerHeight THEN returns microsurvey height`() {
        val settings = spyk(settings)
        every { settings.shouldShowMicrosurveyPrompt } returns true

        val bottomToolbarContainerHeight = settings.getBottomToolbarContainerHeight()

        assertEquals(131, bottomToolbarContainerHeight)
    }

    @Test
    fun `GIVEN the address bar and the microsurvey are shown at bottom WHEN getBottomToolbarHeight THEN returns the combined height`() {
        val settings = spyk(settings)
        every { settings.shouldShowMicrosurveyPrompt } returns true
        every { settings.toolbarPosition } returns ToolbarPosition.BOTTOM

        val bottomToolbarHeight = settings.getBottomToolbarHeight()

        assertEquals(187, bottomToolbarHeight)
    }

    @Test
    fun `GIVEN just the microsurvey is shown at bottom WHEN getBottomToolbarHeight THEN returns it's height`() {
        val settings = spyk(settings)
        every { settings.shouldShowMicrosurveyPrompt } returns true
        every { settings.toolbarPosition } returns ToolbarPosition.TOP

        val bottomToolbarHeight = settings.getBottomToolbarHeight()

        assertEquals(131, bottomToolbarHeight)
    }

    @Test
    fun `GIVEN just the addressbar is shown at bottom WHEN getBottomToolbarHeight THEN returns it's height`() {
        val settings = spyk(settings)
        every { settings.shouldShowMicrosurveyPrompt } returns false
        every { settings.toolbarPosition } returns ToolbarPosition.BOTTOM

        val bottomToolbarHeight = settings.getBottomToolbarHeight()

        assertEquals(56, bottomToolbarHeight)
    }

    @Test
    fun `GIVEN navigation bar and microsurvey is enabled WHEN getBottomToolbarContainerHeight THEN returns the combined height`() {
        val settings = spyk(settings)
        every { settings.shouldShowMicrosurveyPrompt } returns true
        every { settings.shouldUseSimpleToolbar } returns false

        val bottomToolbarContainerHeight = settings.getBottomToolbarContainerHeight()

        assertEquals(191, bottomToolbarContainerHeight)
    }

    @Test
    fun `GIVEN the address bar, navigation bar and the microsurvey are shown at bottom WHEN getBottomToolbarHeight THEN returns the combined height`() {
        val settings = spyk(settings)
        every { settings.shouldShowMicrosurveyPrompt } returns true
        every { settings.shouldUseSimpleToolbar } returns false
        every { settings.toolbarPosition } returns ToolbarPosition.BOTTOM

        val bottomToolbarHeight = settings.getBottomToolbarHeight()

        assertEquals(247, bottomToolbarHeight)
    }

    @Test
    fun `GIVEN navigation bar and microsurvey is shown at bottom WHEN getBottomToolbarHeight THEN returns the combined height`() {
        val settings = spyk(settings)
        every { settings.shouldShowMicrosurveyPrompt } returns true
        every { settings.shouldUseSimpleToolbar } returns false
        every { settings.toolbarPosition } returns ToolbarPosition.TOP

        val bottomToolbarHeight = settings.getBottomToolbarHeight()

        assertEquals(191, bottomToolbarHeight)
    }

    @Test
    fun `GIVEN the addressbar and navigation bar is shown at bottom WHEN getBottomToolbarHeight THEN returns the combined height`() {
        val settings = spyk(settings)
        every { settings.shouldShowMicrosurveyPrompt } returns false
        every { settings.shouldUseSimpleToolbar } returns false
        every { settings.toolbarPosition } returns ToolbarPosition.BOTTOM

        val bottomToolbarHeight = settings.getBottomToolbarHeight()

        assertEquals(116, bottomToolbarHeight)
    }

    @Test
    fun `GIVEN recent search is enable THEN should show recent searches only if recent search is visible`() {
        val settings = spyk(settings)
        every { settings.recentSearchSuggestionsEnabled } returns true
        every { settings.isRecentSearchesVisible } returns true

        assertTrue(settings.shouldShowRecentSearchSuggestions)

        every { settings.isRecentSearchesVisible } returns false
        every { settings.recentSearchSuggestionsEnabled } returns true
        assertFalse(settings.shouldShowRecentSearchSuggestions)

        every { settings.isRecentSearchesVisible } returns true
        every { settings.recentSearchSuggestionsEnabled } returns false
        assertFalse(settings.shouldShowRecentSearchSuggestions)
    }

    @Test
    fun `GIVEN shortcut suggestions is enable THEN should show shortcut suggestions only if shortcut suggestions is visible`() {
        val settings = spyk(settings)
        every { settings.shortcutSuggestionsEnabled } returns true
        every { settings.isShortcutSuggestionsVisible } returns true
        assertTrue(settings.shouldShowShortcutSuggestions)

        every { settings.shortcutSuggestionsEnabled } returns true
        every { settings.isShortcutSuggestionsVisible } returns false
        assertFalse(settings.shouldShowShortcutSuggestions)

        every { settings.shortcutSuggestionsEnabled } returns false
        every { settings.isShortcutSuggestionsVisible } returns true
        assertFalse(settings.shouldShowShortcutSuggestions)
    }

    @Test
    fun `GIVEN the conditions to show a prompt are not met WHEN checking prompt eligibility THEN shouldShowSetAsDefaultPrompt is false`() {
        settings.numberOfSetAsDefaultPromptShownTimes = 0
        settings.lastSetAsDefaultPromptShownTimeInMillis = System.currentTimeMillis()
        settings.coldStartsBetweenSetAsDefaultPrompts = 5

        assertFalse(settings.shouldShowSetAsDefaultPrompt)
    }

    @Test
    fun `GIVEN the prompt has been shown maximum times WHEN checking prompt eligibility THEN shouldShowSetAsDefaultPrompt is false`() {
        settings.numberOfSetAsDefaultPromptShownTimes = 3 // Maximum number of times the prompt can be shown based on the design criteria
        settings.lastSetAsDefaultPromptShownTimeInMillis = 0L
        settings.coldStartsBetweenSetAsDefaultPrompts = 5

        assertFalse(settings.shouldShowSetAsDefaultPrompt)
    }

    @Test
    fun `GIVEN the time since last prompt is too short WHEN checking prompt eligibility THEN shouldShowSetAsDefaultPrompt is false`() {
        settings.numberOfSetAsDefaultPromptShownTimes = 1
        settings.lastSetAsDefaultPromptShownTimeInMillis = System.currentTimeMillis() - 1000
        settings.coldStartsBetweenSetAsDefaultPrompts = 5

        assertFalse(settings.shouldShowSetAsDefaultPrompt)
    }

    @Test
    fun `GIVEN not enough cold starts WHEN checking prompt eligibility THEN shouldShowSetAsDefaultPrompt is false`() {
        settings.numberOfSetAsDefaultPromptShownTimes = 1
        settings.lastSetAsDefaultPromptShownTimeInMillis = 0L
        settings.coldStartsBetweenSetAsDefaultPrompts = 1

        assertFalse(settings.shouldShowSetAsDefaultPrompt)
    }

    @Test
    fun `GIVEN enough cold starts and conditions met WHEN checking prompt eligibility THEN shouldShowSetAsDefaultPrompt is true`() {
        settings.numberOfSetAsDefaultPromptShownTimes = 1
        settings.lastSetAsDefaultPromptShownTimeInMillis = 0L
        settings.coldStartsBetweenSetAsDefaultPrompts = 5 // More than required cold starts

        assertTrue(settings.shouldShowSetAsDefaultPrompt)
    }
}
