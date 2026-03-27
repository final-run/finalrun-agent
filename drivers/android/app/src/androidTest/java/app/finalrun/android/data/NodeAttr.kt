package app.finalrun.android.data

import app.finalrun.android.debugLog
import org.json.JSONObject

const val CLASS_NAME = "className"
const val CONTENT_DESC = "contentDesc"
const val ID = "id"
const val TEXT = "text"

data class NodeAttr(
    var className: String?,
    var contentDesc: String?,
    var id: String?,
    var text: String?,
    var count: Int
) {
    companion object {

        fun getIntValue(json: JSONObject, key: String): Int {
            if (!json.has(key)) return -1
            return json.optInt(key, -1)
        }

        fun getStrValue(json: JSONObject, key: String): String? {
            if (!json.has(key)) return null
            val value = json.optString(key)
            if (isNotNullAndNotEmpty(value)) return null
            return value
        }

        fun fromJson(json: JSONObject?): NodeAttr? {
            if(json == null) return null
            debugLog("ActionIdentifier: json: $json")
            val className: String? = getStrValue(json, CLASS_NAME)
            val contentDesc: String? = getStrValue(json, CONTENT_DESC)
            val id: String? = getStrValue(json, ID)
            val text: String? = getStrValue(json, TEXT)
            val count: Int = getIntValue(json, "count")

            return NodeAttr(
                className,
                contentDesc,
                id,
                text,
                count
            )
        }

        private fun isNotNullAndNotEmpty(strVal: String?) =
            strVal != null && (strVal.isEmpty() || strVal == "null")
    }

    fun toJson(): Map<String, Any?> {
        return mapOf(
            ID to id,
            CLASS_NAME to className,
            CONTENT_DESC to contentDesc,
            TEXT to text,
            "count" to count
        )
    }
}
