---
name: verify
description: Quick validation — runs typecheck, lint, and tests in sequence. Auto-fixes lint issues. Use after any code change to confirm nothing is broken.
user-invocable: true
allowed-tools: Bash Read Edit Grep
---

# Verify

Run the full validation suite and auto-fix what's fixable. Max 3 fix attempts per step.

## Step 1 — Type Check

```bash
bun run check
```

If it fails:
1. Read the error output. Identify the type error.
2. Fix the source file (not the type definition).
3. Re-run. Max 3 attempts.

If still failing after 3 attempts, report the remaining errors and stop.

## Step 2 — Lint + Format

```bash
bun run lint
```

If it fails:
1. Try auto-fix first:
   ```bash
   bun run lint:fix
   ```
2. Re-run `bun run lint` to check if issues remain.
3. If issues remain, fix them manually.
4. Max 3 attempts.

## Step 3 — Tests

```bash
bun test
```

If tests fail:
1. Read the failure output. Identify which test and why.
2. Fix the **implementation**, not the test (unless the test itself is wrong).
3. Re-run the specific failing test first, then full suite.
4. Max 3 attempts.

## Report

After all steps complete (or max attempts reached):

```
✓ Type check: PASS/FAIL (N errors remaining)
✓ Lint:       PASS/FAIL (N errors remaining)
✓ Tests:      PASS/FAIL (N/M passing)
```

If all pass, say nothing else. If any fail, list the unresolved issues.
