package app.finalrun.android.data

import com.fasterxml.jackson.annotation.JsonTypeInfo

data class ActionResponse(
    val requestId: String? = null,
    val type: String? = null,
    val success: Boolean,
    val message: String? = null,
    val data: ActionResponseData? = null
)

@JsonTypeInfo(
    use = JsonTypeInfo.Id.NAME,
    include = JsonTypeInfo.As.PROPERTY,
    property = "type"
)
sealed class ActionResponseData

data class ActionResponseScreenshot(
    val screenshot: String? = null,
    val screenWidth: Int,
    val screenHeight: Int,
    val hierarchy: String?,
    val deviceTime: String? = null,
    val timezone: String? = null
) : ActionResponseData()

data class ActionResponseScreensDimension(
    val screenWidth: Int,
    val screenHeight: Int
) : ActionResponseData()

data class RotateResponse(
    val orientation: String
) : ActionResponseData()


data class TapActionResponseData(
    val x: Int,
    val y: Int
) : ActionResponseData()

data class AppListResponseData(
    val apps: List<Map<String, Any?>>
) : ActionResponseData()

data class DeviceScaleResponseData(
    val scale: Float
) : ActionResponseData()



