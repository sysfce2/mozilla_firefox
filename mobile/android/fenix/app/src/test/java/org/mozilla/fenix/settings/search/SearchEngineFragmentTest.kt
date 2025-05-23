/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.search

import android.content.SharedPreferences
import androidx.preference.CheckBoxPreference
import androidx.preference.Preference
import androidx.preference.SwitchPreference
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.mockkStatic
import io.mockk.spyk
import io.mockk.unmockkObject
import io.mockk.verify
import mozilla.components.browser.state.state.SearchState
import mozilla.components.browser.state.state.selectedOrDefaultSearchEngine
import mozilla.components.support.test.robolectric.testContext
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.HomeActivity
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.FenixRobolectricTestRunner
import org.mozilla.fenix.utils.Settings
import org.mozilla.gecko.search.SearchWidgetProvider

@RunWith(FenixRobolectricTestRunner::class)
class SearchEngineFragmentTest {
    @Test
    fun `GIVEN pref_key_show_voice_search setting WHEN it is modified THEN the value is persisted and widgets updated`() {
        try {
            val settings = mockk<Settings>(relaxed = true)
            every { settings.preferences }
            every { testContext.components.settings } returns settings
            val preferences: SharedPreferences = mockk()
            val preferencesEditor: SharedPreferences.Editor = mockk(relaxed = true)
            every { settings.preferences } returns preferences
            every { preferences.edit() } returns preferencesEditor

            mockkObject(SearchWidgetProvider.Companion)

            val fragment = spyk(SearchEngineFragment()) {
                every { context } returns testContext
                every { isAdded } returns true
                every { activity } returns mockk<HomeActivity>(relaxed = true)
            }
            val voiceSearchPreferenceKey = testContext.getString(R.string.pref_key_show_voice_search)
            val voiceSearchPreference = spyk(SwitchPreference(testContext)) {
                every { key } returns voiceSearchPreferenceKey
            }
            // The type needed for "fragment.findPreference" / "fragment.requirePreference" is erased at compile time.
            // Hence we need individual mocks, specific for each preference's type.
            every {
                fragment.findPreference<SwitchPreference>(testContext.getString(R.string.pref_key_show_search_suggestions))
            } returns mockk(relaxed = true) {
                every { context } returns testContext
            }
            every {
                fragment.findPreference<SwitchPreference>(testContext.getString(R.string.pref_key_enable_autocomplete_urls))
            } returns mockk(relaxed = true) {
                every { context } returns testContext
            }
            every {
                fragment.findPreference<CheckBoxPreference>(testContext.getString(R.string.pref_key_show_search_suggestions_in_private))
            } returns mockk(relaxed = true) {
                every { context } returns testContext
            }
            every {
                fragment.findPreference<SwitchPreference>(testContext.getString(R.string.pref_key_search_browsing_history))
            } returns mockk(relaxed = true) {
                every { context } returns testContext
            }
            every {
                fragment.findPreference<SwitchPreference>(testContext.getString(R.string.pref_key_search_bookmarks))
            } returns mockk(relaxed = true) {
                every { context } returns testContext
            }
            every {
                fragment.findPreference<SwitchPreference>(testContext.getString(R.string.pref_key_search_synced_tabs))
            } returns mockk(relaxed = true) {
                every { context } returns testContext
            }
            every {
                fragment.findPreference<SwitchPreference>(testContext.getString(R.string.pref_key_show_clipboard_suggestions))
            } returns mockk(relaxed = true) {
                every { context } returns testContext
            }
            every {
                fragment.findPreference<SwitchPreference>(testContext.getString(R.string.pref_key_show_sponsored_suggestions))
            } returns mockk(relaxed = true) {
                every { context } returns testContext
            }
            every {
                fragment.findPreference<SwitchPreference>(testContext.getString(R.string.pref_key_show_nonsponsored_suggestions))
            } returns mockk(relaxed = true) {
                every { context } returns testContext
            }
            every {
                fragment.findPreference<Preference>(testContext.getString(R.string.pref_key_learn_about_fx_suggest))
            } returns mockk(relaxed = true) {
                every { context } returns testContext
            }
            // This preference is the sole purpose of this test
            every {
                fragment.findPreference<SwitchPreference>(voiceSearchPreferenceKey)
            } returns voiceSearchPreference
            every {
                fragment.findPreference<Preference>(testContext.getString(R.string.pref_key_default_search_engine))
            } returns mockk(relaxed = true) {
                every { context } returns testContext

                val searchEngineName = "MySearchEngine"
                mockkStatic("mozilla.components.browser.state.state.SearchStateKt")
                every { testContext.components.core.store.state.search } returns mockk(relaxed = true)
                every { any<SearchState>().selectedOrDefaultSearchEngine } returns mockk {
                    every { name } returns searchEngineName
                }
            }
            every {
                fragment.findPreference<CheckBoxPreference>(testContext.getString(R.string.pref_key_show_trending_search_suggestions))
            } returns mockk(relaxed = true) {
                every { context } returns testContext

                mockkStatic("mozilla.components.browser.state.state.SearchStateKt")
                every { testContext.components.core.store.state.search } returns mockk(relaxed = true)
                every { any<SearchState>().selectedOrDefaultSearchEngine } returns mockk(relaxed = true)
            }
            every {
                fragment.findPreference<SwitchPreference>(testContext.getString(R.string.pref_key_show_recent_search_suggestions))
            } returns mockk(relaxed = true) {
                every { context } returns testContext
            }
            every {
                fragment.findPreference<SwitchPreference>(testContext.getString(R.string.pref_key_show_shortcuts_suggestions))
            } returns mockk(relaxed = true) {
                every { context } returns testContext
            }

            // Trigger the preferences setup.
            fragment.onResume()
            voiceSearchPreference.callChangeListener(true)

            verify { preferencesEditor.putBoolean(voiceSearchPreferenceKey, true) }
            verify { SearchWidgetProvider.updateAllWidgets(testContext) }
        } finally {
            unmockkObject(SearchWidgetProvider.Companion)
        }
    }
}
