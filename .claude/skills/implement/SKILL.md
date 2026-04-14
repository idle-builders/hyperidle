---
name: implement
description: "Use when you need to build a work package story from scratch. Triggers: story ID mentioned, new feature requested, acceptance criteria need implementing."
argument-hint: "[story-id or description]"
user-invocable: true
allowed-tools: Read Edit Write Bash Grep Glob Agent
---

# Implementation Workflow

You are executing a disciplined, multi-step implementation workflow for: **$ARGUMENTS**

This workflow follows Test-Driven Development with architectural validation. You coordinate specialist agents and do the implementation work yourself. Every phase must complete before moving to the next.

**Cardinal rule: No implementation before validation setup.** The definition of done and failing tests must exist before any production code is written. If you cannot define how to verify a criterion, stop and clarify the requirement.

---

## Phase 1 — Understand

Build complete understanding of what needs to be built and why.

1. Read the relevant work package story in `docs/WORK_PACKAGES.md` matching `$ARGUMENTS`.
2. Read `docs/ARCHITECTURE.md` sections relevant to this story.
3. Read any other referenced architecture documents.
4. Read existing code in the packages this story touches. Understand current patterns.
5. List the **acceptance criteria** — these are your definition of done.
6. For each criterion, determine the **verification method**: automated test, E2E/Playwright test, eval, screenshot, or inspection. Every criterion must have a planned verification.

**Output:** Concise summary of what you're building, which packages are involved, and the acceptance criteria checklist with verification methods.

---

## Phase 2 — Design

Get a validated technical approach before writing any code.

1. **Spawn the architect agent** — ask it to design the technical approach for this story, covering API contracts, data model changes, component structure, and module boundaries.
2. Review the architect's design against the architecture docs and acceptance criteria.
3. **Spawn the adversary agent** with the architect's design — ask for an over-engineering check, layer violation scan, missing edge cases, and a STOP/REVISE/PROCEED verdict.
4. If the adversary says STOP or REVISE: address critical issues. Re-consult architect if needed. Max 2 rounds — then make a judgment call and proceed.

**Output:** Finalized technical approach.

---

## Phase 3 — Write Tests

Write failing tests that prove the acceptance criteria. Target: 100% coverage of new code.

For each acceptance criterion:
- **Backend criteria:** Unit tests with `createTestDb()`, integration tests with `createTestApp()`.
- **Frontend criteria:** Component tests with Vitest + Playwright E2E tests for user-visible behavior.
- **API criteria:** Integration tests covering success responses, error responses, and edge cases.
- **Data criteria:** Tests covering queries, mutations, validation, and constraint violations.

Every criterion must have at least one test. Run all tests to confirm they **fail** (red phase).

Do NOT write implementation code yet. Only tests.

**Output:** All test files created. All tests failing with clear error messages.

---

## Phase 4 — Implement

Write the minimum code to make all tests pass.

1. Implement following the design from Phase 2.
2. After each logical unit, run the specific tests.
3. Continue until all tests from Phase 3 are green.
4. If a test reveals a design flaw, fix the implementation — do NOT weaken the test.

**Output:** All tests passing.

---

## Phase 5 — Validate

Ensure the implementation is production-ready.

Run in sequence: `bun run check`, `bun run lint`, `bun test`. Fix any issues. Maximum 5 fix attempts per step. If still failing after 5 attempts, stop and report the blocker.

**Output:** All three validation steps passing with zero errors.

---

## Phase 6 — Check Definition of Done

Independently verify every acceptance criterion is met. This is not a self-review — this is proof.

1. For each acceptance criterion from Phase 1, verify using the planned verification method:
   - Run the specific test(s) that prove this criterion and confirm they pass.
   - For UI criteria: run Playwright tests and/or take screenshots showing the correct state.
   - For structural criteria: inspect the code to verify compliance.

2. Check coverage: run `bun test --coverage` and verify 100% coverage of new code.

3. For each criterion, record: PASS (with evidence) or FAIL (with gap description).

4. If any criterion is FAIL: go back to Phase 4 and fix it. Do not proceed with failures.

**Output:** DoD report — every criterion with PASS and evidence. Zero failures.

---

## Phase 7 — Self-Review

Catch anything the automated checks and DoD missed.

1. List all files created or modified.
2. Verify: no TODO/FIXME/HACK, no console.log, no commented-out code, explicit types on exports, error paths handled, no unnecessary imports.

**Output:** Final confirmation that implementation is complete and clean.

---

## Anti-Rationalization Table

You WILL be tempted to skip steps. Here are the excuses you'll generate and why they're wrong:

| Excuse | Rebuttal |
|--------|----------|
| "This is too simple to need tests first" | Simple stories have the highest skip rate and the highest regression rate. The process exists because judgment fails under time pressure. |
| "I'll add tests after — same result" | Tests written after implementation test the implementation, not the requirement. They encode bugs as expected behavior. |
| "The architect review will slow me down" | A 5-minute design review prevents a 2-hour rework when you discover a layer violation at Phase 5. |
| "I already know the design, I'll skip Phase 2" | You know YOUR design. The architect checks it against docs you haven't read. The adversary finds the failure mode you haven't considered. |
| "Phase 6 is redundant — I already ran the tests in Phase 5" | Phase 5 validates that code works. Phase 6 validates that the RIGHT code was built. They answer different questions. |
| "I can fix this lint error later" | Later is never. Lint errors compound. Fix now or the next agent inherits your debt. |
| "This acceptance criterion is obviously met" | If it's obvious, proving it takes 30 seconds. If you can't prove it, it's not obvious — it's assumed. |
| "I'll just add this small extra feature while I'm here" | Scope creep is the #1 cause of story failure. Build exactly what was asked. File a new story for the rest. |

If you catch yourself generating a reason to skip a phase: **that's the signal that the phase is needed most.**

---

## Rules

- Never write implementation code before the validation setup (Phase 3) is complete. Tests first, always.
- Never skip phases, even for simple stories.
- Never weaken tests to make them pass.
- Never leave lint errors.
- Never add scope beyond the acceptance criteria.
- Never mark a criterion as done without evidence.
- If a criterion cannot be verified, stop and ask for clarification — do not guess.
- Report blockers immediately rather than working around them.
