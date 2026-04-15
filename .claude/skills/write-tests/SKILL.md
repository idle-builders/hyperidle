---
name: write-tests
description: "Write failing tests for all acceptance criteria. TDD red phase."
argument-hint: "[story-id]"
user-invocable: true
allowed-tools: Read Edit Write Bash Grep Glob
---

# Write Tests

**Why:** Tests written before code define the requirement, not the implementation. They catch when the wrong thing gets built. Tests written after code just confirm what exists — they encode bugs as expected behavior.

Read the plan for `$ARGUMENTS` (check tasks or the story in the relevant track file under `docs/work-packages/`).

For each acceptance criterion, write a test that proves it. Use:
- Backend: unit tests with `createTestDb()`, integration tests with `createTestApp()`
- Frontend: Vitest component tests + Playwright E2E
- API: success, error, and edge case tests
- Data: queries, mutations, validation, constraint violations

Run all tests. Confirm they **fail** (red phase). Do NOT write implementation code.

**Don't rationalize skipping this:**
- "Too simple to need tests" → simple stories have the highest regression rate
- "I'll add tests after" → tests after code confirm the implementation, not the requirement
- "The plan already describes what to build" → the plan describes intent, tests encode it as executable proof
