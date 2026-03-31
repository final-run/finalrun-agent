package app.finalrun.android.data

import org.json.JSONArray
import org.json.JSONObject

data class ScreenshotData(val action: String, val data: Data) {
    fun toJson(): JSONObject {
        val json = JSONObject()
        json.put("action", action)
        json.put("response", data.toJson())
        return json
    }
}

data class Data(
    val hierarchy: JSONArray,
    val screenWidth: Int,
    val screenHeight: Int
) {
    fun toJson(): JSONObject {
        val json = JSONObject()
        json.put("hierarchy", hierarchy)
        json.put("screenWidth", screenWidth)
        json.put("screenHeight", screenHeight)
        return json
    }
}