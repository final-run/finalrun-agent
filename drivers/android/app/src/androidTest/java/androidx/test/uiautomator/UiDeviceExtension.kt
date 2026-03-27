package androidx.test.uiautomator

/**
 * Issue:
 * The `UiDevice.click(x, y)` method returns false and fails to work for most bottom buttons,
 * such as the bottom navigation tab button in many apps. This is due to a limitation
 * in the `UiDevice.click(x, y)` function, specifically the following code snippet:
 * `if (x >= getDisplayWidth() || y >= getDisplayHeight()) return (false);`
 *
 * Solution:
 * To address this issue, we've identified a method called `clickNoSync(x, y)` within the
 * `InteractionController` class. This method effectively attempts to click on the specified
 * coordinates (x, y). Unfortunately, the `InteractionController` class is package-private,
 * restricting direct access. To overcome this limitation and enable access through
 * extension functions, we've created `UiDeviceExtension.kt`, placing it in the same
 * package `androidx.test.uiautomator`
 */

fun UiDevice.clickNoSync(x: Int, y: Int): Boolean {
    return interactionController.clickNoSync(x, y)
}