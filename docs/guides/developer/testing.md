# Testing

Commands, affected-slice mechanics, and the E2E lanes. Test-writing rules — file naming, the fixture pattern, integration-test archetypes, conventions — live in [`.claude/rules/testing.md`](../../../.claude/rules/testing.md); this guide does not restate them.

A test file's name also decides its **world**: `.test.ts(x)`, `.spec.ts(x)`, `.stories.tsx` and anything under a `__` path segment are development, and a production file may never import one. The rule, and the ledger of production-path files that are really development, are in [CLAUDE.md](../../../CLAUDE.md#production-and-development-files).

## Test Commands

```bash
npm run test                     # AFFECTED unit + component tests (--changed=origin/main, fast)
npm run test:full                # ALL unit + component tests (no changed-file filter)
npm run test:integration         # ALL integration tests: service + harness projects
npm run test:integration:service # service integration only (DB/API, vitest fixtures, PGlite)
npm run test:integration:harness # harness integration only (real binaries + real LLM, serial)
npm run test:all                 # ALL unit + component + integration sequentially (test:full + test:integration)
npm run test:e2e                 # affected Playwright E2E (--only-changed=origin/main)
npm run test:e2e:full            # ALL Playwright E2E specs
npm run verify                   # check + lint + knip + knip:production + deps:check + mock-inventory:check + builds. No tests.
npm run verify:release           # verify + test:full + test:integration (incl. harness) + full e2e — run before a version bump
npm run verify:quick             # check + lint + knip + knip:production only
```

`verify` chains the static gates (check, lint, knip, knip:production, deps:check, mock-inventory:check) and the web and desktop builds. It runs **no tests** — those run in CI on every PR and push. It signs nothing: there is no attestation.

**Run a specific file: `npm run test:full -- <path>`.** Not `npm run test -- <path>` — the `--changed` filter intersects with the filename filter, so an unchanged file silently runs zero tests and exits green.

## Where each lane runs

Tests run in **CI**, not on your machine. The split is by cost, not by trust.

| Lane | Per PR + push to main (`ci.yml`) | Version bump (`release-guard.yml`) | Local only |
|---|---|---|---|
| Static gates (check, lint, knip ×2, deps, mock-inventory, builds) | full | — | `npm run verify` |
| Unit + component | affected (`--changed=<base>`) | **full** | `npm run test:full` |
| Service integration | affected (`--project service --changed=<base>`) | **full** | `npm run test:integration:service` |
| E2E (Playwright) | — | **full**, 8 shards | `npm run test:e2e` |
| Harness (real binaries + real LLM) | — | — | `npm run test:integration:harness` |

The per-merge lane runs only the slice **affected** by the diff — the tests whose import-closure intersects your changes. The full unfiltered run at release is the backstop for anything affected-selection under-selects.

**The harness lane has no CI job.** It needs four real CLI binaries and real LLM credentials, so it stays local, and no gate blocks a release whose harness lane never ran. Running it is a human step on the release checklist (`npm run verify:release`).

> Note: as of 2026-08-09 the harness lane is red on `origin/main` itself (5 failed / 62 passed — codex MCP readiness, opencode `step_finish`). Compare against `origin/main` before concluding your branch broke it.

#### When to run the harness lane manually

No CI job executes the harness lane, which makes the manual run YOUR job during development. Run `npm run test:integration:harness` (or `-- <file>` for one file) and get it green before shipping whenever you:

- change harness setup or plumbing — anything under `layers/agent-execution/harness-registry/src/`, session provisioning, CLI adapter configs (`CLI_TOOL_CONFIGS`), or `require-harness.ts`,
- write a new harness-facing `*.integration.test.ts` or modify an existing one.

Nothing downstream will catch it for you. `verify:release` is a checklist you run, not a gate that runs itself — a harness break found at the version bump is a break that shipped past its author, and one found after release is a break nothing looked for.

> **E2E under-selection caveat (R3 from AT1):** Playwright `--only-changed` selects by changed *spec files + their import graph*. Every e2e spec imports only `./fixtures` + Node builtins — zero imports from `layers/core-ui/src` — so a pure app-code change selects no e2e specs. This is not a coverage hole: the affected unit/component leg catches the component (white-box, imports it). Affected-e2e = "specs you edited"; full e2e at release covers all journeys.

## Integration Tests

Two archetypes — **service** (real DB + app via `{ db, app, eventBus }` fixtures) and **harness-facing** (the real installed harness binary, zero stubs, hard-fail if absent). Fixture pattern and full rules: [`.claude/rules/testing.md`](../../../.claude/rules/testing.md) §"Integration tests: two archetypes".

