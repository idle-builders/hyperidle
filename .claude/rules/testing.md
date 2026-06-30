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

- Tests only live in `packages/`. No tests in `scripts/` or project root.
- Unit tests: `<name>.test.ts` in `packages/<pkg>/src/__tests__/`.
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

> **Enforced (shipped via Track AR1, equal-coverage hardened in AR2).** This is mechanically enforced now: a `requireHarness(<name>)` hard-fail helper (`packages/server/src/harness/__tests__/require-harness.ts`) replaces every `skipIf`-on-absent gate; the `honest-harness-guard` lint check (`scripts/honest-harness-guard.ts`, wired into `npm run lint`) rejects a stubbed/`vi.mock`'d harness adapter in a harness-facing integration test; an attestation agentic executed-count floor (`agenticExecuted`/`agenticSkipped` in the signed payload, enforced by `check-attestation.ts`) refuses a green where every agentic test skipped; and the redundant `*.real-harness.test.ts` lane is collapsed into `*.integration.test.ts` (it only existed to dodge a CI-binary problem that does not exist). The strict harness model: `claude`/`codex`/`opencode`/`gh` are keychain/inherited-login CLI binaries with **no API key**; `builtin` is gated by `OPENROUTER_API_KEY` (the only key — never Anthropic, never OpenAI).
>
> **Equal coverage across the supported matrix is mechanically enforced (AR2):** (a) the `honest-harness-guard` **coverage check** fails the build when a harness-facing `*.integration.test.ts` does not declare a `requireHarness(<name>)` lane for **every** member of `SUPPORTED_HARNESSES` (`builtin`/`claude`/`codex`/`opencode`, defined in `scripts/lib/honest-harness-predicate.ts`), naming the missing harnesses; and (b) the attestation carries **per-harness** executed counts (`agenticExecutedByHarness` in the signed payload) and `check-attestation` fails if **any** supported harness ran zero executed agentic assertions — proving each harness actually RAN, not just that the test declared it. The lint check gates the source; the attestation gates execution; together a subset-covered harness test (AR2's original regression) cannot ship and a declared-but-dead lane cannot mint green. Not-yet-converted AR3–AR6 files are staged as known debt in `scripts/honest-harness-guard.allowlist.json` (stubs) + `scripts/coverage-debt.allowlist.json` (coverage); both shrink monotonically as conversions land. AR2–AR6 convert the remaining currently-stubbed harness tests; see `.pipeline/work-packages/TRACK-AR.md`.

**Harness integration tests observe real output via `createSandboxCapture` + the `onBeforeTeardown` seam** (AR2). The seam fires after drain, before teardown deletes the sandbox — the only window to capture pure-sandbox files with no DB row. Import from `packages/server/src/harness/__tests__/provision-real-session.ts`; follow the four-step recipe in that module's JSDoc.

### Locked per-harness test-model matrix (AR7)

Models are **founder-set** in `HARNESS_TEST_MODELS` (`packages/server/src/harness/__tests__/require-harness.ts`). A test cannot override the model — it obtains one only via the seam (`runThroughHarness` or `lockedHarnessAdapter` from `provision-real-session.ts`).

**TINY-MODEL BASELINE:** every entry is deliberately the **smallest/cheapest** model its harness's auth allows. A harness integration test **must pass on these tiny models** — that is the baseline. If a test only works on a bigger model, the feature is wrong, not the model. **Never bump an entry to a larger model to make a flaky test go green** (tests must not drive behavior); a larger model is a separate founder-approved decision. (codex's floor is `gpt-5.4-mini`, not nano — a ChatGPT-account codex login rejects `gpt-5.4-nano`/`gpt-5-codex-mini`; nano is API-key-only.)

| Harness | Locked model (smallest tier) | Auth |
|---------|-------------|------|
| `builtin` | `deepseek/deepseek-v4-flash` | `OPENROUTER_API_KEY` (OpenRouter) |
| `claude` | `haiku` | keychain (inherited CLI login, no key) |
| `codex` | `gpt-5.4-mini` | keychain (inherited CLI login, no key) |
| `opencode` | `openrouter/z-ai/glm-4.7-flash` | `OPENROUTER_API_KEY` (OpenRouter) |

**Enforcement rule:** harness-facing `*.integration.test.ts` files must NOT import the raw model-callers (`cli-harness-adapter` / `builtin-harness-adapter` / `llm-client`) directly, and must NOT construct `new (Cli|Builtin)HarnessAdapter(` — `honest-harness-guard` fails the build for that. The only sanctioned source of a real adapter or resolved model for a test is the seam (`runThroughHarness` / `lockedHarnessAdapter`), whose factories read `HARNESS_TEST_MODELS`. The guard removes the import/construction override paths so a test reaches a model only through these locked factories; a hand-written raw `resolvedModel` object literal passed directly to `provisionSession` is an accepted residual gap (model-id string-matching was rejected as brittle).

All four harnesses are argument/request-enforced on the model: `builtin` passes it in the OpenRouter request body; `claude`, `codex`, and `opencode` all receive it via `--model {{model}}` in `CLI_TOOL_CONFIGS.<harness>.args`. `HARNESS_TEST_MODELS` is load-bearing for every harness — not just the OpenRouter ones.

Existing files that import raw model-callers are staged as shrinking debt in `scripts/model-import-debt.allowlist.json` (monotonic shrink, same pattern as stub + coverage allowlists). New or changed harness-facing integration tests must go through the seam — the guard hard-enforces this for any file not on the allowlist.

## Fixture pattern (integration tests)

```typescript
// server integration test
import { test, describe, expect } from "../test-fixtures.js";

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

Fixture sources:
- `packages/server/src/test-fixtures.ts` — exports `{ test, describe, expect }` with `{ db, app, eventBus }` context.
- `packages/db/src/test-fixtures.ts` (re-exported as `@hyperidle/db/test-fixtures`) — exports `{ test, describe, expect }` with `{ db }` context.

PGlite pool pre-warms 1 instance per worker and reuses it between tests via `TRUNCATE` (~19ms). No teardown needed in test files.
