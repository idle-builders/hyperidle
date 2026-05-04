---
name: simplify
description: "Combined skill: scan for over-abstraction, dead code, and AI slop, then fix. Launches adversary to scan, then builder to apply."
argument-hint: "[file paths or 'all' for recent changes]"
user-invocable: true
min_tool_calls: 12
---

# Simplify

**Why:** AI-generated code trends toward over-abstraction — too many layers, premature generalization, unused helpers. Simplifying after implementation keeps the codebase maintainable.

Find recently changed files via `git diff --name-only HEAD~1` (or use `<target>`).

## Steps

| Step | Launch agent | With skill | Purpose |
|------|-------------|-----------|---------|
| 1 | **adversary** | `/adversary-scan <target>` | Produces findings with file paths and line numbers. Does NOT make changes. |
| 2 | **builder** | `/apply-review` (step 1 findings) | Verifies and applies meaningful & correct simplifications. Behavior-preserving only. Run `bun run verify` after. Revert anything that breaks. |
