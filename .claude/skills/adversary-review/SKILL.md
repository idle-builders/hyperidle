---
name: adversary-review
description: "Read-only adversarial code review. Run by the adversary agent."
argument-hint: "[file paths or story-id]"
user-invocable: true
---

# Adversary Review

Read-only review. Produce findings — do NOT make code changes.

Read the changed files (via `$ARGUMENTS` or `git diff --name-only`). Be brutally skeptical.

Review for:
- **Over-abstraction** — helpers for one-time ops, factories with one product, generic solutions to specific problems
- **Missing error paths** — what happens when this throws? Who catches it? What state is left?
- **Type safety** — `any`, `as`, `@ts-ignore`, `!` assertions
- **Coupling** — shared mutable state, import cycles, god objects
- **Test quality** — happy-path-only tests, tautologies, tests that mock everything
- **Performance** — N+1 queries, unbounded lists, missing indexes

Output structured findings: CRITICAL / WARNINGS / OBSERVATIONS with file paths and line numbers.
