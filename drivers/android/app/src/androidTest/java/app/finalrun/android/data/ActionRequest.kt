package app.finalrun.android.data

import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.annotation.JsonTypeName
import com.fasterxml.jackson.annotation.JsonProperty

// ----- Helper classes (stubs) -----
data class Point(
    @JsonProperty("x") val x: Int,
    @JsonProperty("y") val y: Int
)

data class PointPercent(
    @JsonProperty("xP") val xP: Double,
    @JsonProperty("yP") val yP: Double
)

data class AppUpload(
    @JsonProperty("packageName") val packageName: String
)

data class SingleArgument(
    @JsonProperty("type") val type: String,
    @JsonProperty("value") val value: String
)

// ----- Base Action class with Jackson annotations -----
@JsonTypeInfo(
    use = JsonTypeInfo.Id.NAME,
    include = JsonTypeInfo.As.PROPERTY,
    property = "type"
)
@JsonSubTypes(
    JsonSubTypes.Type(value = TapAction::class, name = Action.TAP),
    JsonSubTypes.Type(value = TapPercentAction::class, name = Action.TAP_PERCENT),
    JsonSubTypes.Type(value = EnterTextAction::class, name = Action.ENTER_TEXT),
    JsonSubTypes.Type(value = EraseTextAction::class, name = Action.ERASE_TEXT),
    JsonSubTypes.Type(value = CopyTextAction::class, name = Action.COPY_TEXT),
    JsonSubTypes.Type(value = PasteTextAction::class, name = Action.PASTE_TEXT),
    JsonSubTypes.Type(value = BackAction::class, name = Action.BACK),
    JsonSubTypes.Type(value = HomeAction::class, name = Action.HOME),
    JsonSubTypes.Type(value = RotateAction::class, name = Action.ROTATE),
    JsonSubTypes.Type(value = HideKeyboardAction::class, name = Action.HIDE_KEYBOARD),
    JsonSubTypes.Type(value = KillAppAction::class, name = Action.KILL_APP),
    JsonSubTypes.Type(value = LaunchAppAction::class, name = Action.LAUNCH_APP),
    JsonSubTypes.Type(value = PressKeyAction::class, name = Action.PRESS_KEY),
    JsonSubTypes.Type(value = SetLocationAction::class, name = Action.SET_LOCATION),
    JsonSubTypes.Type(value = GetAppListAction::class, name = Action.GET_APP_LIST),
    JsonSubTypes.Type(value = DeviceScaleAction::class, name = Action.GET_DEVICE_SCALE),
)
sealed class Action(@JsonProperty("requestId") open val requestId: String) {
    abstract val type: String

    companion object {
        const val TAP = "tap"
        const val TAP_PERCENT = "tapPercent"
        const val ENTER_TEXT = "enterText"
        const val ERASE_TEXT = "eraseText"
        const val COPY_TEXT = "copyText"
        const val PASTE_TEXT = "pasteText"
        const val BACK = "back"
        const val HOME = "home"
        const val ROTATE = "rotate"
        const val START_STREAMING = "startStreaming"
        const val STOP_STREAMING = "stopStreaming"
        const val STOP_EXECUTION = "stopExecution"
        const val GET_HIERARCHY = "getHierarchy"
        const val GET_SCREENSHOT = "getScreenshot"
        const val GET_SCREENSHOT_AND_HIERARCHY = "getScreenshotAndHierarchy"
        const val GET_SCREEN_DIMENSION = "getScreenDimension"
        const val HIDE_KEYBOARD = "hideKeyboard"
        const val KILL_APP = "killApp"
        const val LAUNCH_APP = "launchApp"
        const val SWITCH_TO_PRIMARY_APP = "switchToPrimaryApp"
        const val PRESS_KEY = "pressKey"
        const val GET_DEVICE_SCALE = "getDeviceScale"
        const val SET_LOCATION = "setLocation"
        const val CHECK_APP_IN_FOREGROUND = "checkAppInForeground"
        const val GET_APP_LIST = "getAppList"
    }
}

// ----- Action Subclasses -----

@JsonTypeName(Action.COPY_TEXT)
data class CopyTextAction(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = COPY_TEXT
}

@JsonTypeName(Action.PASTE_TEXT)
data class PasteTextAction(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = PASTE_TEXT
}

@JsonTypeName(Action.TAP)
data class TapAction(
    @JsonProperty("point") val point: Point,
    @JsonProperty("repeat") val repeat: Int? = null,
    @JsonProperty("delay") val delay: Int? = null,
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = TAP
}

