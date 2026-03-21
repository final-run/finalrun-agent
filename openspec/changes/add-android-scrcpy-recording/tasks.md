# Tasks

- [x] Add `AndroidRecordingProvider` in `packages/device-node/src/device` with headless `scrcpy` start/stop lifecycle management.
- [x] Register the Android provider in `packages/device-node/src/device/RecordingManager.ts`.
- [x] Remove the Android recording exclusion in `packages/cli/src/goalRunner.ts`.
- [x] Decide Android bitrate behavior, then either pass an explicit `--video-bit-rate` or intentionally rely on `scrcpy` defaults.
- [x] Add unit tests for Android provider startup, early-exit failure handling, stop behavior, and availability checks.
- [x] Add or update `RecordingManager` tests for sanitized Android `.mp4` output paths and cleanup behavior.
- [x] Add or update runner-level tests so Android attempts recording when `config.recording` is present.
- [x] Verify reporting still copies and renders Android `.mp4` recording artifacts correctly.
- [x] Run the relevant test suites after implementation and fix any regressions.
