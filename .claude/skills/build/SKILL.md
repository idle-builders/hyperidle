---
name: build
description: "TDD implementation: write failing tests for all acceptance criteria, then write minimum code to make them pass. Domain knowledge for the builder persona."
argument-hint: "[workpackage-id]"
user-invocable: true
min_tool_calls: 18
---

# Build

**Why:** Tests written before code define the requirement, not the implementation. They catch when the wrong thing gets built. With failing tests as targets, implementation stays lean — every line of code exists because a test demands it.

Read the plan for `<target>` (check tasks or the workpackage in the relevant track file under `plans/work-packages/`).

## Red phase — write failing tests

For each acceptance criterion, write a test that proves it. Use:
- **Backend:** unit tests with `createTestDb()`, integration tests with `createTestApp()`
- **Frontend:** Vitest component tests + Playwright E2E + `.stories.tsx` for visual verification at `/designsystem`
- **API:** success, error, and edge case tests
- **Data:** queries, mutations, validation, constraint violations

Run `bun run verify` to confirm tests compile and lint cleanly, then run the test suite. Confirm the new tests **fail** (red phase). Do NOT write implementation code yet.

## Green phase — write minimum code

Implement each task in dependency order. Write the minimum code to make tests pass. For UI components, create a `.stories.tsx` file rendering key states. After each logical unit, run the relevant tests. Once all tests are green, run `bun run verify` to confirm the full gate passes (types, lint, tests).

Never weaken a test to make it pass. If a test reveals a design flaw, fix the implementation.

## Don't rationalize shortcuts

- "Too simple to need tests" — simple workpackages have the highest regression rate
- "I'll add tests after" — tests after code confirm the implementation, not the requirement
- "The test is wrong" — prove it's wrong before changing it. Most of the time, the implementation is wrong.
- "I'll add this extra feature while I'm here" — scope creep is the #1 cause of workpackage failure. Build exactly what was asked.
- "I can skip this task, it's covered by the next one" — each task exists because it was independently testable. Skipping creates gaps.

## Target

$ARGUMENTS
