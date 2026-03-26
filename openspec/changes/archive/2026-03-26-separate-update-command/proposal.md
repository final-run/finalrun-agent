## Why

Currently, the `init` command performs both the initial setup and updates/refreshes of the configuration and skills. This conflates two distinct user intents: setting up a new project and updating an existing one. Separating these into `init` and `update` commands improves CLI clarity and follows standard patterns (like `npm init` vs `npm update`).

## What Changes

1.  **New `update` command**: A dedicated command to refresh project configuration and managed skills.
2.  **Refactored `init` command**: `init` will now focus exclusively on the first-time setup. It will check if a configuration already exists and, if so, inform the user to use `update` instead of silently refreshing.
3.  **Code separation**: Move common logic (writing config, writing skills) into shared utility functions if they aren't already, and separate the command handlers.

## Capabilities

### New Capabilities
- `update-command`: Provides a dedicated way to refresh FinalRun configuration and skills without re-running the full initialization flow.

### Modified Capabilities
- `init-command`: Focused exclusively on initial project setup, with guards against re-initialization.

## Impact

- `finalruntestspec/src/commands/init.ts`: Will be refactored to remove "refresh" logic.
- `finalruntestspec/src/commands/update.ts`: New file for the update command.
- Entry point registration for the new `update` command.
