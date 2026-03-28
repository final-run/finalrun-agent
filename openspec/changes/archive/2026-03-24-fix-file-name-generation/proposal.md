## Why

When generating test file names, frtestspec produces overly verbose slugs that incorporate non-descriptive context words from the user's request or campaign name. For example, a campaign named `add-language-critical-flows` with a scenario titled "Add Second Secondary Language" yields the file name `add-language-critical-flows-add-second-secondary-language.yaml` — the words "critical" and "flows" are user-context noise that should never appear in a file name.

## What Changes

- Expand `GENERIC_FEATURE_TOKENS` in `test-plan.ts` to strip common non-descriptive words (e.g., `critical`, `happy`, `path`, `primary`, `secondary`, `negative`, `positive`, `edge`, `basic`, `simple`, `complex`, `main`, `new`, `existing`, `verify`, `validate`, `confirm`, `ensure`, `should`) from both the feature-folder derivation and the file-slug generation.
- Refactor `buildScenarioFileSlug()` to also strip individual generic tokens from the resulting slug, not just the feature-name prefix.
- Add unit tests covering the improved stripping behavior.

## Capabilities

### New Capabilities

- `smart-file-slug`: Strip generic/noise tokens from generated test file names so they contain only meaningful scenario-specific words.

### Modified Capabilities

_None — no existing spec-level requirements are changing._

## Impact

- **Files modified**: `finalruntestspec/src/lib/test-plan.ts` (expanded token set + slug logic), `finalruntestspec/test/workflow.test.mjs` (new unit tests)
- **No breaking changes**: Existing file paths are never auto-renamed; only newly generated paths are affected.
- **No API or dependency changes**.
