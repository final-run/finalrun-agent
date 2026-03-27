package app.finalrun.android.action
//
//import android.graphics.Point
//import android.graphics.Rect
//import app.finalrun.android.ACTION
//import app.finalrun.android.ACTION_EXECUTE
//import app.finalrun.android.ARGUMENTS
//import app.finalrun.android.ASSERT_CONTAINS
//import app.finalrun.android.ASSERT_ENDS_WITH
//import app.finalrun.android.ASSERT_IS_CHECKED
//import app.finalrun.android.ASSERT_IS_NOT_CHECKED
//import app.finalrun.android.ASSERT_STARTS_WITH
//import app.finalrun.android.ASSERT_TEXT_VALUE
//import app.finalrun.android.data.DeviceCache.context
//import app.finalrun.android.data.DeviceCache.getScreenHeight
//import app.finalrun.android.data.DeviceCache.getScreenWidth
//import app.finalrun.android.data.DeviceCache.uiAutomation
//import app.finalrun.android.data.DeviceCache.uiDevice
//import app.finalrun.android.BACK_BUTTON_CLICK
//import app.finalrun.android.CAPTURED_TEXT
//import app.finalrun.android.CAPTURE_TEXT
//import app.finalrun.android.CMD
//import app.finalrun.android.CODE
//import app.finalrun.android.ENTER_TEXT
//import app.finalrun.android.FAILED_REASON
//import app.finalrun.android.FPS_24
//import app.finalrun.android.GO_TO_HOME_SCREEN
//import app.finalrun.android.HORIZONTAL_SCROLL
//import app.finalrun.android.IS_DEVICE_ACTION
//import app.finalrun.android.LAUNCH_APP
//import app.finalrun.android.NODE_BOUNDS
//import app.finalrun.android.NODE_IDENTIFIER
//import app.finalrun.android.PACKAGE_NAME
//import app.finalrun.android.REQUEST_ID
//import app.finalrun.android.RESPONSE
//import app.finalrun.android.ROTATE
//import app.finalrun.android.ROTATE_LEFT
//import app.finalrun.android.ROTATE_RIGHT
//import app.finalrun.android.ROTATE_TO_PORTRAIT
//import app.finalrun.android.SCREENSHOT
//import app.finalrun.android.SCREEN_CLICK_INFO
//import app.finalrun.android.SCREEN_HEIGHT
//import app.finalrun.android.SCREEN_WIDTH
//import app.finalrun.android.SCROLL_DOWN
//import app.finalrun.android.SCROLL_LEFT
//import app.finalrun.android.SCROLL_RIGHT
//import app.finalrun.android.SCROLL_UP
//import app.finalrun.android.SELECT_APP
//import app.finalrun.android.START_STREAMING
//import app.finalrun.android.STEP_ID
//import app.finalrun.android.STOP_EXECUTION
//import app.finalrun.android.STOP_STREAMING
//import app.finalrun.android.SUCCESS
//import app.finalrun.android.TEST_EXEC_ID
//import app.finalrun.android.TEST_ID
//import app.finalrun.android.VALIDATE_ELEMENT
//import app.finalrun.android.VALIDATE_TEXT
//import app.finalrun.android.VARIABLE_NAME
//import app.finalrun.android.VERTICAL_SCROLL
//import app.finalrun.android.data.NodeIdentifier
//import app.finalrun.android.data.hierarchy.AccNode
//import app.finalrun.android.data.hierarchy.AccessibilityStreamer
//import app.finalrun.android.debugLog
//import app.finalrun.android.listener.FrAccessibilityListener
//import app.finalrun.android.toMap
//import app.finalrun.android.data.Data
//import app.finalrun.android.data.ScreenshotData
//import kotlinx.coroutines.Dispatchers
//import kotlinx.coroutines.GlobalScope
//import kotlinx.coroutines.delay
//import kotlinx.coroutines.launch
//import kotlinx.coroutines.runBlocking
////import okhttp3.WebSocket
//import org.java_websocket.WebSocket
//import org.json.JSONArray
//import org.json.JSONObject
//import kotlin.io.encoding.Base64
//import kotlin.io.encoding.ExperimentalEncodingApi
//
//object TestActions {
//
//    private var shouldPingScreenshotData = true
//    private var accessibilityListener: FrAccessibilityListener? = null
//
//    //below is marked true only in case of 'execute' command
//    private var shouldExecuteTest = true
//
//    fun performAction(action: String, webSocket: WebSocket, json: JSONObject) {
//        when (action) {
//            START_STREAMING -> {
//                enableStreaming()
//                startStreaming(webSocket)
//            }
//
//            STOP_STREAMING -> {
//                disableStreaming()
//            }
//
//            STOP_EXECUTION -> {
//                disableTestExecute()
//            }
//
//            ACTION_EXECUTE -> {
//                enableTestExecute()
//                actionTestExecute(json, action, webSocket)
//            }
//
//            SELECT_APP -> {
//                val appList = DeviceActions.getAppList(context)
//                returnResponseForDeviceList(action, appList, webSocket)
//            }
////            GET_SCREENSHOT_AND_HIERARCHY -> {
////                val requestId = json.getString(REQUEST_ID)
////                sendScreenshotAndHierarchy(action, requestId, webSocket)
////            }
////
//
//            else -> {
//                debugLog(msg = "TestActions: performAction(): action : $action NOT implemented on ANDROID side")
//            }
//        }
//    }
//
//
//
//    private fun sendScreenshotAndHierarchy(
//        action: String,
//        requestId: String?,
//        webSocket: WebSocket
//    ) = runBlocking {
//        DeviceActions.waitForIdle()
//        delay(1000)
//        val screenWidth = getScreenWidth()
//        val screenHeight = getScreenHeight()
//        val accHierarchy =
//            AccessibilityStreamer.getHierarchyForStreaming(screenWidth, screenHeight)
//        //accHierarchy is String
//        val screenshot = DeviceActions.getScreenshotInBase64()
//        //screenshot is String base64
//
//        val returnJson = JSONObject()
//        returnJson.put(ACTION, action)
//        returnJson.put(REQUEST_ID, requestId)
//        val resJson = JSONObject()
//        resJson.put("hierarchy", accHierarchy)
//        resJson.put(SCREENSHOT, screenshot)
//        resJson.put(SCREEN_WIDTH, screenWidth)
//        resJson.put(SCREEN_HEIGHT, screenHeight)
//        returnJson.put(RESPONSE, resJson)
//        webSocket.send(returnJson.toString())
//    }
//
//    private fun startStreaming(webSocket: WebSocket) {
//        GlobalScope.launch(Dispatchers.IO) {
//            // Store the hash of the last sent screenshot
//            var lastScreenshotHash: Int? = null
//            var lastHierarchyNode: List<AccNode>? = null
//            while (shouldPingScreenshotData) {
//                try {
//                    val screenWidth = getScreenWidth()
//                    val screenHeight = getScreenHeight()
//                    if (screenWidth <= 0 || screenHeight <= 0) {
//                        debugLog("startStreaming: screenWidth or screenHeight is 0, skipping")
//                        delay(1000)
//                        continue
//                    }
//                    val screenShotByteArray = DeviceActions.getScreenshotInByteArray()
//                    if (screenShotByteArray == null) {
//                        debugLog("startStreaming: screenshot not available, skipping")
//                        delay(1000)
//                        continue
//                    }
//
//                    @OptIn(ExperimentalEncodingApi::class)
//                    val screenshot = Base64.encode(screenShotByteArray)
//
//                    // Compute hash of the current screenshot
//                    val currentScreenshotHash = screenshot.hashCode()
//
//                    val currentHierarchyNode =
//                        AccessibilityStreamer.getHierarchy(screenWidth, screenHeight)
//                    if (currentScreenshotHash == lastScreenshotHash && currentHierarchyNode == lastHierarchyNode) {
////                        debugLog("startStreaming: screenshot unchanged, skipping")
//                        delay(FPS_24)
//                        continue
//                    }
////                    debugLog("startStreaming: screenshot changed, sending new one")
//                    val accHierarchy =
//                        AccessibilityStreamer.getHierarchyForStreaming(screenWidth, screenHeight)
//                    val screenshotData =
//                        ScreenshotData(
//                            START_STREAMING,
//                            Data(accHierarchy, screenWidth, screenHeight)
//                        ).toJson()
//                    webSocket.send(screenshotData.toString())
//                    webSocket.send(screenShotByteArray)
//                    lastScreenshotHash =
//                        currentScreenshotHash // Update the last sent screenshot hash
//                    lastHierarchyNode = currentHierarchyNode
//                } catch (e: Exception) {
//                    debugLog("startStreaming: Exception: $e")
//                }
//                delay(FPS_24)
//            }
//        }
//    }
//
//    private fun executeSwipe(json: JSONObject) {
//        val swipeData = json.getJSONObject("swipeData")
//        val x1 = swipeData.getInt("x1")
//        val y1 = swipeData.getInt("y1")
//        val x2 = swipeData.getInt("x2")
//        val y2 = swipeData.getInt("y2")
//        val duration = swipeData.getInt("duration")
//        uiDevice.executeShellCommand("input touchscreen swipe $x1 $y1 $x2 $y2 $duration")
//    }
//
//    private fun actionTestExecute(json: JSONObject, action: String, webSocket: WebSocket) =
//        runBlocking {
//            val cmd = json.getString(CMD)
//            val stepId = json.optString(STEP_ID)
//            val testExecutionId = json.optString(TEST_EXEC_ID)
//            val isDeviceAction = json.optBoolean(IS_DEVICE_ACTION, false)
//            debugLog(msg = "onMessage(): cmd : $cmd, stepId: $stepId, testExecutionId: $testExecutionId")
//            when (cmd) {
////                TAP -> {
////                    if (isDeviceAction) {
////                        val pair: Pair<Int, Int>? = getXYPercentOnScreen(json)
////                        if (pair != null) {
////                            val tapRes = performTapOnXY(pair.first, pair.second)
////                            val jsonRq = getExecuteResponse(
////                                action,
////                                json,
////                                tapRes
////                            )
////                            webSocket.send(jsonRq.toString())
////                        }
////                        return@runBlocking
////                    }
////                    val identifier = json.optJSONObject(NODE_IDENTIFIER)
////                    debugLog("identifier : $identifier")
////                    if (identifier != null) handleTapActionViaIdentifier(
////                        action,
////                        json,
////                        webSocket,
////                        identifier
////                    )
////                    else {
////                        val point = json.optJSONObject(SCREEN_CLICK_INFO)
////                        if (point != null) handleTapViaBounds(json, action, webSocket)
////                    }
////                }
//
//                ENTER_TEXT -> {
////                    if (isDeviceAction) {
////                        val pair: Pair<Int, Int>? = getXYPair(json)
////                        if (pair != null) {
////                            performTapOnXY(pair.first, pair.second)
////                        }
////                        val enterTextValue = json.optString(ENTER_TEXT_VALUE)
////                        val shouldClearText = json.optBoolean(SHOULD_CLEAR_TEXT, true)
////                        executeEnterText(enterTextValue, shouldClearText = shouldClearText)
////                        val jsonRq = getExecuteResponse(
////                            action,
////                            json,
////                            true
////                        )
////                        webSocket.send(jsonRq.toString())
////                        return@runBlocking
////                    }
////                    val identifier = json.optJSONObject(NODE_IDENTIFIER)
////                    val enterTextValue = json.getString(ENTER_TEXT_VALUE)
////                    debugLog("identifier : $identifier")
////                    if (identifier != null) handleEnterTextViaIdentifier(
////                        action,
////                        json,
////                        webSocket,
////                        identifier,
////                        enterTextValue
////                    ) else {
////                        val point = json.optJSONObject(SCREEN_CLICK_INFO)
////                        if (point != null) handleEnterTextViaBounds(
////                            action,
////                            json,
////                            webSocket,
////                            enterTextValue
////                        )
////                    }
//                }
//
////                CLEAR_TEXT -> {
////                    delay(1000)
////                    clearTextFromFocusNode()
////                    delay(1000)
////                    val jsonRq = getExecuteResponse(
////                        action,
////                        json,
////                        true
////                    )
////                    webSocket.send(jsonRq.toString())
////                }
//
//                CAPTURE_TEXT -> {
//                    val identifier = json.getJSONObject(NODE_IDENTIFIER)
//                    debugLog("identifier : $identifier")
//                    handleCaptureText(action, json, webSocket, identifier)
//                }
//
//                VALIDATE_TEXT -> {
//                    val identifier = json.getJSONObject(NODE_IDENTIFIER)
//                    val assertValue = json.getString(ASSERT_TEXT_VALUE)
//                    debugLog("identifier : $identifier")
//                    handleValidateText(
//                        action,
//                        json,
//                        webSocket,
//                        identifier,
//                        assertValue
//                    )
//                }
//
//                VALIDATE_ELEMENT -> {
//                    val identifier = json.getJSONObject(NODE_IDENTIFIER)
//                    debugLog("identifier : $identifier")
//                    handleValidateElement(
//                        action,
//                        json,
//                        webSocket,
//                        identifier
//                    )
//                }
//
//                HORIZONTAL_SCROLL, VERTICAL_SCROLL -> {
//                    handleScroll(action, json, webSocket)
//                }
//
//                SCROLL_DOWN -> {
//                    val identifier = json.getJSONObject(NODE_IDENTIFIER)
//                    debugLog("identifier : $identifier")
//                    handleScrollUntilVisible(
//                        cmd,
//                        action,
//                        json,
//                        webSocket,
//                        identifier,
//                        direction = DeviceActions.ScrollDirection.SCROLL_DOWN
//                    )
//                }
//
//                SCROLL_UP -> {
//                    val identifier = json.getJSONObject(NODE_IDENTIFIER)
//                    debugLog("identifier : $identifier")
//                    handleScrollUntilVisible(
//                        cmd,
//                        action,
//                        json,
//                        webSocket,
//                        identifier,
//                        direction = DeviceActions.ScrollDirection.SCROLL_UP
//                    )
//                }
//
//                SCROLL_LEFT -> {
//                    val identifier = json.getJSONObject(NODE_IDENTIFIER)
//                    debugLog("identifier : $identifier")
//                    handleScrollUntilVisible(
//                        cmd,
//                        action,
//                        json,
//                        webSocket,
//                        identifier,
//                        direction = DeviceActions.ScrollDirection.SCROLL_LEFT
//                    )
//                }
//
//                SCROLL_RIGHT -> {
//                    val identifier = json.getJSONObject(NODE_IDENTIFIER)
//                    debugLog("identifier : $identifier")
//                    handleScrollUntilVisible(
//                        cmd,
//                        action,
//                        json,
//                        webSocket,
//                        identifier,
//                        direction = DeviceActions.ScrollDirection.SCROLL_RIGHT
//                    )
//                }
//
//                ROTATE -> {
//                    val rotateRes = DeviceActions.rotate()
//                    val executeResponse = getExecuteResponse(action, json, rotateRes)
//                    webSocket.send(executeResponse.toString())
//                }
//
//                ROTATE_RIGHT -> {
//                    DeviceActions.rotateRight()
//                    val executeResponse = getExecuteResponse(action, json, true)
//                    webSocket.send(executeResponse.toString())
//                }
//
//                ROTATE_LEFT -> {
//                    DeviceActions.rotateLeft()
//                    val executeResponse = getExecuteResponse(action, json, true)
//                    webSocket.send(executeResponse.toString())
//                }
//
//                ROTATE_TO_PORTRAIT -> {
//                    DeviceActions.rotateToPortrait()
//                    val executeResponse = getExecuteResponse(action, json, true)
//                    webSocket.send(executeResponse.toString())
//                }
//
//                GO_TO_HOME_SCREEN -> {
//                    DeviceActions.goToHomeScreen()
//                    val executeResponse = getExecuteResponse(action, json, true)
//                    webSocket.send(executeResponse.toString())
//                }
//
//                BACK_BUTTON_CLICK -> {
//                    DeviceActions.pressBackButton()
//                    val executeResponse = getExecuteResponse(action, json, true)
//                    webSocket.send(executeResponse.toString())
//                }
//
////                SWITCH_TO_PRIMARY_APP -> {
////                    val packageName = json.getString(PACKAGE_NAME)
////                    try {
////                        val targetContext =
////                            InstrumentationRegistry.getInstrumentation().targetContext
////                        val intent: Intent? =
////                            DeviceActions.getAppIntentForPackage(
////                                targetContext,
////                                packageName,
////                                shouldClearTask = false
////                            )
////                        val launchAppRes = DeviceActions.launchAppViaIntent(targetContext, intent)
////                        val executeResponse = getExecuteResponse(
////                            action,
////                            json,
////                            launchAppRes.first,
////                            failedReason = launchAppRes.second
////                        )
////                        webSocket.send(executeResponse.toString())
////                    } catch (e: Exception) {
////                        debugLog(msg = "Exception: ${e.message}, in actionTestExecute(): action : $cmd")
////                        val executeResponse = getExecuteResponse(action, json, false)
////                        webSocket.send(executeResponse.toString())
////                    }
////                    return@runBlocking
////                }
//
//                LAUNCH_APP -> {
//                    val packageName = json.getString(PACKAGE_NAME)
//                    try {
//                        val argumentMap = json.optJSONObject(ARGUMENTS)?.toMap()
//                        val appLaunchRes = DeviceActions.launchApp(packageName, argumentMap)
//                        val executeResponse = getExecuteResponse(
//                            action = LAUNCH_APP,
//                            request = json,
//                            success = appLaunchRes.first,
//                            failedReason = appLaunchRes.second
//                        )
//                        webSocket.send(executeResponse.toString())
//                    } catch (e: Exception) {
//                        debugLog(msg = "Exception: ${e.message}, in actionTestExecute(): cmd : $cmd")
//                        val executeResponse = getExecuteResponse(action, json, false)
//                        webSocket.send(executeResponse.toString())
//                    }
//                }
//
//                else -> {
//                    debugLog(msg = "TestActions: actionTestExecute(): cmd : $cmd NOT implemented on ANDROID side")
//                }
//            }
//        }
//
//    private fun handleTapViaBounds(json: JSONObject, action: String, webSocket: WebSocket) =
//        runBlocking {
//            DeviceActions.waitForIdle()
//            delay(1000)
//            val screenshot = DeviceActions.getScreenshotInBase64()
//            val screenWidth = getScreenWidth()
//            val screenHeight = getScreenHeight()
//            val point = json.getJSONObject(SCREEN_CLICK_INFO)
//            val x: Int = point.optInt("x", 0)
//            val y: Int = point.optInt("y", 0)
//            val tapRes = performTapOnXY(x, y)
//
//            debugLog(msg = "ScreenTap(): point : $point")
//            val bounds: Rect? = getRectBounds(point)
//            val resJson = getExecuteResponse(
//                action,
//                json,
//                tapRes,
//                screenshot,
//                screenWidth,
//                screenHeight,
//                bounds
//            )
//            debugLog(msg = "ScreenTap(): returning response : ${resJson}")
//        webSocket.send(resJson.toString())
//    }
//
//    private fun performTapOnXY(x: Int, y: Int): Boolean {
//        val tapRes = DeviceActions.tap(x, y)
//        return tapRes
//    }
//
//    private fun handleCaptureText(
//        action: String,
//        request: JSONObject,
//        webSocket: WebSocket,
//        identifier: JSONObject
//    ) = runBlocking {
//        val nodeIdentifier = NodeIdentifier.fromJson(identifier)
//        val timeout = request.getInt("timeout")
//        val variableName = request.getString(VARIABLE_NAME)
//
//        val matchResult: NodeMatchResult? =
//            getMatchingIdentifier(nodeIdentifier, timeout, 1000L)
//        val screenshot = DeviceActions.getScreenshotInBase64()
//        val screenWidth = getScreenWidth()
//        val screenHeight = getScreenHeight()
//        if (matchResult?.matchingNode == null) {
//            val json = getExecuteResponse(
//                action,
//                request,
//                screenshot = screenshot,
//                screenWidth = screenWidth,
//                screenHeight = screenHeight,
//                success = false,
//                failedReason = getFailedJsonStr(matchResult)
//            )
//            webSocket.send(json.toString())
//        } else {
//            val json = getExecuteResponse(
//                action,
//                request,
//                screenshot = screenshot,
//                screenWidth = screenWidth,
//                screenHeight = screenHeight,
//                bounds = matchResult.matchingNode.bounds,
//                capturedText = matchResult.matchingNode.text,
//                success = true,
//                variableName = variableName
//            )
//            webSocket.send(json.toString())
//        }
//    }
//
//    private fun getFailedJsonStr(
//        nodeMatchResult: NodeMatchResult?, message: String? = "Couldn't match the node"
//    ): String {
//        val jsonObject = JSONObject()
//        jsonObject.put("message", message)
//        if (nodeMatchResult == null) {
//            return jsonObject.toString()
//        }
//        if (nodeMatchResult.matchedProps.isNotEmpty()) {
//            val matchedArray = JSONArray(nodeMatchResult.matchedProps)
//            jsonObject.put("matched", matchedArray)
//        }
//
//        if (nodeMatchResult.unmatchedProps.isNotEmpty()) {
//            val matchedArray = JSONArray(nodeMatchResult.unmatchedProps)
//            jsonObject.put("unmatched", matchedArray)
//        }
//
//        return jsonObject.toString()
//    }
//
//    private fun returnResponseForDeviceList(
//        action: String?, deviceListJson: JSONArray?, webSocket: WebSocket, requestId: String? = null,
//    ) {
//        val json = JSONObject()
//        json.put(ACTION, action)
//        json.put(REQUEST_ID, requestId)
//        val successJson = JSONObject()
//        successJson.put(CODE, 200)
//        successJson.put(SUCCESS, true)
//        json.put(RESPONSE, deviceListJson)
//        webSocket.send(json.toString())
//    }
//
//    private fun handleEnterTextViaIdentifier(
//        action: String,
//        request: JSONObject,
//        webSocket: WebSocket,
//        identifier: JSONObject,
//        enterTextValue: String,
//    ) = runBlocking {
//        val nodeIdentifier = NodeIdentifier.fromJson(identifier)
//        val timeout = request.getInt("timeout")
//        val matchResult: NodeMatchResult? =
//            getMatchingIdentifier(nodeIdentifier, timeout, 1000L)
//        val bounds = matchResult?.matchingNode?.bounds
//        val screenshot = DeviceActions.getScreenshotInBase64()
//        val screenWidth = getScreenWidth()
//        val screenHeight = getScreenHeight()
//        if (bounds == null) {
//            val json = getExecuteResponse(
//                action,
//                request,
//                false,
//                screenshot,
//                screenWidth,
//                screenHeight,
//                null,
//                failedReason = getFailedJsonStr(matchResult)
//            )
//            webSocket.send(json.toString())
//            return@runBlocking
//        } else {
//            if (!matchResult.matchingNode.isFocused) {
//                DeviceActions.tap(bounds.centerX(), bounds.centerY())
//                delay(100)
//            }
//        }
//        if (enterTextValue.isNotEmpty()) {
//            val textLength: Int = matchResult.matchingNode.text?.length ?: 0
//            for (i in 0..<textLength)
//                uiDevice.executeShellCommand("input keyevent 67")
//        }
//        DeviceActions.enterText(enterTextValue)
//        val json = getExecuteResponse(
//            action,
//            request,
//            true,
//            screenshot,
//            screenWidth,
//            screenHeight,
//            bounds
//        )
//        webSocket.send(json.toString())
//    }
//
////    private fun handleEnterTextViaBounds(
////        action: String,
////        request: JSONObject,
////        webSocket: WebSocket,
////        enterTextValue: String,
////    ) = runBlocking {
////        DeviceActions.waitForIdle()
////        delay(1000)
////        val screenshot = DeviceActions.getScreenshotInBase64()
////        val screenWidth = getScreenWidth()
////        val screenHeight = getScreenHeight()
////        val point = request.getJSONObject(SCREEN_CLICK_INFO)
////        val x = point.optInt("x", 0)
////        val y = point.optInt("y", 0)
////        if (x != 0 && y != 0) DeviceActions.tap(x, y)
////        val shouldClearText = request.optBoolean(SHOULD_CLEAR_TEXT, true)
////        executeEnterText(enterTextValue, shouldClearText = shouldClearText)
////        val bounds: Rect? = getRectBounds(point)
////        val json = getExecuteResponse(
////            action,
////            request,
////            true,
////            screenshot,
////            screenWidth,
////            screenHeight,
////            bounds
////        )
////        webSocket.send(json.toString())
////    }
//
////    private suspend fun executeEnterText(enterTextValue: String, shouldClearText: Boolean) {
////        delay(2000)
////        if (shouldClearText) {
////            clearTextFromFocusNode()
////            delay(1000)
////        }
////        DeviceActions.enterText(enterTextValue)
////    }
//
//    private fun getRectBounds(point: JSONObject): Rect? {
//        val boundsJsonArray = point.optJSONArray("bounds")
//        var bounds: Rect? = null
//        if (boundsJsonArray != null) {
//            bounds = Rect(
//                boundsJsonArray.optInt(0),
//                boundsJsonArray.optInt(1),
//                boundsJsonArray.optInt(2),
//                boundsJsonArray.optInt(3)
//            )
//        }
//        return bounds
//    }
//
//    private fun handleValidateElement(
//        action: String?,
//        request: JSONObject,
//        webSocket: WebSocket,
//        identifier: JSONObject
//    ) = runBlocking {
//        val nodeIdentifier = NodeIdentifier.fromJson(identifier)
//        val timeout = request.getInt("timeout")
//
//        val matchResult: NodeMatchResult? =
//            getMatchingIdentifier(nodeIdentifier, timeout, 1000L)
//        val bounds: Rect? = matchResult?.matchingNode?.bounds
//        val screenshot = DeviceActions.getScreenshotInBase64()
//        val screenWidth = getScreenWidth()
//        val screenHeight = getScreenHeight()
//
//        val isVisible = bounds != null
//        debugLog(msg = "Assert(): isVisible : $isVisible")
//        if (isVisible) {
//            val json = getExecuteResponse(
//                action,
//                request,
//                success = true,
//                screenshot,
//                screenWidth,
//                screenHeight,
//                bounds
//            )
//            webSocket.send(json.toString())
//        } else {
//            val json = getExecuteResponse(
//                action,
//                request,
//                success = false,
//                screenshot,
//                screenWidth,
//                screenHeight,
//                null,
//                failedReason = getFailedJsonStr(matchResult)
//            )
//            webSocket.send(json.toString())
//        }
//
//    }
//
//    private fun handleValidateText(
//        action: String?,
//        request: JSONObject,
//        webSocket: WebSocket,
//        identifier: JSONObject,
//        assertTextValue: String
//    ) = runBlocking {
//        val nodeIdentifier = NodeIdentifier.fromJson(identifier)
//        val timeout = request.getInt("timeout")
//
//        val matchResult: NodeMatchResult? =
//            getMatchingIdentifier(nodeIdentifier, timeout, 1000L)
//        val screenshot = DeviceActions.getScreenshotInBase64()
//        val screenWidth = getScreenWidth()
//        val screenHeight = getScreenHeight()
//        if (matchResult?.matchingNode == null) {
//            val json = getExecuteResponse(
//                action,
//                request,
//                false,
//                screenshot,
//                screenWidth,
//                screenHeight,
//                bounds = null
//            )
//            webSocket.send(json.toString())
//        } else {
//            val textFromNode = matchResult.matchingNode.text
//            val isEqual = textFromNode == assertTextValue
//            var failedReason = ""
//            if (!isEqual) failedReason =
//                "Found matching node but text is not matching. Found \"$textFromNode\" instead of $assertTextValue"
//            val json = getExecuteResponse(
//                action,
//                request,
//                isEqual,
//                screenshot,
//                screenWidth,
//                screenHeight,
//                bounds = matchResult.matchingNode.bounds,
//                failedReason = failedReason
//            )
//            webSocket.send(json.toString())
//        }
//    }
//
//    private fun handleAssertAction(
//        action: String?,
//        request: JSONObject,
//        webSocket: WebSocket,
//        identifier: JSONObject,
//        assertValue: String,
//        assertTextValue: String
//    ) = runBlocking {
//        delay(1000)
//        val nodeIdentifier = NodeIdentifier.fromJson(identifier)
//        val timeout = request.getInt("timeout")
//
//        val nodeMatchResult: NodeMatchResult? =
//            getMatchingIdentifier(nodeIdentifier, timeout, 1000L)
//        val screenshot = DeviceActions.getScreenshotInBase64()
//        val screenWidth = getScreenWidth()
//        val screenHeight = getScreenHeight()
//
//        when (assertValue) {
//            ASSERT_CONTAINS -> {
//                if (nodeMatchResult?.matchingNode == null) {
//                    val json = getExecuteResponse(
//                        action,
//                        request,
//                        false,
//                        screenshot,
//                        screenWidth,
//                        screenHeight
//                    )
//                    webSocket.send(json.toString())
//                } else {
//                    val textFromNode = nodeMatchResult.matchingNode.text
//                    val doesContain = textFromNode?.contains(assertTextValue) ?: false
//
//                    var failedReason = ""
//                    if (!doesContain) failedReason =
//                        "Found matching node but \"$textFromNode\" doesn't contain $assertTextValue."
//
//                    val json = getExecuteResponse(
//                        action,
//                        request,
//                        doesContain,
//                        screenshot,
//                        screenWidth,
//                        screenHeight,
//                        failedReason = failedReason
//                    )
//                    webSocket.send(json.toString())
//                }
//            }
//
//            ASSERT_STARTS_WITH -> {
//                if (nodeMatchResult?.matchingNode == null) {
//                    val json = getExecuteResponse(
//                        action,
//                        request,
//                        false,
//                        screenshot,
//                        screenWidth,
//                        screenHeight
//                    )
//                    webSocket.send(json.toString())
//                } else {
//                    val textFromNode = nodeMatchResult.matchingNode.text
//                    val startsWith = textFromNode?.startsWith(assertTextValue) ?: false
//
//                    var failedReason = ""
//                    if (!startsWith) failedReason =
//                        "Found matching node but \"$textFromNode\" doesn't starts with $assertTextValue."
//
//                    val json = getExecuteResponse(
//                        action,
//                        request,
//                        startsWith,
//                        screenshot,
//                        screenWidth,
//                        screenHeight,
//                        failedReason = failedReason
//                    )
//                    webSocket.send(json.toString())
//                }
//            }
//
//            ASSERT_ENDS_WITH -> {
//                if (nodeMatchResult?.matchingNode == null) {
//                    val json = getExecuteResponse(
//                        action,
//                        request,
//                        false,
//                        screenshot,
//                        screenWidth,
//                        screenHeight,
//                    )
//                    webSocket.send(json.toString())
//                } else {
//                    val textFromNode = nodeMatchResult.matchingNode.text
//                    val endsWith = textFromNode?.endsWith(assertTextValue) ?: false
//
//                    var failedReason = ""
//                    if (!endsWith) failedReason =
//                        "Found matching node but \"$textFromNode\" doesn't end with $assertTextValue."
//
//                    val json = getExecuteResponse(
//                        action,
//                        request,
//                        endsWith,
//                        screenshot,
//                        screenWidth,
//                        screenHeight,
//                        failedReason = failedReason
//                    )
//                    webSocket.send(json.toString())
//                }
//            }
//
//            ASSERT_IS_CHECKED -> {
//                if (nodeMatchResult?.matchingNode == null) {
//                    val json = getExecuteResponse(
//                        action,
//                        request,
//                        false,
//                        screenshot,
//                        screenWidth,
//                        screenHeight
//                    )
//                    webSocket.send(json.toString())
//                } else {
//
//                    var failedReason = ""
//                    if (!nodeMatchResult.matchingNode.isChecked) failedReason =
//                        "Found matching node but target node is not Checked"
//
//                    val json = getExecuteResponse(
//                        action,
//                        request,
//                        nodeMatchResult.matchingNode.isChecked,
//                        screenshot,
//                        screenWidth,
//                        screenHeight,
//                        failedReason = failedReason
//                    )
//                    webSocket.send(json.toString())
//                }
//            }
//
//            ASSERT_IS_NOT_CHECKED -> {
//                if (nodeMatchResult?.matchingNode == null) {
//                    val json = getExecuteResponse(
//                        action,
//                        request,
//                        false,
//                        screenshot,
//                        screenWidth,
//                        screenHeight
//                    )
//                    webSocket.send(json.toString())
//                } else {
//                    var failedReason = ""
//                    if (nodeMatchResult.matchingNode.isChecked) failedReason =
//                        "Found matching node but target node is Checked"
//
//                    val json = getExecuteResponse(
//                        action,
//                        request,
//                        !nodeMatchResult.matchingNode.isChecked,
//                        screenshot,
//                        screenWidth,
//                        screenHeight,
//                        failedReason = failedReason
//                    )
//                    webSocket.send(json.toString())
//                }
//            }
//
//            else -> {
//                val isVisible = nodeMatchResult?.matchingNode != null
//                debugLog(msg = "Assert(): isVisible : $isVisible")
//                val json = getExecuteResponse(
//                    action,
//                    request,
//                    isVisible,
//                    screenshot,
//                    screenWidth,
//                    screenHeight
//                )
//                webSocket.send(json.toString())
//            }
//        }
//
//    }
//
//    private fun handleTapActionViaIdentifier(
//        action: String?,
//        request: JSONObject,
//        webSocket: WebSocket,
//        identifier: JSONObject
//    ) = runBlocking {
//        delay(1000)
//        val nodeIdentifier = NodeIdentifier.fromJson(identifier)
//        val timeout = request.optInt("timeout", 5)
//        val nodeMatchResult: NodeMatchResult? =
//            getMatchingIdentifier(nodeIdentifier, timeout, 1000L)
//        val screenshot = DeviceActions.getScreenshotInBase64()
//        val screenWidth = getScreenWidth()
//        val screenHeight = getScreenHeight()
//        if (nodeMatchResult?.matchingNode == null) {
//            val json = getExecuteResponse(
//                action,
//                request,
//                false,
//                screenshot,
//                screenWidth, screenHeight,
//                failedReason = getFailedJsonStr(nodeMatchResult)
//            )
//            webSocket.send(json.toString())
//            return@runBlocking
//        }
//        val bounds = nodeMatchResult.matchingNode.bounds
//        if (bounds == null) {
//            val json = getExecuteResponse(
//                action,
//                request,
//                false,
//                screenshot,
//                screenWidth, screenHeight,
//                failedReason = "Unable to perform tap action. The element may not be fully loaded or ready for interaction. Please verify its availability and visibility."
//            )
//            webSocket.send(json.toString())
//            return@runBlocking
//        }
//        var x: Int = bounds.centerX()
//        var y: Int = bounds.centerY()
//        if (request.has("clickInfo")) {
//            val clickJsonObject = request.optJSONObject("clickInfo")
//            if (clickJsonObject != null) {
//                val xP = clickJsonObject.optDouble("xP", 0.0)
//                if (xP != 0.0) {
//                    x = (bounds.left + (bounds.width() * xP)).toInt()
//                }
//                val yP = clickJsonObject.optDouble("yP", 0.0)
//                if (yP != 0.0) {
//                    y = (bounds.top + (bounds.height() * yP)).toInt()
//                }
//            }
//        }
//        val tapRes = DeviceActions.tap(x, y)
//        debugLog(msg = "Tap(): bounds : $bounds")
//        val json = getExecuteResponse(
//            action,
//            request,
//            tapRes,
//            screenshot,
//            screenWidth,
//            screenHeight,
//            bounds
//        )
//        webSocket.send(json.toString())
//    }
//
//    private fun handleScroll(
//        action: String?,
//        request: JSONObject,
//        webSocket: WebSocket,
//    ) = runBlocking {
//        DeviceActions.waitForIdle()
//        delay(1000)
//        val mobileScrollInfo = request.optJSONObject("mobileScrollInfo")
//        if (mobileScrollInfo != null) {
//            val startX = mobileScrollInfo.optInt("startX", 0)
//            val endX = mobileScrollInfo.optInt("endX", 0)
//            val startY = mobileScrollInfo.optInt("startY", 0)
//            val endY = mobileScrollInfo.optInt("endY", 0)
//            val durationInMs = mobileScrollInfo.optInt("durationInMs", 500)
////        val timeOutPerStepInSec = request.getInt("timeOutPerStepInSec")
//
//            val responseForScroll = DeviceActions.adbScroll(
//                startX = startX,
//                startY = startY,
//                endX = endX,
//                endY = endY,
//                durationMs = durationInMs
//            )
//            delay(500)
//
//            val screenshot = DeviceActions.getScreenshotInBase64()
//            val screenWidth = getScreenWidth()
//            val screenHeight = getScreenHeight()
//
//            val json = getExecuteResponse(
//                action,
//                request,
//                true,
//                screenshot,
//                screenWidth,
//                screenHeight,
//                null
//            )
//            webSocket.send(json.toString())
//            return@runBlocking
//        }
//    }
//
//    private fun handleScrollUntilVisible(
//        cmd: String,
//        action: String?,
//        request: JSONObject,
//        webSocket: WebSocket,
//        identifier: JSONObject,
//        direction: DeviceActions.ScrollDirection = DeviceActions.ScrollDirection.SCROLL_DOWN,
//    ) = runBlocking {
//        val nodeIdentifier = NodeIdentifier.fromJson(identifier)
//        val fromScroll = request.getInt("fromScroll")
//        val toScroll = request.getInt("toScroll")
//        val timeOutPerStepInSec = request.getInt("timeOutPerStepInSec")
//
//        val maxScrollAttempts = timeOutPerStepInSec * 1000 / 300
//
//        val verifiedVal: Point = DeviceActions.verifyValues(direction, fromScroll, toScroll)
//        val fromScrollPercent = verifiedVal.x / 100.0
//        val toScrollPercent = verifiedVal.y / 100.0
//
//        var attempts = 0
//        while (attempts < maxScrollAttempts && shouldExecuteTest) {
//            val bounds = getBoundsForIdentifier(nodeIdentifier)
//            if (bounds == null) {
//                attempts++
//                DeviceActions.scroll(direction, fromScrollPercent, toScrollPercent)
//                debugLog("scrollUntilVisible: scrolling, as bounds is null, attempt: $attempts")
//                delay(500)
//                continue
//            } else {
//                // Check if bounds is in visible area of the phone screen
//                var isNotInVisibleArea = true
//                var log = ""
//                when (cmd) {
//                    SCROLL_DOWN -> {
//                        isNotInVisibleArea = bounds.bottom > getScreenHeight()
//                        if (isNotInVisibleArea)
//                            log =
//                                "bounds.bottom[${bounds.bottom}] > ScreenHeight[${getScreenHeight()}]"
//                    }
//
//                    SCROLL_UP -> {
//                        isNotInVisibleArea = bounds.top < 0
//                        if (isNotInVisibleArea)
//                            log =
//                                "bounds.top[${bounds.top}] < 0"
//                    }
//
//                    SCROLL_LEFT -> {
//                        isNotInVisibleArea = bounds.right > getScreenWidth()
//                        if (isNotInVisibleArea)
//                            log =
//                                "bounds.right[${bounds.right}] > ScreenWidth[${getScreenWidth()}]"
//                    }
//
//                    SCROLL_RIGHT -> {
//                        isNotInVisibleArea = bounds.left < 0
//                        if (isNotInVisibleArea)
//                            log =
//                                "bounds.left[${bounds.left}] < 0"
//                    }
//                }
//                if (isNotInVisibleArea) {
//                    debugLog(log)
//                    DeviceActions.scroll(direction, fromScrollPercent, toScrollPercent)
//                    delay(500)
//                    continue
//                }
//                debugLog("scrollUntilVisible: screen height: ${getScreenHeight()}, screen width: ${getScreenWidth()}")
//                debugLog("scrollUntilVisible: found bounds: $bounds")
////                DeviceActions.moveElementToCenter(bounds)
//                delay(500)
//                val screenshot = DeviceActions.getScreenshotInBase64()
//
//                val screenWidth = getScreenWidth()
//                val screenHeight = getScreenHeight()
//
//                val json = getExecuteResponse(
//                    action,
//                    request,
//                    true,
//                    screenshot,
//                    screenWidth,
//                    screenHeight,
//                    bounds
//                )
//                webSocket.send(json.toString())
//                return@runBlocking
//            }
//        }
//        val screenshot = DeviceActions.getScreenshotInBase64()
//
//        val screenWidth = getScreenWidth()
//        val screenHeight = getScreenHeight()
//        debugLog("scrollUntilVisible: couldn't find the view after scrolling $maxScrollAttempts times")
//        val json = getExecuteResponse(
//            action,
//            request,
//            false,
//            screenshot,
//            screenWidth,
//            screenHeight,
//            bounds = null
//        )
//        webSocket.send(json.toString())
//    }
//
//    private fun getBoundsForIdentifier(nodeIdentifier: NodeIdentifier?): Rect? {
//        val screenWidth = getScreenWidth()
//        val screenHeight = getScreenHeight()
//        val hierarchyNode = AccessibilityStreamer.getHierarchyNode(screenWidth, screenHeight)
//        return hierarchyNode.getBounds(nodeIdentifier)
//    }
//
//    private suspend fun getMatchingIdentifier(
//        nodeIdentifier: NodeIdentifier?,
//        timeout: Int, delayInMillis: Long
//    ): NodeMatchResult? {
//        delay(delayInMillis)
//        val startTime = System.currentTimeMillis()
//        val endTime = startTime + timeout * 1000L
//        var nodeMatchResult: NodeMatchResult? = null
//        while (canRunTest(endTime)) {
//            debugLog("Tick tick")
//            val screenWidth = getScreenWidth()
//            val screenHeight = getScreenHeight()
//            val hierarchyNode = AccessibilityStreamer.getHierarchyNode(screenWidth, screenHeight)
//            nodeMatchResult = hierarchyNode.getMatchingNodeWithResult(nodeIdentifier)
//            if (nodeMatchResult?.matchingNode == null) {
//                delay(500)
//                debugLog("Tick tick: Skipping as accNode is null")
//                continue
//            } else {
//                debugLog("Tick tick: found accNode: $nodeMatchResult")
//                return nodeMatchResult
//            }
//        }
//        return nodeMatchResult
//    }
//
//    private fun canRunTest(endTime: Long): Boolean {
//        return shouldExecuteTest && (System.currentTimeMillis() < endTime)
//    }
//
//    private fun getExecuteResponse(
//        action: String?,
//        request: JSONObject,
//        success: Boolean,
//        screenshot: String? = null,
//        screenWidth: Int? = null,
//        screenHeight: Int? = null,
//        bounds: Rect? = null,
//        failedReason: String? = null,
//        capturedText: String? = null,
//        variableName: String? = null,
//    ): JSONObject {
//        val json = JSONObject()
//        json.put(ACTION, action)
//        json.put(REQUEST_ID, request.optString(REQUEST_ID))
//        val response = JSONObject()
//        response.putOpt(TEST_ID, request.optString(TEST_ID))
//        response.putOpt(STEP_ID, request.optString(STEP_ID))
//        response.putOpt(TEST_EXEC_ID, request.optString(TEST_EXEC_ID))
//        response.putOpt(SUCCESS, success)
//        response.putOpt(SCREENSHOT, screenshot)
//        response.putOpt(SCREEN_WIDTH, screenWidth)
//        response.putOpt(SCREEN_HEIGHT, screenHeight)
//        response.putOpt(SCREEN_HEIGHT, screenHeight)
//        response.putOpt(CAPTURED_TEXT, capturedText)
//        response.putOpt(VARIABLE_NAME, variableName)
//        response.putOpt(REQUEST_ID, request.optString(REQUEST_ID))
//
//        val clickedNodes = JSONObject()
//
//        if (bounds != null) {
//            clickedNodes.put("left", bounds.left.toDouble())
//            clickedNodes.put("top", bounds.top.toDouble())
//            clickedNodes.put("right", bounds.right.toDouble())
//            clickedNodes.put("bottom", bounds.bottom.toDouble())
//
//            response.put(NODE_BOUNDS, clickedNodes)
//        }
//        response.put(FAILED_REASON, failedReason)
//        json.put(RESPONSE, response)
//        return json
//    }
//
//    private fun enableStreaming() {
//        shouldPingScreenshotData = true
//    }
//
//    private fun disableStreaming() {
//        shouldPingScreenshotData = false
//    }
//
//    private fun enableTestExecute() {
//        shouldExecuteTest = true
//    }
//
//    private fun disableTestExecute() {
//        shouldExecuteTest = false
//    }
//
//    fun disable() {
//        disableStreaming()
//        disableTestExecute()
//    }
//
//    fun onConnectionOpen() {
//        accessibilityListener = FrAccessibilityListener.start(uiAutomation = uiAutomation)
//    }
//}