---
name: simplify
description: "Review changed code for over-abstraction, dead code, and unnecessary complexity. Fix without changing behavior."
argument-hint: "[file paths or 'all' for recent changes]"
user-invocable: true
allowed-tools: Read Edit Bash Grep Glob
---

# Simplify

**Why:** AI-generated code trends toward over-abstraction — too many layers, premature generalization, unused helpers. Simplifying after implementation keeps the codebase maintainable for the next agent and prevents complexity from compounding across stories.

Find recently changed files via `git diff --name-only HEAD~1` (or use `$ARGUMENTS`).

Look for and fix: helpers used only once (inline them), premature generics, dead code, unused exports, commented-out code, error handling for impossible scenarios, unnecessary async, wrapper types adding no value. ... generally anything where the same result could be achieved with simpler means.

Keep changes behavior-preserving. Run `bun run check && bun run lint && bun run test` after. Revert anything that breaks.
