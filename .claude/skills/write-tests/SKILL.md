---
name: write-tests
description: "Write failing tests for all acceptance criteria. TDD red phase — define the requirement before thinking about implementation."
argument-hint: "[workpackage-id]"
user-invocable: true
min_tool_calls: 12
---

# Write Tests

**Why:** Tests written before code define the requirement, not the implementation. They catch when the wrong thing gets built. Tests written after code just confirm what exists — they encode bugs as expected behavior.

Read the plan for `<target>` (check tasks or the workpackage in the relevant track file under `plans/work-packages/`).

For each acceptance criterion, write a test that proves it. Use:
- **Backend:** unit tests with `createTestDb()`, integration tests with `createTestApp()`
- **Frontend:** Vitest component tests + Playwright E2E + `.stories.tsx` for visual verification at `/designsystem`
- **API:** success, error, and edge case tests
- **Data:** queries, mutations, validation, constraint violations

Run `bun run verify` to confirm tests compile and lint cleanly, then run the test suite. Confirm the new tests **fail** (red phase). Do NOT write implementation code.

**Don't rationalize skipping this:**
- "Too simple to need tests" — simple workpackages have the highest regression rate
- "I'll add tests after" — tests after code confirm the implementation, not the requirement
- "The plan already describes what to build" — the plan describes intent, tests encode it as executable proof

## Target

$ARGUMENTS
