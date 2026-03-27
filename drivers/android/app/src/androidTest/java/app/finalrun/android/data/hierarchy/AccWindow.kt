package app.finalrun.android.data.hierarchy

import android.graphics.Rect
import org.json.JSONException
import org.json.JSONObject

class AccWindow {
    var bounds: Rect? = null
    var isFocused = false
    var isInPictureInPictureMode = false
    var accNode: AccNode? = null
    @Throws(JSONException::class)
    fun toJSON(): JSONObject {
        val layoutJSON = JSONObject()
        val boundsObj = JSONObject()
        if (bounds != null) {
            boundsObj.putOpt(LEFT, bounds!!.left)
            boundsObj.putOpt(TOP, bounds!!.top)
            boundsObj.putOpt(RIGHT, bounds!!.right)
            boundsObj.putOpt(BOTTOM, bounds!!.bottom)
            layoutJSON.putOpt(BOUNDS, boundsObj)
        }
        layoutJSON.put("isFocused", isFocused)
        layoutJSON.put("isInPictureInPictureMode", isInPictureInPictureMode)
        layoutJSON.putOpt("accNode", accNode!!.toJSON())
        return layoutJSON
    }

    companion object {
        const val BOUNDS = "bounds"
        const val LEFT = "left"
        const val RIGHT = "right"
        const val TOP = "top"
        const val BOTTOM = "bottom"
    }
}