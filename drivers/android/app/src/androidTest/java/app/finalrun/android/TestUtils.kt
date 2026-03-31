package app.finalrun.android

import app.finalrun.android.data.ActionResponse
import app.finalrun.android.data.DeviceCache.getScreenHeight
import app.finalrun.android.data.DeviceCache.getScreenWidth

fun createErrorResponse(id: String, errorMsg: String): ActionResponse {
    return ActionResponse(
        requestId = id,
        success = false,
        message = errorMsg,
        data = null
    )
}

fun getXYPercentOnScreen(xP: Double, yP: Double): Pair<Int, Int>? {
    val screenWidth = getScreenWidth()
    val screenHeight = getScreenHeight()
    if (xP == 0.0 || yP == 0.0) return null
    val x = ((xP * screenWidth) / 100).toInt()
    val y = ((yP * screenHeight) / 100).toInt()
    return Pair(x, y)
}

/**
 * Calculate frame delay in milliseconds from FPS
 * Example calculation:
 * Frame Duration (in milliseconds)
 * Formula: (1 / Frame Rate) × 1000
 * (1 / 24) * 1000 = 41.6666
 * 
 * 4. Fix FPS calculation - ensure floating point division
 * Also adds bounds checking for safety
 */
fun calculateFrameDelay(frameRate: Int): Long {
    // Ensure valid frame rate (1-60 fps reasonable range)
    val fps = frameRate.coerceIn(1, 60)
    // Use floating point division to avoid integer truncation
    return (1000.0 / fps.toDouble()).toLong()
}