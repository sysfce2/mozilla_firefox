/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.shortcut

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.text.TextUtils
import androidx.annotation.VisibleForTesting
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.core.net.toUri
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import mozilla.components.support.ktx.kotlin.stripCommonSubdomains
import org.mozilla.focus.activity.MainActivity
import org.mozilla.focus.ext.components
import org.mozilla.focus.state.AppAction
import java.util.UUID

/**
 * Helper methods for adding shortcuts to device's home screen.
 */
object HomeScreen {
    const val ADD_TO_HOMESCREEN_TAG = "add_to_homescreen"
    private const val BLOCKING_ENABLED = "blocking_enabled"
    const val REQUEST_DESKTOP = "request_desktop"

    /**
     * Checks if the launcher supports pinning shortcuts.
     */
    fun checkIfPinningSupported(
        context: Context,
        scope: CoroutineScope,
        mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
        ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    ) {
        if (context.components.appStore.state.isPinningSupported == null) {
            scope.launch(ioDispatcher) {
                val isPinningSupported =
                    ShortcutManagerCompat.isRequestPinShortcutSupported(context)
                scope.launch(mainDispatcher) {
                    context.components.appStore.dispatch(
                        AppAction.UpdateIsPinningSupported(isPinningSupported),
                    )
                }
            }
        }
    }

    /**
     * Create a shortcut for the given website on the device's home screen.
     */
    @Suppress("LongParameterList")
    fun installShortCut(
        context: Context,
        icon: Bitmap,
        url: String,
        title: String,
        blockingEnabled: Boolean,
        requestDesktop: Boolean,
    ) {
        val shortcutTitle = if (TextUtils.isEmpty(title.trim())) {
            generateTitleFromUrl(url)
        } else {
            title
        }

        installShortCutViaManager(context, icon, url, shortcutTitle, blockingEnabled, requestDesktop)

        // Creating shortcut flow is different on Android up to 7, so we want to go
        // to the home screen manually where the user will see the new shortcut appear
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.N_MR1) {
            goToHomeScreen(context)
        }
    }

    /**
     * Create a shortcut via the [ShortcutManagerCompat].
     *
     * On Android versions up to 7 shortcut will be created via system broadcast internally.
     *
     * On Android 8+ the user will have the ability to add the shortcut manually
     * or let the system place it automatically.
     */
    private fun installShortCutViaManager(
        context: Context,
        bitmap: Bitmap,
        url: String,
        title: String,
        blockingEnabled: Boolean,
        requestDesktop: Boolean,
    ) {
        val icon = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            IconCompat.createWithAdaptiveBitmap(bitmap)
        } else {
            IconCompat.createWithBitmap(bitmap)
        }
        val shortcut = ShortcutInfoCompat.Builder(context, UUID.randomUUID().toString())
            .setShortLabel(title)
            .setLongLabel(title)
            .setIcon(icon)
            .setIntent(createShortcutIntent(context, url, blockingEnabled, requestDesktop))
            .build()
        ShortcutManagerCompat.requestPinShortcut(context, shortcut, null)
    }

    private fun createShortcutIntent(
        context: Context,
        url: String,
        blockingEnabled: Boolean,
        requestDesktop: Boolean,
    ): Intent {
        val shortcutIntent = Intent(context, MainActivity::class.java)
        shortcutIntent.action = Intent.ACTION_VIEW
        shortcutIntent.data = url.toUri()
        shortcutIntent.putExtra(BLOCKING_ENABLED, blockingEnabled)
        shortcutIntent.putExtra(REQUEST_DESKTOP, requestDesktop)
        shortcutIntent.putExtra(ADD_TO_HOMESCREEN_TAG, ADD_TO_HOMESCREEN_TAG)
        return shortcutIntent
    }

    /**
     * Generates a new default title based on the URL.
     */
    @VisibleForTesting
    fun generateTitleFromUrl(url: String): String {
        // For now we just use the host name and strip common subdomains like "www" or "m".
        return url.toUri().host?.stripCommonSubdomains() ?: ""
    }

    /**
     * Switch to the the default home screen activity (launcher).
     */
    private fun goToHomeScreen(context: Context) {
        val intent = Intent(Intent.ACTION_MAIN)
        intent.addCategory(Intent.CATEGORY_HOME)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        context.startActivity(intent)
    }
}
