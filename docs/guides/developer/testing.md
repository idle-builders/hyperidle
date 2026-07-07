# Testing

Commands, affected-slice mechanics, and the E2E lanes. Test-writing rules — file naming, the fixture pattern, integration-test archetypes, conventions — live in [`.claude/rules/testing.md`](../../../.claude/rules/testing.md); this guide does not restate them.

## Test Commands

```bash
npm run test                     # AFFECTED unit + component tests (--changed=origin/main, fast)
npm run test:full                # ALL unit + component tests (no changed-file filter)
npm run test:integration         # DB/API integration tests only (vitest fixtures, PGlite)
npm run test:all                 # test:full + test:integration sequentially
npm run test:e2e                 # affected Playwright E2E (--only-changed=origin/main)
npm run test:e2e:full            # ALL Playwright E2E specs
npm run verify                   # check + lint + knip + knip:production + guard scripts + builds + attestation (affected slice)
npm run verify:release           # same but VERIFY_SCOPE=full — all three test legs run fully (required at release)
npm run verify:quick             # check + lint + knip + knip:production only
```

`verify` chains the static gates (check, lint, knip, knip:production, then six guard scripts — mock-inventory, demo-fixture, token, harness-vocab, ah5-mock, ah6-mock), the web and desktop builds, then `scripts/verify-attest.ts`, which runs the three test legs and signs the attestation.

**Run a specific file: `npm run test:full -- <path>`.** Not `npm run test -- <path>` — the `--changed` filter intersects with the filename filter, so an unchanged file silently runs zero tests and exits green.

## Affected vs Full

`npm run verify` selects the **affected** slice of the suite vs `origin/main` (`scripts/lib/attestation-scope.ts`):

- Unit/component: `vitest --changed=origin/main` — only tests whose import-closure intersects the diff.
- Integration: `vitest --changed=origin/main` on the integration config — a branch that doesn't touch harness/DB code skips the real-LLM harness suite.
- E2E: `playwright test --only-changed=origin/main` — only specs whose file changed.

**Before releasing a version bump, run `npm run verify:release`.** The Release Guard (`.github/workflows/release-guard.yml`) rejects an `affected`-scope attestation when the package version changes.

> **E2E under-selection is by design:** no e2e spec imports app code (specs import only their fixtures and test tooling), so a pure app-code change selects zero e2e specs. Not a coverage hole — the affected unit/component leg imports the component white-box; the full e2e run at release is the journey backstop. Affected-e2e = "specs you edited".

## Integration Tests

Two archetypes — **service** (real DB + app via `{ db, app, eventBus }` fixtures) and **harness-facing** (the real installed harness binary, zero stubs, hard-fail if absent). Fixture pattern and full rules: [`.claude/rules/testing.md`](../../../.claude/rules/testing.md) §"Integration tests: two archetypes".

Harness availability is gated with `requireHarness(<name>)` — `packages/server/src/harness/__tests__/require-harness.ts` — never `skipIf`. The deep enforcement mechanism (4-harness matrix, locked test models, symmetry assertion, lint guard, attestation floor) is owned by [harness coverage enforcement](../../agent-layer/harness-coverage-enforcement.md). The rules doc also carries two additions beyond the archetypes paragraph: AR2 equal-coverage enforcement (SUPPORTED_HARNESSES 4-lane rule, per-harness executed counts) and AR4 BUILTIN_ONLY_INTEGRATION exemption.

## E2E Tests (Playwright)

```bash
npm run test:e2e
```

**Do not start `npm run dev` first.** Playwright's `webServer` (`packages/web/playwright.config.ts`) boots its own Vite on port 5179 — deliberately not dev's 5173, so a sibling dev server can't serve stale code — and the specs mock the API via `page.route`, so no API server is needed. A server already on port 3001 is the documented hang hazard for test boot. Chromium only.

## AH6 Real-Interaction Lane (record/replay + live refresh)

The AH6 lane proves three real assistant interactions end-to-end — DM round-trip, tool action visible in the UI, and thinking→answered streaming transition — through the live `AssistantOverlay` with no mocks on the proof path.

Two modes:

**Everyday replay** — `$0`, offline, no key required. Replays committed cassettes from `packages/web/e2e/cassettes/default.json` at the `callLlm` choke point in `packages/server/src/harness/llm-client.ts` (`LLM_CASSETTE_MODE=replay`). Runs via its **own config** `playwright.ah6.config.ts` (testMatch `**/AH6-*.spec.ts`) — it does not activate under the default Playwright config, and verify's e2e leg never invokes it.

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

`packages/web/e2e/cassettes/default.json` is committed to git. Re-recording regenerates the file; the PR diff is the maintainer's drift-detection surface.

### Ports

| Lane | API port | Vite port |
|---|---|---|
| Dev server | 3001 | 5173 |
| Default e2e (Playwright-managed Vite) | — (API mocked) | 5179 |
| AH5 lane | 3097 | 5182 |
| AH6 lane | 3098 | 5183 |

### Spec file

`packages/web/e2e/AH6-assistant-interaction.spec.ts` — three scenarios (S1/S2/S3) using real `AssistantOverlay` handles. No `page.route()` on the assistant, turn, session, credential, or LLM paths. Shell-scaffolding mocks (`/api/auth/me`, `/api/teams`) are tolerated to render the shell.

### AH5 superseded

AH6 supersedes AH5's synthetic probe (`ah5-real-turn-probe.ts` + `write_session_notes("AH5-SMOKE-OK")` task); those artifacts are deleted and `smoke:ah5` is retired. The AH5 encrypted-credential test (`ah5-live-agent-path.spec.ts` S1) remains, and the broken-stream gate lives on as the unit test `ah5-gates-on-broken-stream.test.ts` (demoted from integration in AR6). The `ah6-no-mock-guard` (part of `npm run verify`) statically fails if the `AH5-SMOKE-OK` or `ah5-real-turn-probe` literals reappear in `packages/` or `scripts/`.

## Mock Data

Mock data is allowed only inside the permitted-mock surface (tests, stories, `__fixtures__/`, e2e, seed scripts). See the [mock-data policy](./mock-data-policy.md).
