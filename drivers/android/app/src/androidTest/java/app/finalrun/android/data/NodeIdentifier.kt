package app.finalrun.android.data

import org.json.JSONObject

data class NodeIdentifier(
    val travelDownPath: String? = null,
    val travelUpCount: Int = -1,
    val srcNodeAttr: NodeAttr? = null,
    val connectingNodeAttr: NodeAttr? = null,
    val dstNodeAttr: NodeAttr? = null
) {
    fun isUniquelyIdentifiable(): Boolean = srcNodeAttr != null
            && travelDownPath == null
            && travelUpCount == -1
            && connectingNodeAttr == null
            && dstNodeAttr == null



    companion object {
        fun fromJson(json: JSONObject?): NodeIdentifier? {
            if (json == null) return null
            return NodeIdentifier(
                travelDownPath = NodeAttr.getStrValue(json, "travelDownPath"),
                travelUpCount = NodeAttr.getIntValue(json, "travelUpCount"),
                srcNodeAttr = NodeAttr.fromJson(json["srcNodeAttr"] as? JSONObject),
                connectingNodeAttr = NodeAttr.fromJson(json["connectingNodeAttr"] as? JSONObject),
                dstNodeAttr = NodeAttr.fromJson(json["dstNodeAttr"] as? JSONObject),
            )
        }
    }
}

