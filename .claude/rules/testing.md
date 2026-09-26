---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
---

# Testing Rules

## What a test is for

A test guarantees functionality: a rule our code decides, or in UI that something that must be shown
is shown, or that what the user does works. It must be able to fail when production breaks. If you
can't say what production change would turn it red, don't write it.

## Never a test

- **Types and shapes.** That's TypeScript's job.
- **Freezing what a document says.** That's the document's job.
- **"X stays removed."** Deletion plus typecheck/knip already prove that.
- **Reading source, the filesystem, or config** (`readFileSync`, `execSync("grep …")`, `existsSync`,
  validating `package.json`/`tsconfig`). That's a lint rule or a build check, not a test.
- **A re-export**, or a copy of the implementation pasted inside the test.
- **DB-engine or library behavior** — you're testing Postgres or a package, not your code.
- **An assert that can't fail** — existence-only (`toBeDefined`, `not.toThrow`), an assert buried
  inside `if (success)`, or no assert at all.

If you can't express it as `import { thing } from "../module"` → call it → `expect(...)`, it's not a
test.

## Coverage, not mirroring

An acceptance criterion is covered by a test — new or already existing; search before writing one. ACs
point at what to test. They are not a checklist to mirror one test per line, and "test all paths" is
not the standard — cover the branches that matter, not every combination.

## One home per rule

Test a rule once, at the lowest tier that owns it (the module that decides it, the component that
renders it). A higher tier proves wiring only: one success and one refusal per door, not the rule
again.

## Structure

- Tests live inside a package (`layers/`, `framework/`, `applications/`, `tools/`), never at the repo
  root.
- File naming decides the lane and the world — see `CLAUDE.md` § Test file naming. Not repeated here.
- Tests must not depend on execution order.
- Variants are table-driven — one row per distinct branch, not one test each.
- Deleting code deletes its tests and its test-only support code in the same change.
- A repeated setup gets one shared helper per package. Integration tests drive the production
  composition root — never a hand-built stand-in for a real port. A module-tier test may inject
  small fakes for the ports the module doesn't own, over a real DB — what's banned is
  re-implementing the port or the composition actually being proven.
- Test names say the behavior. No planning labels (track letters, work-item ids) — `taste.md` already
  rules that out everywhere. Keep file headers to ~5 lines. Comments in test files follow
  `.claude/rules/comments.md`, same as production code.

## TDD

Still the way we work: write the failing test for the behavior first, then the code that turns it
green. The red phase is scaffolding — once green, drop what only existed to force the failure.

## UI

- Component tests assert what the user sees or does — not class names, DOM markers, pixel values, or
  styling.
- Playwright covers user journeys plus what only a real browser proves: layout, scroll, focus, real
  pointer events, z-order, history, reload. No screenshots inside a spec. No known-failures list — a
  failing e2e test gets fixed or deleted, never hidden.

## Harness (agentic)

One test per behavior, looping over all four supported harnesses with per-harness expected values,
through one shared helper, driving the production config — never a subset, never a stub. Gate each
lane with `requireHarness(<name>)`: a missing binary hard-fails the run, it never skips to green.
Non-harness binaries (e.g. `gh`) use `requireBinary(<name>)` instead.

The harness lane has no CI job — it needs four real CLI binaries and real LLM credentials, so it runs
locally only, as part of the `verify:release` checklist. If you change harness plumbing
(`layers/agent-execution/harness-registry/`, session provisioning, CLI adapter configs,
`require-harness.ts`) or touch a harness-facing test, run `npm run test:integration:harness` yourself
and get it green before shipping — nothing downstream will catch it for you.

Mechanism, matrix, and locked test models: `docs/agent-layer/harness-coverage-enforcement.md`.

## Migrations

A migration test lives only as long as a deployed database can still sit before that migration. Once
nothing does, delete it. Keep one empty-database-to-latest run as the standing check.

## Integration tests: two archetypes

Decide by one question: **is the harness / agent / CLI itself the thing under test?**

- **No → service integration.** Real PGlite + real Hono app via the `{ db, app, eventBus }` fixtures.
- **Yes → harness integration.** The real installed binary, real LLM, all four harnesses, zero stubs —
  see Harness above.

If any part of the path is stubbed, scripted, or `vi.mock`'d, it isn't an integration test — it's a
mislabeled unit test. Test the pure logic as a `.test.ts` unit instead, or run it against the real
thing.

## Fixture pattern

```typescript
// layer integration test
import { test, describe, expect } from "../__testing__/test-fixtures.js";

describe("Feature", () => {
  test("works", async ({ db, app }) => {
    await db.insert(teams).values({ id: "t1", name: "Alpha", slug: "alpha" });
    const res = await app.request("/api/teams");
    expect(res.status).toBe(200);
  });
});
```

```typescript
// db/fabric integration test
import { test, describe, expect } from "@hyperidle/db/test-fixtures";

describe("Feature", () => {
  test("persists", async ({ db }) => {
    await db.insert(teams).values({ id: "t1", name: "Alpha", slug: "alpha" });
    const rows = await db.select().from(teams);
    expect(rows).toHaveLength(1);
  });
});
```

Each package keeps its own fixtures in `src/__testing__/test-fixtures.ts`:
`layers/core-api`, `layers/agent-orchestration`, `framework/db` (published as
`@hyperidle/db/test-fixtures`), and `harness-registry` (published as
`@hyperidle/harness-registry/test-fixtures`, the real-harness sandbox/env
helpers a cross-package caller needs). Import a layer's own fixtures by
relative path; import another package's through its published subpath, never
a relative path into its `__tests__/`.

Service integration shares one PGlite instance per worker and `TRUNCATE`s before each test, so clean up
background work and file-local mocks before a test ends. Harness integration keeps file isolation and
runs serially.

## Other rules

- Use `test()` (not `it()`) in integration tests — only `test()` receives fixture injection.
- Never call `createTestDb()`, `createTestApp()`, or `new EventBus()` directly — use fixtures.
- Never write `beforeEach`/`afterEach` for DB setup — fixtures handle it. Use them only for non-DB
  setup (`vi.stubEnv` etc.).
- Never bump `HARNESS_TEST_MODELS` to make a flaky harness test pass — the model is founder-locked to
  the smallest tier each harness's auth allows; a test that only works on a bigger model means the
  feature is wrong, not the model.
- Prefer a polling watcher over `fs.watch` in tests — it flakes. Gate any real `fs.watch` test behind
  an env flag, excluded from the default run.
