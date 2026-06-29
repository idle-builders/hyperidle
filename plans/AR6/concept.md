# AR6 — Concept

## Verdict: NO new primitive, NO new load-bearing noun.

AR6 introduces nothing. Every noun it operates on is already locked:

- **Honest harness integration test** — locked by AR1 (`.claude/rules/testing.md` §two archetypes): an `*.integration.test.ts` whose integration point is the real installed harness binary, zero stubs, `requireHarness`-gated, full `SUPPORTED_HARNESSES` matrix. AR6 only *applies* this definition to the MCP/capabilities/enforcement set.
- **`SUPPORTED_HARNESSES`** = `builtin + claude + codex + opencode` — locked by AR2 (`scripts/lib/honest-harness-predicate.ts`). Unchanged.
- **`runThroughHarness` / `SUPPORTED_HARNESS_LANES` / `createSandboxCapture` / `requireHarness`** — the reusable real-run seam, locked by AR2 (`packages/server/src/harness/__tests__/provision-real-session.ts`). AR6 is a *consumer*, not an author, of these.
- **MCP bridge / route / registry**, **return gate**, **enforcement registry**, **proposed call / tailored grant** — all pre-existing product concepts (X2, AL6, AL7). AR6 does not reshape them; it changes the *fidelity of the tests that prove them*, not the things proven.

AR6 is pure test-infra consolidation: per-file triage (convert / demote / remove) so each enforcement & bridge behavior has exactly ONE honest proof. No domain concept, no API, no schema, no UI.

## The one conceptual line worth stating

"One honest proof per behavior" is the operative principle, and it is already AR6's AC3 — not a new concept, a constraint. The non-obvious part the triage must internalize:

**A test that drives `provisionSession` with a hand-rolled `class … implements HarnessAdapter` is NOT a harness integration test — it is a service-integration test of `provisionSession`'s orchestration whose harness is faked.** Three distinct honest shapes exist; the triage assigns each file to exactly one:

1. **Harness-facing integration** — real binary/model through the production bridge/`provisionSession`, `requireHarness`-gated, full matrix. The integration point is the harness.
2. **Service integration** (`*.integration.test.ts`, no harness) — real DB + app via fixtures; legitimate where the integration point is the route/DB/registry lifecycle, not the agent. (e.g. the verdict→grant HTTP path, the MCP route's 401/token routing.) These keep `.integration` and do NOT need the matrix — they are not harness-facing per `isHarnessIntegrationPath` (they live outside `harness/__tests__/`).
3. **Pure-logic unit** (`*.test.ts`) — the gate-verdict function, the config-dialect writer, the tool-result mapper, the broken-stream predicate. Stubs are correct here; no `.integration` label.

The triage's load-bearing judgment is distinguishing (1) from (2) from (3) per behavior, then deleting/demoting the scripted look-alikes so only one honest proof survives per behavior. That judgment is in `architecture.md`.

## Relevant docs

- `.claude/rules/testing.md` §Integration tests: two archetypes (the locked rule).
- `.pipeline/work-packages/TRACK-AR.md` §AR6 (the spec).
- No `docs/` concept doc is touched — AR6 changes no product surface.
