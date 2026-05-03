---
name: verify
description: "Run type check, lint, and tests. Auto-fix what's fixable."
user-invocable: true
min_tool_calls: 4
---

# Verify

**Why:** Types, lint, and tests are the three automated gates that catch regressions before they reach other agents or humans. Running them after every change prevents broken code from compounding — the next agent inherits whatever you leave behind.

Run in order. Max 3 fix attempts per step:

1. `bun run check` — fix type errors in source files, not type definitions
2. `bun run lint:biome` — try `bun run lint:fix` first, then fix remaining manually
3. `bun run lint:eslint` — React Compiler, hooks exhaustive-deps, Drizzle ORM safety. Fix manually.
4. `bun run test` — fix the implementation, not the test (unless the test is wrong)
5. `cd packages/web && npx playwright test` — if web/ files changed. E2E proves the UI works in a real browser.

Report PASS/FAIL for each step. All must pass.

**Boundary conditions:**
- TypeScript strict mode doesn't produce false positives — read the error, you have a real type mismatch
- Flaky tests are real failures — they indicate non-determinism. Fix the flakiness, don't re-run and hope.
- If a Biome lint rule doesn't apply, add a `biome-ignore` with an explanation — never silently skip
- If an ESLint rule doesn't apply, add an `eslint-disable-next-line` with a reason comment
- Drizzle `enforce-delete-with-where` / `enforce-update-with-where`: only suppress if the intent is truly to operate on ALL rows (e.g., factory reset). Document the intent.
