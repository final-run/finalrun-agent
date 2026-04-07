# Troubleshooting

**`Error: No .finalrun/ workspace found`**
FinalRun looks for `.finalrun/` by walking up from your current directory. Make sure you're inside your app repo and `.finalrun/tests/` exists.

**`Error: API key not configured`**
Set the matching environment variable for your model provider. For `google/...`, set `GOOGLE_API_KEY` in your `.env` or shell. See [environment.md](environment.md#ai-provider-api-keys).

**`Error: No Android emulator running`**
Start an emulator with `emulator -avd <name>` or launch one from Android Studio. Run `finalrun doctor --platform android` to verify.

**`Error: scrcpy not found` / `adb not found`**
Install missing Android tools: `brew install scrcpy android-platform-tools` (macOS). Run `finalrun doctor` to check.

**`Unresolved ${secrets.*} placeholder`**
The referenced variable isn't set. Check that it's declared in `.finalrun/env/<name>.yaml` and the actual value is in `.env` or your shell environment.

**`Error: App path invalid`**
The `--app` flag requires a path to an existing `.apk` file or `.app` directory. Verify the path and ensure the file matches the target platform. See [configuration.md](configuration.md#the---app-flag).