@JsonTypeName(Action.TAP_PERCENT)
data class TapPercentAction(
    @JsonProperty("point") val point: PointPercent,
    @JsonProperty("repeat") val repeat: Int? = null,
    @JsonProperty("delay") val delay: Int? = null,
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = TAP_PERCENT
}

@JsonTypeName(Action.ENTER_TEXT)
data class EnterTextAction(
    @JsonProperty("value") val value: String,
    @JsonProperty("requestId") override val requestId: String,
    @JsonProperty("shouldEraseText") val shouldEraseText: Boolean,
    @JsonProperty("eraseCount") val eraseCount: Int? = null,  // Optional, used for erasing text
) : Action(requestId) {
    override val type: String = ENTER_TEXT
}

@JsonTypeName(Action.ERASE_TEXT)
data class EraseTextAction(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = ERASE_TEXT
}

@JsonTypeName(Action.BACK)
data class BackAction(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = BACK
}

@JsonTypeName(Action.GET_SCREENSHOT)
data class GetScreenshot(
    @JsonProperty("requestId") override val requestId: String,
    @JsonProperty("quality") val quality: Int? = 5,
) : Action(requestId) {
    override val type: String = GET_SCREENSHOT
}

@JsonTypeName(Action.GET_HIERARCHY)
data class GetHierarchy(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = GET_HIERARCHY
}

@JsonTypeName(Action.GET_SCREENSHOT_AND_HIERARCHY)
data class GetScreenshotAndHierarchy(
    @JsonProperty("requestId") override val requestId: String,
    @JsonProperty("quality") val quality: Int? = 5,
) : Action(requestId) {
    override val type: String = GET_SCREENSHOT_AND_HIERARCHY
}

@JsonTypeName(Action.GET_SCREEN_DIMENSION)
data class GetScreenDimension(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = GET_SCREEN_DIMENSION
}

@JsonTypeName(Action.CHECK_APP_IN_FOREGROUND)
data class CheckAppInForeground(
    @JsonProperty("requestId") override val requestId: String,
    @JsonProperty("packageName") val packageName: String,
    @JsonProperty("timeout") val timeout: Int // timeout in seconds
) : Action(requestId) {
    override val type: String = CHECK_APP_IN_FOREGROUND
}

@JsonTypeName(Action.HOME)
data class HomeAction(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = HOME
}

@JsonTypeName(Action.ROTATE)
data class RotateAction(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = ROTATE
}

@JsonTypeName(Action.START_STREAMING)
data class StartStreaming(
    @JsonProperty("requestId") override val requestId: String,
    @JsonProperty("fps") val fps: Int? = 24,
    @JsonProperty("quality") val quality: Int? = 5,
) : Action(requestId) {
    override val type: String = START_STREAMING
}

@JsonTypeName(Action.STOP_STREAMING)
data class StopStreaming(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = STOP_STREAMING
}

@JsonTypeName(Action.STOP_EXECUTION)
data class StopExecution(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = STOP_EXECUTION
}

@JsonTypeName(Action.HIDE_KEYBOARD)
data class HideKeyboardAction(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = HIDE_KEYBOARD
}

@JsonTypeName(Action.KILL_APP)
data class KillAppAction(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = KILL_APP
}

@JsonTypeName(Action.LAUNCH_APP)
data class LaunchAppAction(
    @JsonProperty("appUpload") val appUpload: AppUpload,
    @JsonProperty("allowAllPermissions") val allowAllPermissions: Boolean,
    @JsonProperty("arguments") val arguments: Map<String, SingleArgument>? = null,
    @JsonProperty("permissions") val permissions: Map<String, String>? = null,
    @JsonProperty("shouldUninstallBeforeLaunch") val shouldUninstallBeforeLaunch: Boolean,
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = LAUNCH_APP
}

@JsonTypeName(Action.SWITCH_TO_PRIMARY_APP)
data class SwitchToPrimaryAppAction(
    @JsonProperty("packageName") val packageName: String,
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = SWITCH_TO_PRIMARY_APP
}

@JsonTypeName(Action.PRESS_KEY)
data class PressKeyAction(
    @JsonProperty("key") val key: String,
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = PRESS_KEY
}

@JsonTypeName(Action.GET_DEVICE_SCALE)
data class DeviceScaleAction(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = GET_DEVICE_SCALE
}

@JsonTypeName(Action.SET_LOCATION)
data class SetLocationAction(
    @JsonProperty("lat") val lat: Double,
    @JsonProperty("long") val long: Double,
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = SET_LOCATION
}

@JsonTypeName(Action.GET_APP_LIST)
data class GetAppListAction(
    @JsonProperty("requestId") override val requestId: String
) : Action(requestId) {
    override val type: String = GET_APP_LIST
}
