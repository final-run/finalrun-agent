## Why

The current test spec generation in `plan.ts` and `apply.ts` lacks detailed guidelines to ensure that tests are strictly user-focused, adhere to valid YAML formatting, and implement idempotent setup/cleanup flows. This can result in fragile or non-runnable test specifications.

## What Changes

- **Update `plan.ts`**: Update the system instruction for the AI planner to ensure each test scenario justifies its idempotency strategy (e.g., how the setup flow cleans up from prior runs).
- **Update `apply.ts`**: Update the system instruction for the AI generator to enforce strict YAML constraints, exact template structure, and core principles such as testing only user-facing functionality and enforcing setup/cleanup idempotency.

## Capabilities

### New Capabilities
- `yaml-test-spec-rules`: Enforces that all generated test specifications and plans adhere to strict formatting, user-focus, and idempotency guidelines.

### Modified Capabilities

## Impact

- `finalruntestspec/src/commands/plan.ts`
- `finalruntestspec/src/commands/apply.ts`
