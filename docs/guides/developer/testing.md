## Testing

### Test Commands

```bash
npm run test                     # affected unit + component tests (--changed=origin/main, fast)
npm run test:full                # ALL unit + component tests (no changed-file filter)
npm run test:integration         # ALL integration tests: service + harness projects
npm run test:integration:service # service integration only (DB/API, vitest fixtures, PGlite)
npm run test:integration:harness # harness integration only (real binaries + real LLM, serial)
npm run test:all                 # ALL unit + component + integration sequentially (test:full + test:integration)
npm run test:e2e                 # affected Playwright E2E (--only-changed=origin/main)
npm run test:e2e:full            # ALL Playwright E2E specs (no changed-file filter)
npm run verify                   # check + lint + knip + build + attestation (affected slice)
npm run verify:release           # same but VERIFY_SCOPE=full — runs all three legs fully (required at release)
npm run verify:quick             # check + lint + knip only
```

#### Affected vs full

`npm run verify` now selects the **affected** slice of the test suite vs `origin/main`:
- Unit/component: `vitest --changed=origin/main` — only tests whose import-closure intersects the diff.
- Integration: `vitest --project service --changed=origin/main` on the integration config — the **harness project is excluded entirely** from the affected leg. The real-LLM harness suite is release-gated: it runs only in `verify:release` (full scope), where the agentic floor + per-harness symmetry require it. Run it on demand with `npm run test:integration:harness`.
- E2E: `playwright test --only-changed=origin/main` — only specs whose file changed (black-box, so app-only changes select 0 specs; the full e2e run at release is the backstop).

**Before releasing a version bump**, run `npm run verify:release` (not just `verify`). The Release Guard rejects an `affected`-scope attestation on a version bump.

#### When to run the harness lane manually

The harness project (real installed binaries + real LLM) is release-gated — per-merge `npm run verify` never executes it. That makes the manual run YOUR job during development. Run `npm run test:integration:harness` (or `-- <file>` for one file) and get it green before shipping whenever you:

- change harness setup or plumbing — anything under `packages/server/src/harness/`, session provisioning, CLI adapter configs (`CLI_TOOL_CONFIGS`), `require-harness.ts`, or the honest-harness predicate/guard,
- write a new harness-facing `*.integration.test.ts` or modify an existing one.

The release `verify:release` run is the enforcement backstop, not the discovery point — a harness break found at the version bump is a break that shipped past its author.

> **E2E under-selection caveat (R3 from AT1):** Playwright `--only-changed` selects by changed *spec files + their import graph*. Every e2e spec imports only `./fixtures` + Node builtins — zero imports from `packages/web/src` — so a pure app-code change selects no e2e specs. This is not a coverage hole: the affected unit/component leg catches the component (white-box, imports it). Affected-e2e = "specs you edited"; full e2e at release covers all journeys.

Run a specific file: `npm run test -- packages/server/src/__tests__/my.test.ts`

### Test File Naming

| Pattern | Type | When to use |
|---|---|---|
| `*.test.ts` | Unit tests (pure logic) | Functions, utilities, state machines, calculations |
| `*.test.tsx` | Component tests (React rendering) | React components, hooks |
| `*.integration.test.ts` | Integration tests (real integration point, no stub) | **Service**: Drizzle queries, Hono routes end-to-end (`{ db, app, eventBus }` fixtures). **Harness-facing**: the real installed harness binary, zero stubs |
| `*.spec.ts` | E2E tests (Playwright) | User journeys across the full stack |

There is **one** integration suffix — `*.integration.test.ts`. There is no separate `*.real-harness.test.ts` lane (collapsed in AR1).

### Fixture Pattern (Integration Tests)

Integration tests use vitest fixtures — **do not** call `createTestDb()`, `createTestApp()`, or `new EventBus()` in test files. Fixtures inject `{ db, app, eventBus }` per test and handle setup/teardown automatically via PGlite TRUNCATE (~19ms between tests).

**Server integration tests** — import from `../test-fixtures.js`:

```typescript
import { test, describe, expect } from "../test-fixtures.js";
import { teams } from "@hyperidle/db";

describe("Teams API", () => {
  test("GET /api/teams returns all teams", async ({ db, app }) => {
    // Arrange
    await db.insert(teams).values({ id: "t1", name: "Alpha", slug: "alpha" });

    // Act
    const res = await app.request("/api/teams");

    // Assert
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject([{ id: "t1", name: "Alpha" }]);
  });
});
```

**DB/fabric integration tests** — import from `@hyperidle/db/test-fixtures`:

```typescript
import { test, describe, expect } from "@hyperidle/db/test-fixtures";
import { teams } from "@hyperidle/db";

describe("Teams table", () => {
  test("inserts and reads a team", async ({ db }) => {
    await db.insert(teams).values({ id: "t1", name: "Alpha", slug: "alpha" });
    const rows = await db.select().from(teams);
    expect(rows).toHaveLength(1);
  });
});
```

**Key rules:**
- Use `test()` not `it()` — only `test()` receives fixture injection.
- `beforeEach`/`afterEach` only for non-DB concerns (e.g. `vi.stubEnv`). Never for DB setup.
- Tests that need custom `AppOptions` destructure `{ db, eventBus }` and call `createApp()` manually.

### Harness-Facing Integration Tests (real binary, no stub)

An integration test exercises a **real integration point**. Decide which kind you're writing by one question: **is the harness / agent / CLI the thing under test?**

