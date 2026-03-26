# Harden CLI Device Selection

## Why

The current local-device flow is too narrow for day-to-day CLI use:

- device discovery collapses everything into a flat `DeviceInfo[]`
- Android only sees already-connected `adb` devices
- iOS only sees already-booted simulators
- multiple matching devices stop the run with a generic ambiguity error instead of letting the operator choose
- failures that happen before execution can leave useful system output visible only in transient logs instead of both the terminal and `runner.log`

This creates avoidable friction in the exact part of the workflow where operators need the most clarity: picking the right target and understanding why setup failed.

## Proposed Change

Add a richer local-device inventory and TTY-based selection flow inside `finalrun test`.

The implementation should:

- introduce a shared inventory model that separates runnable targets, startable targets, and probe diagnostics
- discover Android connected devices, Android emulator targets, and iOS simulator targets instead of only returning currently-runnable devices
- let the operator choose from a numbered device list when multiple runnable targets are available
- let the operator choose a startable emulator or simulator when nothing is runnable yet, then start it and continue the run
- print raw subprocess output to the terminal on probe or setup failure and persist the same output in `runner.log`
- preserve early discovery and setup logs even when a run fails before normal report initialization

## Scope

- shared inventory and transcript models in `packages/common`
- richer device discovery and target-start helpers in `packages/device-node`
- interactive device picking and boot-before-setup behavior in the existing `finalrun test` flow
- terminal rendering for device lists and raw failure output
- early log buffering and `runner.log` persistence for pre-execution failures
- unit and runner-level tests covering discovery, picking, startup, and failure-output behavior

## Non-Goals

- new public CLI commands for listing or starting devices
- a new public `--device` selector in v1
- physical Apple-device support
- non-TTY selection behavior in this change
- changing steady-state step rendering after a device has already been selected