Harness availability is gated with `requireHarness(<name>)` — `layers/agent-execution/harness-registry/src/__tests__/require-harness.ts` — never `skipIf`. That source-level gate is now the *only* automated part: the execution-level floor that used to assert every supported harness actually ran (and ran symmetrically) lived in the attestation and went with it. See [harness coverage enforcement](../../agent-layer/harness-coverage-enforcement.md) for what remains and what does not.

## E2E Tests (Playwright)

```bash
npm run test:e2e
```

**Do not start `npm run dev` first.** Playwright's `webServer` (`layers/core-ui/playwright.config.ts`) boots its own Vite on port 5179 — deliberately not dev's 5173, so a sibling dev server can't serve stale code — and the specs mock the API via `page.route`, so no API server is needed. A server already on port 3001 is the documented hang hazard for test boot. Chromium only.

## AH6 Real-Interaction Lane (record/replay + live refresh)

The AH6 lane proves three real assistant interactions end-to-end — DM round-trip, tool action visible in the UI, and thinking→answered streaming transition — through the live `AssistantOverlay` with no mocks on the proof path.

Two modes:

**Everyday replay** — `$0`, offline, no key required. Replays committed cassettes from `layers/core-ui/__e2e__/cassettes/default.json` at the `callLlm` choke point in `layers/agent-execution/harness-registry/src/llm-client.ts` (`LLM_CASSETTE_MODE=replay`). Runs via its **own config** `playwright.ah6.config.ts` (testMatch `**/AH6-*.spec.ts`) — it does not activate under the default Playwright config, and verify's e2e leg never invokes it.

```bash
npm run test:e2e:ah6   # key-free, offline, deterministic
```

**On-demand live refresh** — re-records cassettes against a real cheap OpenRouter model, asserts loose invariants (non-empty reply, tool fired + effect visible, cost > 0 ≤ cap). Local only — never a GitHub Actions job. Requires `OPENROUTER_API_KEY` in `.env`.

```bash
npm run smoke:ah6      # scripts/ah6-smoke-local.ts
```

### How the cassette layer works

`LLM_CASSETTE_MODE` gates the `callLlm` function in `llm-client.ts`:

| `LLM_CASSETTE_MODE` | Behavior |
|---|---|
| unset (production) | Direct network call — zero overhead, no interception |
| `replay` | Returns the recorded `LlmResponse` from `LLM_CASSETTE_DIR/LLM_CASSETTE_SCENARIO.json`. Awaits `LLM_REPLAY_DELAY_MS` (default 80ms) before returning so the ThinkingRow is paintable. No network call, no key. |
| `record` | Makes a real call via `callLlmDirect`, writes `{key, request, response}` to the cassette file **eagerly per call** (Playwright SIGKILLs the webServer, so process-exit handlers are only a fallback). Accumulates cost and fails closed if `AH6_MAX_COST_CENTS` is exceeded mid-run. |

Cassette key = SHA-256 of canonical JSON `{model, system, messages, tools, maxTokens}`. Tool-use ids, timestamps, agent ids, and UUIDs are normalized to stable tokens so keys are deterministic across runs. `apiKey`/`baseUrl`/`provider` are excluded from the hash (offline-invariant); the stored `apiKey` is `__redacted__`. A missing key in replay mode throws `CassetteMissError` — fail-closed, never falls through to a network call.

`layers/core-ui/__e2e__/cassettes/default.json` is committed to git. Re-recording regenerates the file; the PR diff is the maintainer's drift-detection surface.

### Ports

| Lane | API port | Vite port |
|---|---|---|
| Dev server | 3001 | 5173 |
| Default e2e (Playwright-managed Vite) | — (API mocked) | 5179 |
| AH5 lane | 3097 | 5182 |
| AH6 lane | 3098 | 5183 |

### Spec file

`layers/core-ui/__e2e__/AH6-assistant-interaction.spec.ts` — three scenarios (S1/S2/S3) using real `AssistantOverlay` handles. No `page.route()` on the assistant, turn, session, credential, or LLM paths. Shell-scaffolding mocks (`/api/auth/me`, `/api/teams`) are tolerated to render the shell.

### AH5 superseded

AH6 supersedes AH5's synthetic probe (`ah5-real-turn-probe.ts` + `write_session_notes("AH5-SMOKE-OK")` task); those artifacts are deleted and `smoke:ah5` is retired. The AH5 encrypted-credential test (`ah5-live-agent-path.spec.ts` S1) remains.

## Mock Data

Mock data is allowed only inside the permitted-mock surface (tests, stories, `__fixtures__/`, e2e, seed scripts). See the [mock-data policy](./mock-data-policy.md).
