# Test Coverage Gap Analysis (M4)

Analysis of why the existing test suite passed despite mock-data leaks, and how the M1 lint rules close the structural gap.

---

## Root cause: behavioral tests do not catch data-source leaks

The existing Vitest test suite for the web package tests component _behavior_ — what renders, what happens on click, what API calls are made. Behavioral tests import components and assert on their output, but they do not assert _where_ the data came from. A component that renders fixture data looks identical in a behavioral test to a component that renders API data. Both produce the same JSX output.

This is the structural reason the test suite passed while `MOCK_KNOWLEDGE_ITEMS` and `LEGACY_DETAILS` remained in production code:

- `WorkBet.tsx` renders bet data — tests assert the pitch is shown, but the tests provide the pitch via `createTestDb()` + API, so they do not see the `<pre>` fallback.
- `AppShell.tsx` mounts the rail and navigation — tests assert the rail items render, but the tests do not verify whether the rail items came from the API or from a fallback constant.
- `Rail.tsx` renders navigation items from props — a behavioral test only checks that the items appear in the DOM, not whether the props were sourced from an API call or a local constant.
- `SettingsPanel.tsx` shows team/user information — tests mock the context provider and never reach the fallback user ID path (`"u-founder"`).

## Concrete examples

### `packages/web/src/pages/KnowledgeDetail.tsx`

Lines 86–130 define `LEGACY_DETAILS`, `LEGACY_SOURCES`, and `FALLBACK_DETAIL` — three runtime constants that hold fixture data. The existing Vitest suite in `KnowledgeDetail.thread.test.tsx` and `KnowledgeDetail.block-popover.test.tsx` tests thread behavior and popover behavior, but does NOT assert that the detail object was fetched from the API rather than resolved from `LEGACY_DETAILS`. A test that renders `<KnowledgeDetail id="k1" />` passes whether the data came from the API or from the local constant — the rendered output is identical.

### `packages/web/src/fixtures/knowledge-data.ts`

`MOCK_KNOWLEDGE_ITEMS` (line 82) and `MOCK_CURATION_SUGGESTIONS` (line 290) are imported by `KnowledgeDetail.tsx` (line 43). The Knowledge List tests do not verify that the listed items match database content — they only verify that items render with expected shapes.

### `packages/server/src/middleware/auth.ts`

Line 90 falls back to `"u-founder"` when no human user exists in the database. The auth middleware test suite (`auth.test.ts`) covers the happy path (real user found) but tests that use `createTestApp()` without seeding a user would silently use the fallback, meaning the test passes but the behavior under test is the fallback path, not the real path.

## Why this matters

Data-source leaks are invisible to behavioral tests because:
1. The test harness controls the input to the component, so the component always gets valid data.
2. The test never exercises the fallback path (the mock data constant) because the test provides the data directly.
3. The component's output is the same whether the data came from a constant or an API.

## Structural fix: M1 lint rules

The `design/no-mock-data-import` and `design/no-mock-data-symbol` eslint rules (promoted to `"error"` in M4) provide a static guarantee that mock data symbols cannot enter production code paths. These rules:

1. Prevent imports from `fixtures/` directories in non-test, non-story, non-e2e files.
2. Flag symbol names matching the `MOCK_`, `FAKE_`, `STUB_`, `LEGACY_`, `FALLBACK_`, etc. prefixes in runtime code.

A lint error blocks CI before any behavioral test can even run. This means the class of bug (fixture data in production code) is caught at the import/symbol level, not at the rendering level — regardless of whether any behavioral test would have caught it.

The M1 lint rules do not replace behavioral tests; they complement them by adding a structural layer that behavioral tests cannot provide.
