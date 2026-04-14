---
name: verify
description: "Use when you need to confirm code compiles, lints, and passes tests. Triggers: after any code change, before committing, before shipping."
user-invocable: true
allowed-tools: Bash Read Edit Grep
---

# Verify

Run the full validation suite and auto-fix what's fixable. Max 3 fix attempts per step.

## Step 1 — Type Check

Run `bun run check`. If it fails, read the error, fix the source file (not the type definition), re-run. Max 3 attempts.

## Step 2 — Lint + Format

Run `bun run lint`. If it fails, try `bun run lint:fix` first, then fix remaining issues manually. Max 3 attempts.

## Step 3 — Tests

Run `bun test`. If tests fail, fix the **implementation** not the test (unless the test itself is wrong). Re-run specific failing test first, then full suite. Max 3 attempts.

## Anti-Rationalization Table

| Excuse | Rebuttal |
|--------|----------|
| "The type error is a false positive" | TypeScript strict mode doesn't produce false positives. Read the error — you have a real type mismatch. |
| "This lint rule doesn't apply here" | If it doesn't apply, add a biome-ignore with an explanation. Never silently skip. |
| "The test is flaky, not a real failure" | Flaky tests are real failures — they indicate non-determinism. Fix the flakiness, don't re-run and hope. |
| "I'll fix the implementation to match the test" | Fix the implementation to match the REQUIREMENT. If the test is wrong, fix the test — but prove why it's wrong first. |
| "It passed on the last run" | The last run is irrelevant. Only the current run is evidence. |

---

## Report

After all steps: report PASS/FAIL for each step. If all pass, say nothing else. If any fail, list the unresolved issues.
