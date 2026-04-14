---
name: slop-scan
description: "Use when AI-generated code needs cleaning. Triggers: after AI implementation, verbose/defensive patterns noticed, pre-review quality pass."
argument-hint: "[file paths or 'all' for recent changes]"
user-invocable: true
allowed-tools: Read Edit Bash Grep Glob
---

# Slop Scan

Detect and fix AI-specific code quality issues. AI-generated code has predictable failure modes that linters don't catch.

## Step 1 — Scope

Use `$ARGUMENTS` if provided, otherwise find recently changed files via git.

## Step 2 — Scan for AI Slop

Check each file for these anti-patterns:

**Verbose Naming** — Unnecessarily descriptive names. If context makes the meaning clear, the name should be short.

**Unnecessary Comments** — Comments that restate the code. Comments explain WHY, not WHAT. Delete JSDoc that adds nothing beyond the type signature.

**Over-Abstraction** — Helpers called once (inline them), utility files with one export (move to call site), wrapper functions that just forward arguments (remove them), config objects with one field (use the value directly), factory functions producing one product (just construct it).

**Defensive Over-Engineering** — Null checks for values that can't be null in strict TypeScript. Try-catch around code that can't throw. Default cases in exhaustive switches. Validation of internal function arguments (only validate at system boundaries). Fallback values for required config.

**Unnecessary Async** — `async` functions that never `await`. `Promise.resolve(value)` instead of just `value`. `await` on non-Promise values.

**Filler Code** — Empty catch blocks. `else { return }` after `if { return }`. `=== true`/`=== false` comparisons. Type coercions on already-correct types. Development logging left in production code.

**AI Tell-Tales** — `// TODO: implement` on implemented code. `// This is a simplified version` on final code. `// For now, we'll use...` on permanent solutions. `// In a production environment...` — this IS production. Commented-out alternative implementations.

## Step 3 — Fix

Fix directly. If a fix changes behavior, skip it and flag it instead.

## Step 4 — Verify

Run `bun run check && bun run lint && bun test`. Revert any change that breaks something.

## Step 5 — Report

List issues found, fixed, and skipped. Report validation status.
