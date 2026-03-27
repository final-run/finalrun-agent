package app.finalrun.android

import android.util.Log

const val DEFAULT_TAG = "FinalRunAndroid"
fun debugLog(msg: String, tag: String = DEFAULT_TAG) {
    Log.d(tag, msg)
}

fun errorLog(msg: String, tag: String = DEFAULT_TAG) {
    Log.e(tag, msg)
}