---
name: write-tests
description: "Write failing tests for all acceptance criteria. TDD red phase — define the requirement before thinking about implementation."
argument-hint: "[workpackage-id]"
user-invocable: true
min_tool_calls: 12
---

# Write Tests

**Why:** Tests written before code define the requirement, not the implementation. They catch when the wrong thing gets built. Tests written after code just confirm what exists — they encode bugs as expected behavior.

Read the plan for `<target>` (check tasks or the workpackage in the relevant track file under `.pipeline/work-packages/`).

For each acceptance criterion, write a test that proves it. Every workpackage must produce tests across these four layers:

1. **Unit tests** — every service, utility, state machine, calculation, validation, and event handler. Every React component action handler and callback prop tested via Vitest. Full coverage of new code.
2. **Route integration tests** — every API route via `createTestApp()`, real Hono + middleware + PGlite. No mocks except LLMs. Cover: happy path, 401 (no auth), 404 (missing resource), 400 (bad input).
3. **Component tests** — every React component via Vitest. Test all action handlers, event handlers, state transitions, edge states, error states. `.stories.tsx` for visual verification at `/designsystem`.
4. **E2E tests** — Playwright for the **top 3 user actions** on each page the workpackage touches. Frontend → API → DB, only LLMs mocked. Navigate via app UI, not `page.goto()`. These are the merge guard — they prove primary actions survive integration.

`scripts/test-coverage-check.ts` runs in verify Phase 1 and fails if a route or page is missing tests. The linter enforces structural coverage; you provide the tests.

Run `npm run verify` to confirm tests compile and lint cleanly, then run the test suite. Confirm the new tests **fail** (red phase). Do NOT write implementation code.

**Don't rationalize skipping this:**
- "Too simple to need tests" — simple workpackages have the highest regression rate
- "I'll add tests after" — tests after code confirm the implementation, not the requirement
- "The plan already describes what to build" — the plan describes intent, tests encode it as executable proof

## Target

$ARGUMENTS
