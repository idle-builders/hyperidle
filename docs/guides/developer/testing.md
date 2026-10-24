# Testing

Commands, affected-slice mechanics, and the E2E lanes. Test-writing rules — file naming, the fixture pattern, integration-test archetypes, conventions — live in [`.claude/rules/testing.md`](../../../.claude/rules/testing.md); this guide does not restate them.

A test file's name decides its **world**: `.test.ts(x)`, `.spec.ts(x)` and anything under a `__` path segment are development, and a production file may never import one.

## Test Commands

```bash
npm run test                     # AFFECTED unit + component tests (--changed=origin/main, fast)
npm run test:full                # ALL unit + component tests (no changed-file filter)
npm run test:integration         # ALL integration tests: service + harness projects
npm run test:integration:service # service integration only (DB/API, vitest fixtures, PGlite)
npm run test:integration:harness # harness integration only (real binaries + real LLM, serial)
npm run test:all                 # ALL unit + component + integration sequentially
npm run test:e2e                 # ALL Playwright E2E specs, against the real server (local only)
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
| E2E (Playwright) | — | — | `npm run test:e2e` |
| Harness (real binaries + real LLM) | — | — | `npm run test:integration:harness` |

The per-merge lane runs only the affected slice. The full unfiltered run at release is the backstop. E2E runs only on your machine, as part of `verify:release` or by hand.

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

The specs in `layers/core-ui/__e2e__/` drive the real app against the real server — no mocked API. `layers/core-ui/playwright.config.ts` starts everything itself: a server on port 3102 over a freshly seeded demo world in a temp folder (`npm run setup -- --demo`), with Vite on 5182, so a `npm run dev` beside it is never the one under test. No agent runs there: work that would start an agent waits in the queue. Specs that change what others read (reviews, documents, people, plugins, Find) run after the rest on the same world.

First start (`start.spec.ts`) gets its own server on an empty database (3103, Vite on 5183) that looks for agent programs like the desktop app does, so at least one of claude-code, codex, opencode or cursor-agent must be installed and signed in on your machine.

Chromium only; the installed Chrome stands in when Playwright's own browser was never downloaded. Local only — there is no CI job.

## Mock Data

No made-up data in production code. Tests and `__fixtures__/` may hold their own; the demo world (`tools/setup/src/demo-world/`) holds the story the app and the e2e tests run against. See the [mock-data policy](./mock-data-policy.md).
