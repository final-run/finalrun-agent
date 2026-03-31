package app.finalrun.android.data.hierarchy

import android.graphics.Rect
import app.finalrun.android.data.NodeAttr
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

//Please add new properties in equals() and hashCode() methods as well, you can uuids or generated ids
data class AccNode(
    var id: String? = null,
    var uuid: String? = null,
    var parentId: String? = null,
    var resPkgName: String? = null,
    var clazz: String? = null,
    var packaze: String? = null,
    var contentDescription: String? = null,
    var bounds: Rect? = null,
    var text: String? = null,
    var isFocusable: Boolean = false,
    var isFocused: Boolean = false,
    var isSelected: Boolean = false,
    var isEnabled: Boolean = false,
    var isChecked: Boolean = false,
    var isClickable: Boolean = false,
    var isLongClickable: Boolean = false,
    var isCheckable: Boolean = false,
    var isDismissible: Boolean = false,
    var isEditable: Boolean = false,
    var isPassword: Boolean = false,
    var isScrollable: Boolean = false,
    var isMultiLine: Boolean = false,
    var isContextClickable: Boolean = false,
    var isAccessibilityFocused: Boolean = false,
    var isVisibleToUser: Boolean = true,
    var error: String? = null,
    var nodeIndex: Int = 0,
    var inputType: Int = 0,
    var maxTextLength: Int = 0
) {
    var children: List<String> = mutableListOf()

    @Throws(JSONException::class)
    fun toJSON(): JSONObject {
        val layoutJSON = JSONObject()
        layoutJSON.putOpt(ID, id)
        layoutJSON.putOpt(RES_PKG_NAME, resPkgName)
        layoutJSON.putOpt(PARENT_UUID, parentId)
        layoutJSON.putOpt(UUID, uuid)
        layoutJSON.putOpt(CONTENT_DESC, contentDescription)
        layoutJSON.putOpt(TEXT, text)
        layoutJSON.putOpt(PACKAGE, packaze)
        layoutJSON.putOpt(CLASS, clazz)
        layoutJSON.putOpt(IS_SELECTED, isSelected)
        layoutJSON.putOpt(IS_FOCUSED, isFocused)
        layoutJSON.putOpt(IS_FOCUSABLE, isFocusable)
        layoutJSON.putOpt(IS_ENABLED, isEnabled)
        layoutJSON.putOpt(IS_CHECKED, isChecked)
        layoutJSON.putOpt(IS_CLICKABLE, isClickable)
        layoutJSON.putOpt(IS_LONG_CLICKABLE, isLongClickable)
        layoutJSON.putOpt(IS_VISIBLE_TO_USER, isVisibleToUser)
        layoutJSON.putOpt("is_dismissible", isDismissible)
        layoutJSON.putOpt("is_password", isPassword)
        layoutJSON.putOpt("is_scrollable", isScrollable)
        layoutJSON.putOpt("error", error)
        layoutJSON.putOpt("input_type", inputType)
        layoutJSON.putOpt("max_text_length", maxTextLength)
        layoutJSON.putOpt(NODE_INDEX, nodeIndex)
        val childrenArr = JSONArray()
        for (i in children.indices) {
            childrenArr.put(children[i])
        }
        layoutJSON.putOpt(CHILDREN, childrenArr)
        val boundsObj = JSONObject()
        if (bounds != null) {
            boundsObj.putOpt(LEFT, bounds!!.left)
            boundsObj.putOpt(TOP, bounds!!.top)
            boundsObj.putOpt(RIGHT, bounds!!.right)
            boundsObj.putOpt(BOTTOM, bounds!!.bottom)
            layoutJSON.putOpt(BOUNDS, boundsObj)
        }
        return layoutJSON
    }

    companion object {
        const val ID = "id"
        const val UUID = "uuid"
        const val PARENT_UUID = "parent_uuid"
        const val RES_PKG_NAME = "resPkgName"
        const val NODE_INDEX = "node_index"
        const val CLASS = "class"
        const val PACKAGE = "package"
        const val CONTENT_DESC = "content_desc"
        const val BOUNDS = "bounds"
        const val TEXT = "text"
        const val IS_FOCUSABLE = "is_focusable"
        const val IS_FOCUSED = "is_focused"
        const val IS_SELECTED = "is_selected"
        const val IS_ENABLED = "is_enabled"
        const val IS_CHECKED = "is_checked"
        const val IS_CLICKABLE = "is_clickable"
        const val IS_LONG_CLICKABLE = "is_long_clickable"
        const val IS_VISIBLE_TO_USER = "is_visible_to_user"
        const val LEFT = "left"
        const val RIGHT = "right"
        const val TOP = "top"
        const val BOTTOM = "bottom"
        const val CHILDREN = "children"
    }

    fun matches(nodeAttr: NodeAttr): Boolean {
        if (nodeAttr.id != null && id != nodeAttr.id) {
            return false
        }
        if (nodeAttr.contentDesc != null && contentDescription != nodeAttr.contentDesc) {
            return false
        }
        if (nodeAttr.className != null && clazz != nodeAttr.className) {
            return false
        }
        if (nodeAttr.text != null && text != nodeAttr.text) {
            return false
        }

        return true
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is AccNode) return false

        return resPkgName == other.resPkgName &&
                clazz == other.clazz &&
                packaze == other.packaze &&
                contentDescription == other.contentDescription &&
                bounds == other.bounds &&
                text == other.text &&
                isFocusable == other.isFocusable &&
                isFocused == other.isFocused &&
                isSelected == other.isSelected &&
                isEnabled == other.isEnabled &&
                isChecked == other.isChecked &&
                isClickable == other.isClickable &&
                isLongClickable == other.isLongClickable &&
                isCheckable == other.isCheckable &&
                isDismissible == other.isDismissible &&
                isEditable == other.isEditable &&
                isPassword == other.isPassword &&
                isScrollable == other.isScrollable &&
                isMultiLine == other.isMultiLine &&
                isContextClickable == other.isContextClickable &&
                isAccessibilityFocused == other.isAccessibilityFocused &&
                error == other.error &&
                inputType == other.inputType
    }

    override fun hashCode(): Int {
        return listOf(
            resPkgName, clazz, packaze, contentDescription, bounds, text,
            isFocusable, isFocused, isSelected, isEnabled, isChecked, isClickable,
            isLongClickable, isCheckable, isDismissible, isEditable, isPassword,
            isScrollable, isMultiLine, isContextClickable, isAccessibilityFocused,
            error, inputType
        ).fold(0) { acc, prop -> 31 * acc + (prop?.hashCode() ?: 0) }
    }
}