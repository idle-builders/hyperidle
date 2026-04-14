---
name: implement
description: Multi-step TDD implementation workflow that designs, tests, implements, and validates a work package story until all tests pass, linters are clean, and every acceptance criterion is independently verified.
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

1. Read the relevant work package story in `WORK_PACKAGES.md` matching `$ARGUMENTS`.
2. Read `ARCHITECTURE.md` sections relevant to this story.
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

## Rules

- Never write implementation code before the validation setup (Phase 3) is complete. Tests first, always.
- Never skip phases, even for simple stories.
- Never weaken tests to make them pass.
- Never leave lint errors.
- Never add scope beyond the acceptance criteria.
- Never mark a criterion as done without evidence.
- If a criterion cannot be verified, stop and ask for clarification — do not guess.
- Report blockers immediately rather than working around them.
