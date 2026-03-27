package app.finalrun.android

import org.json.JSONArray
import org.json.JSONObject

// Extension function on JSONObject to convert it to a Map<String, Any>
fun JSONObject.toMap(): Map<String, Any> {
    val map = mutableMapOf<String, Any>()
    keys().forEach { key ->
        val value = get(key)
        map[key] = when (value) {
            is JSONObject -> value.toMap()
            is JSONArray -> value.toList()
            else -> value
        }
    }
    return map
}

// Extension function on JSONArray to convert it to a List<Any>
fun JSONArray.toList(): List<Any> {
    val list = mutableListOf<Any>()
    for (i in 0 until length()) {
        val value = get(i)
        list.add(
            when (value) {
                is JSONObject -> value.toMap()
                is JSONArray -> value.toList()
                else -> value
            }
        )
    }
    return list
}