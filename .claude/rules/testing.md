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
- **Yes → harness integration.** The integration point is the **real installed harness binary**, real LLM, across **every supported harness** — not just one — and **zero stubs**. **The supported matrix is `SUPPORTED_HARNESSES` = `builtin` + `claude` + `codex` + `opencode`** (`gh` is a tool, not an agent harness; `cursor-agent` is inert/not-spawnable). A harness-facing `*.integration.test.ts` must cover **all four** — a `requireHarness(<name>)` lane through real `provisionSession()` for each — **equal coverage, mechanically enforced, not a per-author choice**. **Gate it with `requireHarness(<name>)`, never a key proxy.** If a path through the harness adapter is stubbed, scripted, echoed, or `vi.mock`'d, it is **not** an integration test — it is a mislabeled unit test. Either test the pure logic directly as a `*.test.ts` unit (stubs belong there) or test it against the real harness. A stubbed-harness test is a false green: it proves the wrapper, not that the feature works on the harness; a subset-covered one is the same false green for the harnesses it omits.

**A binary absent means the work is not done — hard-fail, never skip.** Harness integration tests run locally via `test:integration`'s serial `harness` project (where the binaries are installed), and the signed attestation carries the result — no test suite runs in GitHub Actions. A missing harness must **fail** the run via `requireHarness(<name>)`, which throws "harness X not installed — cannot complete," not `skipIf`-skip to green. A green minted while every agentic test silently skipped is the deepest false-green.

**The harness lane is release-gated, not per-merge.** Per-merge verify (`scope:"affected"`) runs the integration leg with `--project service` — the harness project never runs. `npm run verify:release` (`scope:"full"`) runs both, and there the attestation floors bite. Same shape as e2e: affected slice per merge, full proof at release. **The obligation this creates:** if you change harness plumbing (`layers/agent-execution/harness-registry/`, session provisioning, CLI adapter configs, `require-harness.ts`, `scripts/lib/honest-harness-predicate.ts`) or write/modify a harness-facing `*.integration.test.ts`, run `npm run test:integration:harness` yourself and get it green BEFORE shipping. Per-merge verify will not run it for you, and the release bump must never be the first time the lane executes. A single file: `npm run test:integration:harness -- <path>`.

**Never bump a test model to make a flaky test go green.** `HARNESS_TEST_MODELS` (`layers/agent-execution/harness-registry/src/__tests__/require-harness.ts`) is founder-set to the smallest model each harness's auth allows, deliberately. A harness test must pass on the tiny baseline; if it only works on a bigger model the feature is wrong, not the model. A larger model is a separate founder decision. A test cannot override the model — it obtains one through the seam (`runThroughHarness` / `lockedHarnessAdapter`, same file).

**What actually enforces this, today.** Do not restate the mechanism here — `docs/agent-layer/harness-coverage-enforcement.md` is the authoritative account and this rule deliberately does not duplicate it. Two things are worth knowing before you rely on it:

- **The source-level gate is gone.** `scripts/honest-harness-guard.ts` and its three shrink-only allowlists were deleted under AU28's Ruling 10 (clean slate — see `.pipeline/work/AU28/retired-guards.md`, which flags this rule as deserving re-derivation). Nothing checks at lint time that a harness-facing test declares all its lanes or avoids a stubbed adapter. **The honesty of a harness test is currently on you, not on a check.**
- **The execution floor is real.** `scripts/check-attestation.ts` enforces per-harness executed counts (`agenticExecutedByHarness`) against `SUPPORTED_HARNESSES` at full scope, so a harness that ran nothing cannot mint a release green — for the files the predicate identifies.

## Kernel features test against the minimal strategy

**Kernel-feature tests run against the minimal strategy.** Both fabric and minimal ship as defaults (the user picks full vs minimal at setup). When building or testing **Kernel features**, assume fabric does not exist — the **real `minimalStrategy`** (`@hyperidle/strategy-minimal`) is what we build against and test for. All tests, templates, and the raw setup run against minimal: it is the simplest strategy that makes the product work, the port-floor every other strategy is built on, and the contributor template. Register the real `minimalStrategy` in kernel-feature integration tests — never a bespoke test-local strategy, never fabric. **Evals are the exception:** fabric-strategy correctness is exercised by evals with the fabric strategy, not by tests.

**Bet decomposition is not a Kernel event.** AU21 Decision I removed the built-in `bet_decomposition` mechanism entirely — whether/how a bet gets broken into tasks is a strategy/plugin concern, not a core platform feature. `strategy-minimal` re-provides "auto-decompose on bet creation" as a configurable default trigger through the generic trigger mechanism (tracked as AU24), not as inbuilt Kernel coverage every strategy must implement.

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

PGlite pool pre-warms 1 instance per worker and reuses it between tests via `TRUNCATE` (~19ms). No teardown needed in test files.
