package app.finalrun.android.data

import android.os.Build
import android.util.DisplayMetrics
import okhttp3.Headers

data class DeviceInfo(
    val manufacturer: String = Build.MANUFACTURER,
    val model: String = Build.MODEL,
    val brand: String = Build.BRAND,
    val product: String = Build.PRODUCT,
    val osVersion: String = Build.VERSION.RELEASE,
    val sdkVersion: Int = Build.VERSION.SDK_INT,
    val hardware: String = Build.HARDWARE,
    var screenWidth: Int = DisplayMetrics().widthPixels,
    var screenHeight: Int = DisplayMetrics().heightPixels,
    var screenDensityDpi: Int = DisplayMetrics().densityDpi
) {
    fun createHeaders(deviceId: String, avdName: String?): Headers {
        val headersBuilder = Headers.Builder()

        headersBuilder.add("app_perfect_device_id", deviceId)
        headersBuilder.add("manufacturer", manufacturer)
        headersBuilder.add("model", model)
        headersBuilder.add("brand", brand)
        headersBuilder.add("product", product)
        headersBuilder.add("osVersion", osVersion)
        headersBuilder.add("sdkVersion", sdkVersion.toString())
        headersBuilder.add("hardware", hardware)
        headersBuilder.add("screenWidth", screenWidth.toString())
        headersBuilder.add("screenHeight", screenHeight.toString())
        headersBuilder.add("screenDensityDpi", screenDensityDpi.toString())
        if(avdName != null) headersBuilder.add("avdName", avdName)

        return headersBuilder.build()
    }
}

