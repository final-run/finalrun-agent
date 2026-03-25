## Context

The `plan.ts` and `apply.ts` commands use prompt strings for structured AI generation. Currently, these instructions do not enforce strict YAML formatting constraints, restrict testing to user-facing flows, or detail the requirements for idempotent setup/cleanup flows (e.g., handling cleaning up prior data first).

## Goals / Non-Goals

**Goals:**
- Enforce strict YAML formatting and template structure in `apply.ts`.
- Enforce idempotency justification for scenarios in `plan.ts`.
- Bound tests strictly to user-facing functionality in prompts.

**Non-Goals:**
- Changing the underlying TypeScript logic or parser.
- Validating the content of actions/assertions beyond layout conformance.

## Decisions

### Decision: Update System / User Prompts
Directly modify the prompt construction functions in `plan.ts` and `apply.ts`.
- **Rationale**: The core of the logic is LLM generation; prompt engineering is the correct level of abstraction for these content rules.

### Decision: Negative Constraints & Examples
Include explicit "Do Not" rules (Anti-patterns) and a Setup/Cleanup matrix in the prompts.
- **Rationale**: Critical for preventing hallucinations regarding API testing or partial skip-only setups.

## Risks / Trade-offs

- **[Risk] Prompt Length** → Prompts grow larger.
  - **Mitigation**: Leverage `gemini-2.5-flash`'s high reliability with context windows; keep guidelines dense and bulleted.
