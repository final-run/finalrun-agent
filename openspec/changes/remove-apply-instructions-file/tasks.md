## 1. Modify apply command

- [x] 1.1 In `apply.ts`, remove the `instructionsPath` variable and the `fs.writeFile(instructionsPath, ...)` call
- [x] 1.2 Print instructions content to stdout using `console.log()` instead of writing to file
- [x] 1.3 Add `instructions: string` to the return type and include it in the returned object
- [x] 1.4 Update the success message to remove the "Created apply instructions at" line referencing a file path

## 2. Update apply skill template

- [x] 2.1 In `skills.ts` `renderApplySkill()`, update step 4 wording from "Follow the generated instructions" to "Follow the instructions printed by the command"

## 3. Update tests

- [x] 3.1 In `workflow.test.mjs`, remove the assertion that `apply-instructions.md` exists on disk (line 155)
- [x] 3.2 Optionally assert that the returned result contains an `instructions` string

## 4. Verify

- [x] 4.1 Run `npm run build` in `finalruntestspec/` to confirm compilation
- [x] 4.2 Run `node --test finalruntestspec/test/workflow.test.mjs` to confirm all tests pass
