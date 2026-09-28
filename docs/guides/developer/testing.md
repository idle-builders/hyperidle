# Testing

Commands, affected-slice mechanics, and the E2E lanes. Test-writing rules — file naming, the fixture pattern, integration-test archetypes, conventions — live in [`.claude/rules/testing.md`](../../../.claude/rules/testing.md); this guide does not restate them.

A test file's name decides its **world**: `.test.ts(x)`, `.spec.ts(x)`, `.stories.tsx` and anything under a `__` path segment are development, and a production file may never import one.

## Test Commands

```bash
npm run test                     # AFFECTED unit + component tests (--changed=origin/main, fast)
npm run test:full                # ALL unit + component tests (no changed-file filter)
npm run test:integration         # ALL integration tests: service + harness projects
npm run test:integration:service # service integration only (DB/API, vitest fixtures, PGlite)
npm run test:integration:harness # harness integration only (real binaries + real LLM, serial)
npm run test:all                 # ALL unit + component + integration sequentially
npm run test:e2e                 # affected Playwright E2E (--only-changed=origin/main)
npm run test:e2e:full            # ALL Playwright E2E specs
npm run verify                   # check + lint + knip + knip:production + deps:check + mock-inventory:check + builds. No tests.
npm run verify:release           # verify + test:full + test:integration (incl. harness) + full e2e — run before a version bump
```

`verify` chains static gates and builds. It runs **no tests**.

**Run a specific file: `npm run test:full -- <path>`.** Not `npm run test -- <path>` — the `--changed` filter intersects with the filename filter, so an unchanged file silently runs zero tests and exits green.

## Where each lane runs

| Lane | Per PR + push to main (`ci.yml`) | Version bump (`release-guard.yml`) | Local only |
|---|---|---|---|
| Static gates | full | — | `npm run verify` |
| Unit + component | affected | **full** | `npm run test:full` |
| Service integration | affected | **full** | `npm run test:integration:service` |
| E2E (Playwright) | — | **full** | `npm run test:e2e:full` |
| Harness (real binaries + real LLM) | — | — | `npm run test:integration:harness` |

The per-merge lane runs only the affected slice. The full unfiltered run at release is the backstop.

**E2E under-selection note:** Playwright `--only-changed` selects by changed *spec files + their import graph*. Every e2e spec imports only `./fixtures` + Node builtins — zero imports from `layers/core-ui/src` — so a pure app-code change selects no e2e specs. This is not a coverage hole: the affected unit/component leg catches the component. Affected-e2e = "specs you edited"; full e2e at release covers all journeys.

## Integration Tests

Two archetypes — **service** (real DB + app via `{ db, app, eventBus }` fixtures) and **harness-facing** (the real installed harness binary, zero stubs, hard-fail if absent). Fixture pattern and full rules: [`.claude/rules/testing.md`](../../../.claude/rules/testing.md).

## Harness Integration Tests

Harness tests drive the four supported binaries — `claude`, `codex`, `opencode`, `cursor-agent` — against a real LLM. Rules (from [`.claude/rules/testing.md`](../../../.claude/rules/testing.md) § Harness):

- One test per behavior, looping over **all four** supported harnesses with per-harness expected values.
- Gate each lane with `requireHarness(<name>)` at describe scope — a missing binary hard-fails the run, never skips to green. Non-harness binaries (e.g. `gh`) use `requireBinary(<name>)` instead.
- Seed the locked model from `HARNESS_TEST_MODELS[harness].model` (in `require-harness.ts`), never hand-write a model literal.
- **No CI job.** The harness lane needs four real CLI binaries and real LLM credentials. It runs locally as part of the `verify:release` checklist. If you change harness plumbing or write a harness-facing test, run `npm run test:integration:harness` yourself — nothing downstream catches it.

```ts
describe("[harness:claude]", () => {
  requireHarness("claude");
  dbTest("…", async ({ db }) => runProof("claude", db), 180_000);
});
// one more each for codex, opencode, cursor-agent
```

Matrix and locked test models: `SUPPORTED_HARNESSES` and `HARNESS_TEST_MODELS` in `layers/agent-execution/harness-registry/src/__tests__/require-harness.ts`.

## E2E Tests (Playwright)

```bash
npm run test:e2e
```

**Do not start `npm run dev` first.** Playwright's `webServer` (`layers/core-ui/playwright.config.ts`) boots its own Vite on port 5179 — deliberately not dev's 5173 — and the specs mock the API via `page.route`, so no API server is needed. A server already on port 3001 is the documented hang hazard for test boot. Chromium only.

The full suite also runs nightly on `main` (`.github/workflows/e2e-nightly.yml`).

## Mock Data

Mock data is allowed only inside the permitted-mock surface (tests, stories, `__fixtures__/`, e2e, seed scripts). See the [mock-data policy](./mock-data-policy.md).
