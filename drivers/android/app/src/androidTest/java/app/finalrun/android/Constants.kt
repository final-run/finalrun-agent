package app.finalrun.android

/**
 * Frame Duration (in milliseconds)
 * Formula: (1 / Frame Rate) × 1000
 * (1 / 24) * 1000 = 41.6666
 */
const val FPS_24 = 42L

const val ACTION = "action"

const val SCROLL_DOWN = "Scroll Down"
const val SCROLL_UP = "Scroll Up"
const val SCROLL_LEFT = "Scroll Left"
const val SCROLL_RIGHT = "Scroll Right"
const val HORIZONTAL_SCROLL = "H Scroll"
const val VERTICAL_SCROLL = "V Scroll"

const val TAP = "tap"
const val TAP_PERCENT = "tapPercent"
const val ENTER_TEXT = "enterText"
const val LAUNCH_APP = "launchApp"
const val CLEAR_TEXT = "clearText"
const val SWITCH_TO_PRIMARY_APP = "switchToPrimaryApp"
const val ROTATE = "rotate"
const val ROTATE_TO_PORTRAIT = "rotateToPortrait"
const val ROTATE_LEFT = "rotateLeft"
const val ROTATE_RIGHT = "rotateRight"
const val GO_TO_HOME_SCREEN = "goToHomeScreen"
const val BACK_BUTTON_CLICK = "clickBackButton"
const val SET_LOCATION = "setLocation"
const val SWIPE = "swipe"

const val START_STREAMING = "startStreaming"
const val STOP_STREAMING = "stopStreaming"
const val STOP_EXECUTION = "stopExecution"
const val GET_HIERARCHY_FOR_EVERY_FRAME = "getHierarchyForEveryFrame"

//Below is used for two things i.e. Fetch app list and perform app launch
const val SELECT_APP = "selectApp"
const val ACTION_EXECUTE = "executeTestStep"

const val NODE_IDENTIFIER = "nodeIdentifier"
const val ASSERT_TEXT_VALUE = "assertTextValue"
const val VALIDATE_ELEMENT = "Validate Element"
const val VALIDATE_TEXT = "Validate Text"
const val CAPTURE_TEXT = "Capture Text"
const val ASSERT_CONTAINS = "contains"
const val ASSERT_STARTS_WITH = "startsWith"
const val ASSERT_ENDS_WITH = "endsWith"
const val ASSERT_IS_CHECKED = "isChecked"
const val ASSERT_IS_NOT_CHECKED = "isNotChecked"
const val SCREEN_CLICK_INFO = "screenClickInfo"

const val CMD = "cmd"
const val STEP_ID = "stepId"
const val TEST_ID = "testId"
const val SCREENSHOT = "screenshot"
const val SCREEN_WIDTH = "screenWidth"
const val SCREEN_HEIGHT = "screenHeight"
const val CAPTURED_TEXT = "capturedText"
const val VARIABLE_NAME = "variableName"
const val NODE_BOUNDS = "node_bounds"
const val FAILED_REASON = "failedReason"
const val TEST_EXEC_ID = "testExecutionId"

const val CODE = "code"
const val SUCCESS = "success"
const val RESPONSE = "response"

const val NAME = "name"
const val PACKAGE_NAME = "packageName"
const val VERSION = "version"
const val ARGUMENTS = "arguments"
const val REQUEST_ID = "requestId"
const val IS_DEVICE_ACTION = "isDeviceAction"