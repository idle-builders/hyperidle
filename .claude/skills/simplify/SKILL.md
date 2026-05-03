---
name: simplify
description: "Review changed code for over-abstraction, dead code, and unnecessary complexity. Fix without changing behavior."
argument-hint: "[file paths or 'all' for recent changes]"
user-invocable: true
min_tool_calls: 12
---

# Simplify

**Why:** AI-generated code trends toward over-abstraction — too many layers, premature generalization, unused helpers. Simplifying after implementation keeps the codebase maintainable for the next agent and prevents complexity from compounding across workpackages.

Find recently changed files via `git diff --name-only HEAD~1` (or use `<target>`).

## Phase 1: Scan (adversary)

Spawn an **adversary** agent with `/simplification-scan <target>`. It produces findings with file paths and line numbers but does NOT make changes.

## Phase 2: Fix (builder)

Spawn a **builder** agent with `/apply-review` passing the adversary's findings. It verifies and applies meaningful & correct simplifications, keeping all changes behavior-preserving. Run `bun run check && bun run lint && bun run test` after. Revert anything that breaks.
