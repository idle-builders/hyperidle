---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
---

# Testing Rules

## What a test is

A test imports application code and asserts on its behavior. That's it.

- Call a function, assert on the return value.
- Render a component, assert on the DOM.
- Send a request via the fixture-injected `app`, assert on the response.
- Write via the fixture-injected `db`, read back, assert on the data.

## What a test is NOT

- Reading source files with `readFileSync` to check for string patterns. That's a lint rule.
- Grepping the filesystem with `execSync("grep ...")`. That's a shell script.
- Checking that files exist or don't exist with `existsSync`. That's a build check.
- Spawning child processes to start servers. Use the `app` fixture.
- Validating config files (package.json, docker-compose.yml, tsconfig). That's CI.
- Asserting on documentation content. That's nothing.

If you can't express the assertion as `import { thing } from "../module" → expect(thing(...)).toBe(...)`, it's not a test.

## Structure

- Tests only live inside a package (under `layers/`, `framework/`, `applications/` or `tools/`). No tests in `scripts/` or project root.
- Unit tests: `<name>.test.ts` in `<root>/<pkg>/src/__tests__/`.
- Integration tests: `<name>.integration.test.ts` — exercise a **real integration point** with no stub standing in for it. Service integration uses the vitest fixtures that inject `{ db, app, eventBus }`; harness-facing integration uses the **real installed harness binary**. See **Integration tests: two archetypes**.
- E2E tests: Playwright for user-facing features (`*.spec.ts`).
- Tests must not depend on execution order.

### Test file naming

| Pattern | Type | Speed |
|---|---|---|
| `*.test.ts` | Unit tests (pure logic, no DB/server) | <1s per file |
| `*.test.tsx` | Component/UI tests (React rendering) | <1s per file |
| `*.integration.test.ts` | Integration — a real integration point, no stub of it: **service** (real DB + app fixtures) **or harness-facing** (real installed binary, zero stubs, hard-fail if absent) | 1-10s service / 30-90s harness |
| `*.spec.ts` | E2E (Playwright, separate from vitest) | 5-30s per test |

## Standards

- Write tests first (TDD). Every acceptance criterion that describes runtime behavior gets a test.
- ACs that describe static codebase properties (file locations, naming conventions, config shape) are enforced by lint rules or the type system — not tests.
- Follow AAA pattern: Arrange, Act, Assert.
- Test all paths: success, error, boundary values, edge cases.
- Use `test()` (not `it()`) in integration tests — only `test()` receives fixture injection.
- Never call `createTestDb()`, `createTestApp()`, or `new EventBus()` directly in test files — use fixtures.
- Never write `beforeEach`/`afterEach` for DB setup — fixtures handle setup and teardown automatically.
- `beforeEach`/`afterEach` only for non-DB setup (e.g. `vi.stubEnv`).
- Never write tests that only assert `toBeDefined()` or `not.toThrow()`.
- Design system: every UI component must have a `.stories.tsx` file.
- Prefer a polling watcher over `fs.watch` in tests — `fs.watch` flakes. Gate any real `fs.watch` test behind an env flag, excluded from the default run.

## Integration tests: two archetypes

An integration test exercises a **real integration point**, with no stub standing in for that point. Decide which kind you're writing by one question: **is the harness / agent / CLI the thing under test?**

- **No → service integration.** The integration point is the DB + app. Real PGlite + real Hono app via the `{ db, app, eventBus }` fixtures (already the norm), deterministic.
- **Yes → harness integration.** The integration point is the **real installed harness binary**, real LLM, across **every supported harness** — not just one — and **zero stubs**. **The supported matrix is `SUPPORTED_HARNESSES` = `builtin` + `claude` + `codex` + `opencode` + `cursor-agent`** (five harnesses; `gh` is the GitHub CLI, not a harness — use `requireBinary("gh")` for it). A harness-facing `*.integration.test.ts` must cover **all five** — a `requireHarness(<name>)` lane through real `provisionSession()` for each — **equal coverage, mechanically enforced, not a per-author choice**. **Gate it with `requireHarness(<name>)`, never a key proxy.** If a path through the harness adapter is stubbed, scripted, echoed, or `vi.mock`'d, it is **not** an integration test — it is a mislabeled unit test. Either test the pure logic directly as a `*.test.ts` unit (stubs belong there) or test it against the real harness. A stubbed-harness test is a false green: it proves the wrapper, not that the feature works on the harness; a subset-covered one is the same false green for the harnesses it omits.

