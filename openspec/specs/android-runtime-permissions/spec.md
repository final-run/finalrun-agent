## ADDED Requirements

### Requirement: Android runtime permission grants are best-effort when the app does not declare the permission

When FinalRun grants Android runtime permissions via `adb shell pm grant` for a target application package (including the `allowAllPermissions` path), the system SHALL treat a refusal whose error indicates that the **package has not requested** that permission (undeclared in the application manifest) as a **non-fatal skip** for that permission. The overall permission step SHALL NOT fail solely because of such skips.

#### Scenario: Undeclared permission is skipped and launch continues

- **WHEN** `allowAllPermissions` is true and FinalRun attempts `pm grant` for a permission the target package has not declared
- **THEN** FinalRun SHALL NOT record that outcome as a hard error that blocks app launch
- **AND** FinalRun SHALL proceed with subsequent launch steps (e.g. starting the app via the driver) as it would if the grant had succeeded

#### Scenario: True grant failure still fails the permission step

- **WHEN** `pm grant` fails for a reason other than “package has not requested this permission” (e.g. device policy, adb failure, unexpected error)
- **THEN** FinalRun SHALL treat that outcome as a failure of the permission update for that permission
- **AND** the batch permission operation SHALL fail if any such failure occurs (existing strictness for real errors preserved)

### Requirement: Skipped undeclared permission grants are logged at info level or quieter

For outcomes classified as undeclared-permission skips, FinalRun SHALL NOT emit **error**-level logs for those skips. FinalRun SHALL log them at **info** or a quieter level (e.g. debug), and MAY aggregate multiple skips into a single summary line to reduce log noise.

#### Scenario: No error-level log for benign skip

- **WHEN** a `pm grant` attempt is classified as an undeclared-permission skip
- **THEN** FinalRun SHALL NOT log that skip at error level

### Requirement: allowAllPermissions remains opt-out by default

The default value of `allowAllPermissions` for launch-app behavior SHALL remain **true** unless the user or grounder explicitly sets it false (e.g. `LaunchAppAction`, headless executor grounding defaults, and shared test step models SHALL keep `true` as the default after this change).

#### Scenario: Default unchanged for headless launch

- **WHEN** a launch-app action is constructed without an explicit `allowAllPermissions` field from grounding output
- **THEN** FinalRun SHALL default `allowAllPermissions` to true
