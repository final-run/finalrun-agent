package app.finalrun.android.data

import android.app.Instrumentation
import android.app.UiAutomation
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import app.finalrun.android.action.DeviceActions
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.KotlinModule

object DeviceCache {

    private val instrumentation: Instrumentation by lazy { InstrumentationRegistry.getInstrumentation() }
    val uiDevice: UiDevice by lazy { UiDevice.getInstance(instrumentation) }
    val uiAutomation: UiAutomation by lazy { instrumentation.uiAutomation }
    val context: Context by lazy { instrumentation.context }

    // Reusable, thread-safe ObjectMapper configured for Kotlin.
    val objectMapper: ObjectMapper =
        ObjectMapper().apply { configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false) }
            .registerModule(KotlinModule.Builder().build())

    private fun getDisplayMetrics(): DisplayMetrics {
        val displayMetrics = DisplayMetrics()
        DeviceActions.windowManager.defaultDisplay.getRealMetrics(displayMetrics)
        return displayMetrics
    }

    fun getScreenWidth() = getDisplayMetrics().widthPixels
    fun getScreenHeight() = getDisplayMetrics().heightPixels
}