**A binary absent means the work is not done — hard-fail, never skip.** Harness integration tests run **locally only**, via `test:integration`'s serial `harness` project (where the binaries are installed). A missing harness must **fail** the run via `requireHarness(<name>)`, which throws "harness X not installed — cannot complete," not `skipIf`-skip to green. A green minted while every agentic test silently skipped is the deepest false-green.

**The harness lane has NO CI job, per-merge or release.** It needs four real CLI binaries and real LLM credentials, so it stays on your machine. Per-merge CI runs the integration lane with `--project service`; the release lane (`release-guard.yml`) runs the full suite and e2e but still not the harness project. `npm run verify:release` includes it, but that is a checklist you run, not a gate that runs itself — **nothing blocks a merge or a release whose harness matrix never executed.** **The obligation this creates:** if you change harness plumbing (`layers/agent-execution/harness-registry/`, session provisioning, CLI adapter configs, `require-harness.ts`) or write/modify a harness-facing `*.integration.test.ts`, run `npm run test:integration:harness` yourself and get it green BEFORE shipping. Nothing downstream will catch it for you. A single file: `npm run test:integration:harness -- <path>`.

**Never bump a test model to make a flaky test go green.** `HARNESS_TEST_MODELS` (`layers/agent-execution/harness-registry/src/__tests__/require-harness.ts`) is founder-set to the smallest model each harness's auth allows, deliberately. A harness test must pass on the tiny baseline; if it only works on a bigger model the feature is wrong, not the model. A larger model is a separate founder decision. A test cannot override the model — it obtains one through the seam (`runThroughHarness` / `lockedHarnessAdapter`, same file).

**What actually enforces this, today.** Do not restate the mechanism here — `docs/agent-layer/harness-coverage-enforcement.md` is the authoritative account and this rule deliberately does not duplicate it. Two things are worth knowing before you rely on it:

- **The source-level gate is gone.** `scripts/honest-harness-guard.ts` and its three shrink-only allowlists were deleted under AU28's Ruling 10 (clean slate — see `.pipeline/work/AU28/retired-guards.md`, which flags this rule as deserving re-derivation). Nothing checks at lint time that a harness-facing test declares all its lanes or avoids a stubbed adapter.
- **The execution floor is gone too.** `assertHarnessSymmetry` enforced per-harness executed counts out of the signed attestation; both were deleted when test execution moved into CI. It had also been near-blind for most of its life — its path predicate matched 1 of the 12 files calling `requireHarness`, having stopped matching when the packages moved.

**So nothing enforces harness breadth today — not at lint time, not at run time.** It is on you, and only on you. `requireHarness` still hard-fails on an absent binary, which keeps an individual lane honest about whether it ran; it says nothing about whether you wrote all five.

## Fixture pattern (integration tests)

```typescript
// layer integration test — path is relative to the file, inside the same layer
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

Fixture sources — each package that has them keeps them in its own `src/__testing__/test-fixtures.ts`:
- `layers/core-api/src/__testing__/test-fixtures.ts` — `{ db, app, eventBus }` context.
- `layers/agent-orchestration/src/__testing__/test-fixtures.ts` — the orchestration layer's own app.
- `framework/db/src/__testing__/test-fixtures.ts` (`@hyperidle/db/test-fixtures`) — `{ db }` context.

Import a layer's fixtures from within that layer by relative path; `@hyperidle/db/test-fixtures` is the only one published as a subpath.

The PGlite pool allocates one instance **per test file** and reuses it between the tests in that file via `TRUNCATE` (~40ms). No teardown needed in test files.

It does NOT span files, despite what `test-pool.ts` claimed until recently: the service project runs with `isolate: true`, so each file gets a fresh context, `globalThis` resets, and `warmPool()` allocates again. Measured cost is ~1.47s per file (1.18s PGlite WASM boot + 0.30s migration) — across the 324-file lane, ~476s, roughly half its total CPU time. Fixing that means taking PGlite out of process or pointing the lane at a real Postgres; see the `@lore pool-does-not-span-files` note in `framework/db/src/__testing__/test-pool.ts`.
