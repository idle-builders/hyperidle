---
name: slop-scan
description: Detect and fix AI-generated code anti-patterns — verbose naming, unnecessary comments, over-abstraction, defensive coding, and other AI slop. Run after implementation to clean up AI writing habits.
argument-hint: "[file paths or 'all' for recent changes]"
user-invocable: true
allowed-tools: Read Edit Bash Grep Glob
---

# Slop Scan

Detect and fix AI-specific code quality issues. AI-generated code has predictable failure modes that linters don't catch. This skill catches them.

## Step 1 — Scope

If `$ARGUMENTS` is provided, scan those files. Otherwise:

```bash
git diff --name-only HEAD~1
```

Read every file in scope completely.

## Step 2 — Scan for AI Slop

Check each file for these anti-patterns:

### Verbose Naming
AI loves unnecessarily descriptive names. Fix them.
- `processUserAuthenticationRequest` → `authenticate`
- `isValidEmailAddressFormat` → `isValidEmail`
- `handleButtonClickEvent` → `onClick` (or remove the wrapper entirely)
- `fetchAllAvailableProducts` → `getProducts`

**Rule:** If the context makes the meaning clear, the name should be short.

### Unnecessary Comments
AI comments that restate the code. Delete them.
- `// Initialize the counter` above `let count = 0`
- `// Return the result` above `return result`
- `// Check if user exists` above `if (!user)`
- JSDoc that adds no information beyond the type signature

**Rule:** Comments explain WHY, not WHAT. If the code is clear, the comment is noise.

### Over-Abstraction
AI creates abstractions compulsively. Flatten them.
- Helper functions called once → inline them
- Utility files with one export → move to the call site
- Wrapper functions that just forward arguments → remove them
- Config objects with one field → use the value directly
- Factory functions producing one product → just construct it

**Rule:** Abstraction is earned by repetition, not anticipated need.

### Defensive Over-Engineering
AI adds safety nets for impossible scenarios. Remove them.
- Null checks for values that can't be null (TypeScript strict mode guarantees this)
- Try-catch blocks around code that can't throw
- Default cases in switches over exhaustive unions
- Validation of internal function arguments (only validate at system boundaries)
- Fallback values for required config

**Rule:** Trust the type system. Trust internal code. Only defend at system boundaries.

### Unnecessary Async
AI makes everything async "just in case."
- `async` functions that never `await`
- `Promise.resolve(value)` instead of just `value`
- `await` on non-Promise values

### Filler Code
- Empty catch blocks
- `else { return }` after an `if { return }`
- `=== true` or `=== false` comparisons
- `toString()` on strings, `Number()` on numbers
- `Object.keys(x).length === 0` instead of a direct check
- Logging that was useful during development but not in production

### AI Tell-Tales
- `// TODO: implement` on implemented code
- `// This is a simplified version` when it's the final version
- `// For now, we'll use...` — if it works, it's not "for now"
- `// In a production environment...` — this IS the production environment
- Commented-out alternative implementations

## Step 3 — Fix

For each issue found:
1. Fix it directly. Slop removal is always safe when tests pass.
2. If a fix changes behavior, skip it and flag it instead.

## Step 4 — Verify

```bash
bun run check && bun run lint && bun test
```

If anything breaks, revert the specific change that caused it.

## Step 5 — Report

```
Slop scan: N issues found, M fixed in K files

Verbose naming:    3 fixed (authenticate, getProducts, ...)
Unnecessary comments: 7 removed
Over-abstraction:  2 inlined
Defensive code:    1 removed (impossible null check)
AI tell-tales:     4 removed

Validation: ✓ typecheck ✓ lint ✓ tests
```

If any issues were skipped (behavior-changing), list them separately.
