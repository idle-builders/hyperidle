---
name: adversary-scan
description: "Read-only adversarial scan: hostile-persona review, over-abstraction, and AI slop detection. Domain knowledge for the adversary persona — all three negative lenses in one session."
argument-hint: "[file paths or workpackage-id]"
user-invocable: true
min_tool_calls: 8
---

# Adversary Scan

Read-only scan. Produce findings — do NOT make code changes.

Three negative lenses, one session.

## Required reading

1. `CLAUDE.md` (tech stack) and `docs/ui-design/component-budget.md` (component budget); canonical contracts under `docs/<topic>/canonical-shapes.md`
2. The relevant track file in `plans/work-packages/TRACK-*.md`
3. `.claude/rules/typescript.md` — TypeScript rules the code must follow

Then read ALL changed files (via `<target>` or `git diff --name-only`). Be brutally skeptical.

## Be thorough

Do not skim. Read every function body. Check every `as` cast. Open every test file and verify the assertions actually test something meaningful. If a test says it tests drag-drop, check that the drag-drop library's hooks are actually invoked. If a component claims accessibility, Tab through the focus order mentally. Surface-level "looks fine" is the adversary's failure mode.

---

## Lens 1: Adversarial review (hostile personas)

Read the diff through three hostile personas:

**The Saboteur** — Could a working backdoor or silent regression pass tests, lint, and a normal review? Where could a race condition fire only at scale? What test was weakened?

**The New Hire (Day 7)** — Reading this code cold, what would take 10 minutes to understand that should take 10 seconds? Which name lies about its behavior? What invariant must you know that nothing tells you?

**The Auditor** — Does every claim in the PR description match the diff? "Rate-limit added" — is it actually wired up? Coverage claims supported?

Also review for:
- **Over-abstraction** — helpers for one-time ops, factories with one product, generic solutions to specific problems
- **Missing error paths** — what happens when this throws? Who catches it? What state is left?
- **Type safety** — `any`, `as`, `@ts-ignore`, `!` assertions. Count them. Each one is a finding.
- **Coupling** — shared mutable state, import cycles, god objects
- **Test quality** — happy-path-only tests, tautologies, tests that mock everything
- **Performance** — N+1 queries, unbounded lists, missing indexes, allocations in render loops
- **Spec compliance** — check against the authoritative files named in the plan's Required reading

---

## Lens 2: Simplification

Flag anything where the same result could be achieved with simpler means:
- Helpers used only once (inline them)
- Premature generics
- Dead code and unused exports
- Commented-out code
- Error handling for impossible scenarios
- Unnecessary async (async on functions that never await)
- Wrapper types adding no value

---

## Lens 3: AI slop

Flag AI-generated code anti-patterns:
- **Verbose naming** — shorten when context is clear
- **Unnecessary comments** — comments that restate the code
- **Over-abstraction** — single-use helpers, trivial wrappers
- **Defensive over-engineering** — null checks for non-nullable types, try-catch around non-throwing code, validation of internal args
- **Unnecessary async** — async on functions that never await
- **Filler** — empty catch blocks, `=== true`, redundant else-return
- **AI tell-tales** — "TODO: implement" on implemented code, "simplified version", "for now", "in production"

---

## Output

Structured findings: CRITICAL / WARNINGS / OBSERVATIONS with file paths and line numbers.

## Target

$ARGUMENTS
