---
name: verify
description: "Run type check, lint, and tests. Auto-fix what's fixable."
user-invocable: true
min_tool_calls: 4
---

# Verify

**Why:** Types, lint, and tests are the three automated gates that catch regressions before they reach other agents or humans. Running them after every change prevents broken code from compounding — the next agent inherits whatever you leave behind.

Run `bun run verify` — it orchestrates check + lint + test in one pass and outputs a TOON summary. Use `--only check,lint` or `--only test` to run a subset. Use `--raw` for full uncompressed output when debugging failures.

If verify fails, fix and re-run. Max 3 fix attempts per gate:

1. **Type errors** — fix source files, not type definitions
2. **Biome lint** — try `bun run lint:fix` first, then fix remaining manually
3. **ESLint** — React Compiler, hooks exhaustive-deps, Drizzle ORM safety. Fix manually.
4. **Tests** — fix the implementation, not the test (unless the test is wrong)
5. **Playwright** — if web/ files changed, also run `cd packages/web && npx playwright test`. E2E proves the UI works in a real browser.

Report PASS/FAIL for each gate. All must pass.

**Boundary conditions:**
- TypeScript strict mode doesn't produce false positives — read the error, you have a real type mismatch
- Flaky tests are real failures — they indicate non-determinism. Fix the flakiness, don't re-run and hope.
- If a Biome lint rule doesn't apply, add a `biome-ignore` with an explanation — never silently skip
- If an ESLint rule doesn't apply, add an `eslint-disable-next-line` with a reason comment
- Drizzle `enforce-delete-with-where` / `enforce-update-with-where`: only suppress if the intent is truly to operate on ALL rows (e.g., factory reset). Document the intent.

## Target

$ARGUMENTS
