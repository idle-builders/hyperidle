---
name: simplify
description: Post-implementation simplification pass. Reviews recently changed code for unnecessary complexity, duplication, dead code, and over-abstraction. Fixes issues without changing behavior.
argument-hint: "[file paths or 'all' for all recent changes]"
user-invocable: true
allowed-tools: Read Edit Bash Grep Glob
---

# Simplify

Review and simplify code without changing behavior. Run this after `/implement`, before `/review`.

## Step 1 — Identify Scope

If `$ARGUMENTS` is provided, use those files. Otherwise, find recently changed files:

```bash
git diff --name-only HEAD~1
```

If no git history, ask the user which files to review.

## Step 2 — Analyze Each File

For each file, check for:

### Unnecessary Complexity
- **Over-abstraction:** Helpers/utilities used only once. Extract them back inline.
- **Premature generics:** Type parameters that are always the same concrete type. Remove the generic.
- **Config-driven behavior:** Configuration that's really just code in disguise. Replace with the code.
- **Factory functions** that produce a single product. Replace with the product.

### Duplication
- **Copy-paste code:** Three or more identical blocks → extract (two is fine, leave them).
- **Parallel structures:** Multiple objects/arrays that should be one data structure.

### Dead Code
- **Unused exports:** Functions/types exported but never imported elsewhere.
- **Unreachable branches:** Conditions that can never be true given the types.
- **Commented-out code:** Delete it. Git has history.

### Over-Engineering
- **"Just in case" error handling:** Catching errors that can't happen given the call site.
- **Defensive copies:** Cloning data that's never mutated.
- **Unnecessary async:** `async` functions that never `await`.
- **Wrapper types:** Types that add no information over the wrapped type.

## Step 3 — Fix

For each issue found:
1. Fix it directly. Don't ask — simplification is always safe when tests pass.
2. Keep changes behavior-preserving. If you're unsure whether a change is safe, skip it.

## Step 4 — Verify

After all simplifications:

```bash
bun run check && bun run lint && bun test
```

If anything breaks, revert the change that caused it. Simplification must never break tests.

## Step 5 — Report

```
Simplified N files:
- path/to/file.ts: removed unused helper, inlined single-use abstraction
- path/to/other.ts: deleted dead code (3 unreachable branches)

Validation: ✓ typecheck ✓ lint ✓ tests
```