- **No → service integration.** The integration point is the DB + app. Use the `{ db, app, eventBus }` fixtures above.
- **Yes → harness integration.** The integration point is the **real installed harness binary**. Real CLI, real LLM, **zero stubs**. A stubbed / scripted / echoed / `vi.mock`'d harness adapter makes it a mislabeled unit test — move that logic to a `*.test.ts` unit instead.

Gate availability with `requireHarness(<name>)` (`packages/server/src/harness/require-harness.ts`) — **never `skipIf`**. A missing harness hard-fails the run (the work can't be completed). The strict harness model:

| Harness | Gate |
|---|---|
| `claude` · `codex` · `opencode` · `gh` | CLI binary on PATH, authed via keychain / inherited login — **no API key** |
| `builtin` | in-process; only key is `OPENROUTER_API_KEY` from `.env` |

`ANTHROPIC_API_KEY` is never a test gate; there is no `openai-key` gate for `builtin`.

These tests run locally (where binaries are installed) via the serial `harness` project in `vitest.integration.config.ts`; the signed attestation carries the result and enforces an executed-count floor (a green can't be minted while every agentic harness test skipped). Three mechanisms keep this honest: `requireHarness` (hard-fail), the `honest-harness-guard` lint check (rejects a stubbed harness adapter), and the attestation agentic floor.

**Full rules — single source:** [`.claude/rules/testing.md`](../../../.claude/rules/testing.md) §"Integration tests: two archetypes".

### E2E Tests (Playwright)

```bash
# Ensure dev server is running first
npm run dev &

# Run E2E tests
npm run test:e2e
```

Playwright config is in `packages/web/playwright.config.ts`. It runs Chromium only.

### AH6 Real-Interaction Lane (record/replay + live refresh)

The AH6 lane proves three real assistant interactions end-to-end — DM round-trip, tool action visible in the UI, and thinking→answered streaming transition — through the live `AssistantOverlay` with no mocks on the proof path.

Two modes:

**Everyday replay** — `$0`, offline, no key required. Replays committed cassettes from `packages/web/e2e/cassettes/default.json` at the `callLlm` choke point inside `packages/server/src/harness/llm-client.ts`. Runs in the normal e2e lane.

```bash
npm run test:e2e:ah6   # key-free, offline, deterministic
```

**On-demand live refresh** — re-records cassettes against a real cheap OpenRouter model, asserts loose invariants (non-empty reply, tool fired + effect visible, cost > 0 ≤ cap). LOCAL ONLY — never a GitHub Actions job. Requires `OPENROUTER_API_KEY`.

```bash
# Set OPENROUTER_API_KEY in .env first
npm run smoke:ah6
```

#### How the cassette layer works

`LLM_CASSETTE_MODE` env var gates the `callLlm` function in `llm-client.ts`:

| `LLM_CASSETTE_MODE` | Behavior |
|---|---|
| unset (production) | Direct network call — zero overhead, no interception |
| `replay` | Returns the recorded `LlmResponse` from `LLM_CASSETTE_DIR/LLM_CASSETTE_SCENARIO.json`. Awaits `LLM_REPLAY_DELAY_MS` (default 80ms) before returning so the ThinkingRow is paintable. No network call, no key. |
| `record` | Makes a real call via `callLlmDirect`, records `{key, request, response}` to the cassette file on process exit. Accumulates cost and fails closed if `AH6_MAX_COST_CENTS` is exceeded mid-run. |

Cassette key = SHA-256 of canonical JSON `{model, system, messages, tools, maxTokens}`. Tool-use ids, timestamps, agent ids, and UUIDs are normalized to stable tokens so keys are deterministic across runs. `apiKey`/`baseUrl`/`provider` are excluded from the hash (offline-invariant). A missing key in replay mode throws `CassetteMissError` — fail-closed, never falls through to a network call.

Cassette files at `packages/web/e2e/cassettes/default.json` are committed to git. Re-recording regenerates the file; the PR diff is the maintainer's drift-detection surface.

#### Ports

| Lane | API port | Vite port |
|---|---|---|
| Dev server | 3001 | 5173 |
| AH5 lane | 3097 | 5182 |
| AH6 lane | 3098 | 5183 |

#### Spec file

`packages/web/e2e/AH6-assistant-interaction.spec.ts` — three scenarios (S1/S2/S3) using real `AssistantOverlay` handles. No `page.route()` on the assistant, turn, session, credential, or LLM paths. Shell-scaffolding mocks (auth/me, teams) are tolerated to render the shell.

#### AH5 superseded

AH6 supersedes AH5's synthetic probe (`ah5-real-turn-probe.ts` + `write_session_notes("AH5-SMOKE-OK")` task). Those artifacts are deleted. `smoke:ah5` is retired. The AH5 encrypted-credential test (`ah5-live-agent-path.spec.ts` S1) and the broken-stream gate (`ah5-gates-on-broken-stream.integration.test.ts`) remain — they cover distinct production paths.

The `ah6-no-mock-guard` (part of `npm run verify`) statically fails if `AH5-SMOKE-OK` or `ah5-real-turn-probe` string literals reappear in `packages/` or `scripts/`.

### Test Conventions

- Test files live in `packages/`. No tests in `scripts/` or project root.
- Follow AAA pattern: Arrange, Act, Assert.
- Test all paths: success, error, boundary values, edge cases.
- Never mock Drizzle, Hono middleware, or internal modules.
- Use fixtures for all DB/API tests — never mock what the fixture provides.
- Mock data is allowed only inside the permitted-mock surface (tests, stories, `__fixtures__/`, e2e, seed scripts). See [mock-data policy](./mock-data-policy.md).
