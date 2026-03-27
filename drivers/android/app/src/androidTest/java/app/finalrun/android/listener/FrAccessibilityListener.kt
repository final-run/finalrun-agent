package app.finalrun.android.listener

import android.app.UiAutomation
import android.os.Build
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast
import app.finalrun.android.debugLog

/**
 * A accessibility listener that handles Toast notifications.
 **/
object FrAccessibilityListener : UiAutomation.OnAccessibilityEventListener {

    private var toastNode: AccessibilityNodeInfo? = null
    private var recentToastTimeMillis: Long = 0
    private const val TOAST_LENGTH_LONG_DURATION = 3500
    private var isListening = false

    /**
     * Handles the accessibility event.
     *
     * @param accessibilityEvent The accessibility event.
     */
    override fun onAccessibilityEvent(accessibilityEvent: AccessibilityEvent) {
        when (accessibilityEvent.eventType) {
            AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED -> {
                val toastClassName = Toast::class.java.name
                if (accessibilityEvent.className?.toString()?.contains(toastClassName) == true) {
                    recentToastTimeMillis = System.currentTimeMillis()
                    val nodeInfo = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                        AccessibilityNodeInfo.obtain()
                    } else {
                        AccessibilityNodeInfo()
                    }
                    toastNode = nodeInfo.apply {
                        text = accessibilityEvent.text.firstOrNull()?.toString() ?: ""
                        className = toastClassName
                        isVisibleToUser = true
                        viewIdResourceName = ""
                        packageName = ""
                        isCheckable = false
                        isChecked = accessibilityEvent.isChecked
                        isClickable = false
                        isEnabled = accessibilityEvent.isEnabled
                        debugLog(msg = "FrAccessibilityListener: Toast received with text: $text")
                    }
                }
            }
        }
    }

    /**
     * Returns the last captured toast's AccessibilityNodeInfo.
     */
    fun getToastAccessibilityNode() = toastNode

    /**
     * Checks if the captured toast is considered timed out.
     */
    fun isToastTimedOut() =
        System.currentTimeMillis() - recentToastTimeMillis > TOAST_LENGTH_LONG_DURATION

    /**
     * Starts listening for accessibility events.
     *
     * @param uiAutomation The UiAutomation instance to register with.
     * @return The current instance.
     */
    fun start(uiAutomation: UiAutomation): FrAccessibilityListener {
        if (isListening) return this
        uiAutomation.setOnAccessibilityEventListener(this)
        isListening = true
        return this
    }

    /**
     * Stops listening for accessibility events.
     */
    fun stop() {
        isListening = false
    }
}
