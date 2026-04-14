---
name: verify
description: Quick validation — runs typecheck, lint, and tests in sequence. Auto-fixes lint issues. Use after any code change to confirm nothing is broken.
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

## Report

After all steps: report PASS/FAIL for each step. If all pass, say nothing else. If any fail, list the unresolved issues.
