# Design: Add frtestspec Skill Setup

## Context

`finalruntestspec` currently exposes a narrow CLI surface: `propose`, `generate`, and `validate`. That works when the operator runs commands directly in a shell, but it is noticeably rough compared with OpenSpec's workflow, where repo-local skills let the user stay inside the coding assistant and still drive the CLI backend.

This change needs a setup story that feels closer to OpenSpec without rebuilding OpenSpec wholesale. The smallest useful version is Codex-first skill installation plus shared Gemini credential resolution.

## Goals / Non-Goals

**Goals:**

- let a repository install `finalruntestspec` as Codex-visible skills instead of relying on users to remember `node ./bin/frtestspec.js`
- keep the CLI as the single execution backend so skills and terminal usage stay consistent
- add a project-local configuration file that records generated skill settings such as the chosen tool and CLI invocation
- resolve Gemini credentials through a shared helper with predictable precedence and actionable failures
- improve README and command guidance so the preferred path is “install skills, then use from the IDE”

**Non-Goals:**

- full multi-tool parity with OpenSpec in the first iteration
- generating Codex prompt files or slash commands beyond what skills already unlock
- replacing Gemini with a provider-agnostic AI abstraction
- storing secrets in committed config files

## Decisions

### 1. Add `init` and `update` commands to manage repo-local skills

`finalruntestspec` will adopt the same basic lifecycle language as OpenSpec:

- `frtestspec init --tool codex`
- `frtestspec update`

`init` creates `frtestspec/config.yaml` if it does not exist, records the selected tool and CLI invocation, and writes managed skill files under `.codex/skills/`. `update` reloads that config and rewrites the managed files from the current templates.

Why this approach:

- it matches the user's mental model from OpenSpec
- it makes skill installation explicit and repeatable
- it avoids hardcoding generated artifacts into the repository until the user opts in

Alternatives considered:

- `install-skill` only: simpler naming, but less familiar than OpenSpec's `init`/`update` flow
- no project config: rejected because update cannot reliably know which tool or invocation string to regenerate

### 2. Scope the first implementation to Codex skills

The first release will support `.codex/skills/` only. The config model and template renderer should be structured so additional tools can be added later, but the spec contract in this change only promises Codex.

Why this approach:

- it solves the immediate user problem in the current environment
- it avoids prematurely designing OpenSpec-sized multi-tool support

Alternative considered:

- support all OpenSpec tool directories immediately: rejected as too broad for the current need

### 3. Generate skills as thin wrappers over the CLI backend

Generated skills will contain instructions that tell the assistant to run the configured `frtestspec` command from the repo root and then interpret the resulting plan or artifact files. The backend command string will come from config, with a default of `frtestspec` and an override flag for local-path launches.

Why this approach:

- it keeps behavioral logic in TypeScript rather than in duplicated prompt files
- it supports both global installs and local `node /abs/path/bin/frtestspec.js` invocations
- it keeps skill regeneration deterministic

Alternatives considered:

- embed business logic directly into skill text: rejected because CLI and skill behavior would drift
- require global installation only: rejected because local compiled usage is already part of the current workflow


## Risks / Trade-offs

- [Risk] Users may assume skill installation alone also installs the CLI backend.
  Mitigation: `init` should verify the current invocation, persist the command string, and document that skills wrap the backend rather than replacing it.

- [Risk] Parsing dotenv files introduces another configuration surface.
  Mitigation: keep precedence narrow and error messages explicit about where the key was found or not found.

- [Risk] Generated skills may overwrite manual edits.
  Mitigation: treat skill files as managed artifacts and state that clearly in generated content and command output.

- [Risk] Codex-only support may disappoint users on other tools.
  Mitigation: structure config/templates for future expansion and document current scope clearly.

## Migration Plan

1. Add `init`/`update` commands and a config loader/saver for `frtestspec/config.yaml`.
2. Introduce managed Codex skill templates and write them into `.codex/skills/`.
3. Move Gemini key lookup into a shared resolver and update `propose`/`generate` to use it.
4. Refresh README and command output to point users toward the skill-first workflow.
5. Add tests for setup, update, credential precedence, and actionable missing-key failures.

Rollback is straightforward: users can remove `.codex/skills/frtestspec-*`, delete `frtestspec/config.yaml`, and continue using the CLI directly.

## Open Questions

- None for the first Codex-focused version.
