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

1. **Unit tests** (`*.test.ts`) — every service, utility, state machine, calculation, validation, and event handler. Every React component action handler and callback prop tested via Vitest. Full coverage of new code.
2. **Service integration tests** (`*.integration.test.ts`) — every API route using the vitest fixture pattern: `import { test, describe, expect } from "../test-fixtures.js"` and destructure `{ db, app }`. Real Hono + middleware + PGlite via fixtures. Here the harness is **not** under test, so a deterministic LLM/harness double is fine. Cover: happy path, 401 (no auth), 404 (missing resource), 400 (bad input). Use `test()` not `it()` — only `test()` injects fixtures.
   - **Harness-facing integration tests** (also `*.integration.test.ts`) — when the harness / agent / CLI **is** the thing under test, the integration point is the **real installed CLI binary** (claude/codex/opencode/gh) or the in-process builtin: real LLM, every supported harness, **zero stubs**. **Gate with `requireHarness(<name>)`** (claude/codex/opencode/gh = binary on PATH; builtin = `OPENROUTER_API_KEY` — never a key proxy, never Anthropic/OpenAI). A stubbed/scripted/`vi.mock`'d harness here is a false green — demote it to a `*.test.ts` unit (pure logic, stubs allowed) or test it against the real harness. Binary absent → `requireHarness` **hard-fails** the run, never `skipIf` to green. See `.claude/rules/testing.md` §Integration tests: two archetypes (enforced via Track AR1: `requireHarness` + `honest-harness-guard` lint check + attestation agentic floor).
3. **Component tests** (`*.test.tsx`) — every React component via Vitest. Test all action handlers, event handlers, state transitions, edge states, error states. `.stories.tsx` for visual verification at `/designsystem`.
4. **E2E tests** (`*.spec.ts`) — Playwright for the **top 3 user actions** on each page the workpackage touches. Frontend → API → DB, only LLMs mocked. Navigate via app UI, not `page.goto()`. These are the merge guard — they prove primary actions survive integration.

### Fixture sources

- Server integration tests: `import { test, describe, expect } from "../test-fixtures.js"` — injects `{ db, app, eventBus }`.
- DB/fabric integration tests: `import { test, describe, expect } from "@hyperidle/db/test-fixtures"` — injects `{ db }`.
- No `createTestDb()`, `createTestApp()`, or `new EventBus()` in test files.
- No `beforeEach`/`afterEach` for DB setup — PGlite pool handles teardown via TRUNCATE (~19ms) between tests automatically.
- `beforeEach`/`afterEach` only for non-DB concerns (e.g. `vi.stubEnv`).

`scripts/test-coverage-check.ts` runs in verify Phase 1 and fails if a route or page is missing tests. The linter enforces structural coverage; you provide the tests.

Run `npm run verify` to confirm tests compile and lint cleanly, then run the test suite. Confirm the new tests **fail** (red phase). Do NOT write implementation code.

**Don't rationalize skipping this:**
- "Too simple to need tests" — simple workpackages have the highest regression rate
- "I'll add tests after" — tests after code confirm the implementation, not the requirement
- "The plan already describes what to build" — the plan describes intent, tests encode it as executable proof

## Target

$ARGUMENTS
