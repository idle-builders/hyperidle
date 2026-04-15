---
name: verify
description: "Run type check, lint, and tests. Auto-fix what's fixable."
user-invocable: true
allowed-tools: Bash Read Edit Grep
---

# Verify

**Why:** Types, lint, and tests are the three automated gates that catch regressions before they reach other agents or humans. Running them after every change prevents broken code from compounding — the next agent inherits whatever you leave behind.

Run in order. Max 3 fix attempts per step:

1. `bun run check` — fix type errors in source files, not type definitions
2. `bun run lint` — try `bun run lint:fix` first, then fix remaining manually
3. `bun run test` — fix the implementation, not the test (unless the test is wrong)

Report PASS/FAIL for each step.

**Boundary conditions:**
- TypeScript strict mode doesn't produce false positives — read the error, you have a real type mismatch
- Flaky tests are real failures — they indicate non-determinism. Fix the flakiness, don't re-run and hope.
- If a lint rule doesn't apply, add a `biome-ignore` with an explanation — never silently skip
