## 1. Update Prompts

- [x] 1.1 Update `finalruntestspec/src/commands/plan.ts` to require idempotency justification for each scenario.
- [x] 1.2 Update `finalruntestspec/src/commands/apply.ts` to include strict YAML constraints, strict template, and Setup/Cleanup matrix.

## 2. Verification

- [x] 2.1 Verify with a test plan run that scenario lists include idempotency reasoning.
- [x] 2.2 Verify with an apply run that the output is valid YAML with idempotent setup structures.
