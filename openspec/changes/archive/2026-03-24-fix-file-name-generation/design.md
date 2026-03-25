## Context

File name generation is handled by `buildScenarioFileSlug()` in `finalruntestspec/src/lib/test-plan.ts`. It slugifies the scenario title and strips the feature-name and feature-folder prefixes. However, it does not strip generic/noise tokens from the *middle* or *end* of the slug, so words like "critical", "flows", "happy", "path" leak through.

The `GENERIC_FEATURE_TOKENS` set (used by `deriveFeatureFolderFromFeatureName()`) only strips trailing generic words from the *folder* name, not from the *file* slug.

The AI model returning `targetPath` can also produce verbose slugs if its system prompt doesn't discourage noise words — but this is a secondary concern; the deterministic slug builder should be the guard.

## Goals / Non-Goals

**Goals:**
- Strip common non-descriptive tokens from generated file slugs so file names are concise and meaningful.
- Expand `GENERIC_FEATURE_TOKENS` with additional noise words commonly seen in user requests.
- Apply token stripping to `buildScenarioFileSlug()`, not just `deriveFeatureFolderFromFeatureName()`.
- Maintain backward compatibility — never rename existing files.
- Add unit tests to cover the improved behavior.

**Non-Goals:**
- Modifying the AI system prompt to control how the model proposes target paths (future work).
- Retroactively renaming any existing `.finalrun/tests/` files.
- Changing folder-name derivation logic (already works correctly via trailing token stripping).

## Decisions

1. **Reuse the same `GENERIC_FEATURE_TOKENS` set** for both folder and file slug stripping rather than maintaining two separate lists. Rationale: a single source of truth is simpler to maintain.

2. **Strip generic tokens from file slugs after prefix removal** — apply the same trailing-strip approach used in `deriveFeatureFolderFromFeatureName` to the result of `buildScenarioFileSlug`. Also strip *leading* generic tokens. This preserves meaningful middle tokens while trimming noise from the edges.

3. **Do not strip tokens from the middle of a slug** — stripping middle tokens risks creating confusing joins (e.g., `add-critical-login` → `add-login` loses ordering context). Only strip leading and trailing noise tokens.

## Risks / Trade-offs

- **Over-stripping**: If the expanded token set is too aggressive, meaningful words could be stripped. Mitigation: only strip leading/trailing tokens, and guard against stripping a slug to empty (fall back to `'coverage'`).
- **Under-stripping**: Some noise words not in the set will still leak through. Mitigation: the set can be expanded iteratively as new patterns emerge.
