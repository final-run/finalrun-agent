// Port of constants/lib/constants.dart — ONLY the CLI-relevant subset.
// The Dart file has 358 lines; we carry over ~30% used by CLI + goal-executor + device-node.

// ============================================================================
// Platform identifiers
// ============================================================================
export const PLATFORM_ANDROID = 'android';
export const PLATFORM_IOS = 'ios';

// ============================================================================
// Action types — used by HeadlessActionExecutor to route actions
// Dart: class ActionType { static const String ... }
// ============================================================================
export const ACTION_TYPE_TAP = 'tap';
export const ACTION_TYPE_LONG_PRESS = 'longPress';
export const ACTION_TYPE_SCROLL = 'scroll';
export const ACTION_TYPE_SCROLL_ABS = 'scrollAbs';
export const ACTION_TYPE_INPUT_TEXT = 'enterText';
export const ACTION_TYPE_BACK = 'back';
export const ACTION_TYPE_HOME = 'home';
export const ACTION_TYPE_ROTATE = 'rotate';
export const ACTION_TYPE_HIDE_KEYBOARD = 'hideKeyboard';
export const ACTION_TYPE_PRESS_KEY = 'pressKey';
export const ACTION_TYPE_LAUNCH_APP = 'launchApp';
export const ACTION_TYPE_KILL_APP = 'killApp';
export const ACTION_TYPE_SET_LOCATION = 'setLocation';
export const ACTION_TYPE_WAIT = 'wait';
export const ACTION_TYPE_DEEPLINK = 'deeplink';
export const ACTION_TYPE_SWITCH_TO_PRIMARY_APP = 'switchToPrimaryApp';
export const ACTION_TYPE_CHECK_APP_IN_FOREGROUND = 'checkAppInForeground';
export const ACTION_TYPE_GET_SCREENSHOT_AND_HIERARCHY = 'getScreenshotAndHierarchy';
export const ACTION_TYPE_GET_APP_LIST = 'getAppList';

// ============================================================================
// Status values — used by HeadlessGoalExecutor for step results
// ============================================================================
export const STATUS_SUCCESS = 'success';
export const STATUS_FAILURE = 'failure';
export const STATUS_ERROR = 'error';
export const STATUS_ABORTED = 'aborted';
export const STATUS_RUNNING = 'running';
export const STATUS_COMPLETED = 'completed';

// ============================================================================
// AI feature names — used by FinalRunAgent to select prompts/models
// ============================================================================
export const FEATURE_PLANNER = 'benchmark-planner';
export const FEATURE_GROUNDER = 'benchmark-grounder';
export const FEATURE_SCROLL_INDEX_GROUNDER = 'benchmark-scroll-index-grounder';
export const FEATURE_INPUT_FOCUS_GROUNDER = 'benchmark-input-focus-grounder';
export const FEATURE_LAUNCH_APP_GROUNDER = 'benchmark-launch-app-grounder';
export const FEATURE_SET_LOCATION_GROUNDER = 'benchmark-set-location-grounder';

// ============================================================================
// Defaults
// ============================================================================
export const DEFAULT_MAX_ITERATIONS = 110;
export const DEFAULT_GRPC_PORT_START = 50051;
export const DEFAULT_ACTION_TIMEOUT = 30;
export const DEFAULT_STABILITY_CHECK_DELAY_MS = 500;
export const DEFAULT_SWIPE_DURATION_MS = 500;

// ============================================================================
// Planner output action keys — used by HeadlessGoalExecutor to parse planner response
// These must match the strings the planner LLM outputs.
// ============================================================================
export const PLANNER_ACTION_TAP = 'tap';
export const PLANNER_ACTION_LONG_PRESS = 'longPress';
export const PLANNER_ACTION_TYPE = 'type';
export const PLANNER_ACTION_SCROLL = 'scroll';
export const PLANNER_ACTION_BACK = 'back';
export const PLANNER_ACTION_HOME = 'home';
export const PLANNER_ACTION_ROTATE = 'rotate';
export const PLANNER_ACTION_HIDE_KEYBOARD = 'hideKeyboard';
export const PLANNER_ACTION_PRESS_ENTER = 'pressEnter';
export const PLANNER_ACTION_LAUNCH_APP = 'launchApp';
export const PLANNER_ACTION_SET_LOCATION = 'setLocation';
export const PLANNER_ACTION_WAIT = 'wait';
export const PLANNER_ACTION_COMPLETED = 'completed';
export const PLANNER_ACTION_FAILED = 'failed';
export const PLANNER_ACTION_DEEPLINK = 'deeplink';

// ============================================================================
// Environment variable keys
// ============================================================================
export const ENV_BASE_URL = 'BASE_URL';
export const ENV_DEBUG = 'DEBUG';
