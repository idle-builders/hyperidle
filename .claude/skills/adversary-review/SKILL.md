---
name: adversary-review
description: "Read-only adversarial code review. Run by the adversary agent."
argument-hint: "[file paths or story-id]"
user-invocable: true
min_tool_calls: 8
---

# Adversary Review

Read-only review. Produce findings — do NOT make code changes.

## Required reading

1. `docs/work-packages/SHARED.md` — tech stack contracts, component budget
2. The relevant track file in `docs/work-packages/TRACK-*.md` for the story being reviewed
3. `.claude/rules/typescript.md` — TypeScript rules the code must follow

Then read ALL changed files (via `<target>` or `git diff --name-only`). Be brutally skeptical.

## Be thorough

Do not skim. Read every function body. Check every `as` cast. Open every test file and verify the assertions actually test something meaningful. If a test says it tests drag-drop, check that the drag-drop library's hooks are actually invoked. If a component claims accessibility, Tab through the focus order mentally. Surface-level "looks fine" is the adversary's failure mode — your job is to find what everyone else missed.

## Review for:
- **Over-abstraction** — helpers for one-time ops, factories with one product, generic solutions to specific problems
- **Missing error paths** — what happens when this throws? Who catches it? What state is left?
- **Type safety** — `any`, `as`, `@ts-ignore`, `!` assertions. Count them. Each one is a finding.
- **Coupling** — shared mutable state, import cycles, god objects
- **Test quality** — happy-path-only tests, tautologies, tests that mock everything, tests that assert obvious things but miss the hard cases
- **Performance** — N+1 queries, unbounded lists, missing indexes, allocations in render loops
- **AI slop** — over-commenting, unnecessary abstractions, code that looks impressive but does nothing, `@lore` comments that document a problem without fixing it
- **Spec compliance** — check component behavior against `docs/UI_DESIGN.md` and `docs/HUMAN_INTERFACE_LAYER.md`. If the spec says 4 columns, count the columns.

Output structured findings: CRITICAL / WARNINGS / OBSERVATIONS with file paths and line numbers.

## Target

$ARGUMENTS
