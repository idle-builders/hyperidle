# AU15 — Definition of Done

Each acceptance criterion → concrete verification. Per CLAUDE.md: runtime behavior → automated test (imports code, asserts behavior); static property → lint/guard (not grep-in-a-test). Gate: `npm run check` + `npm run lint` + `npm run test` + `npm run test:integration:service` (routine + intent paths hit real DB/txns → service integration lane) + `npm run knip:production` (proves the `shouldCoalesce` removal is clean).

> Revision round 1 — W2 adds the unified-coalescing test (AC-3b), W3 adds terminal-failure finalization tests (AC-3c/d), W4 requires building the `au6 --fixtures` harness (does not exist today) and scoping the rules to `routine-scheduler.ts`, W1 registers the `agent_work_intents` full guard in AU8.

## AC-1 — routine selection no longer calls `agent-selection.ts` at fire-time; resolved through the intent-queue/drain path

- **Static (edge gone) — lint guard.** `scripts/au6-agent-boundary-guard.ts` extended with a rule **file-scoped to `packages/server/src/services/routine-scheduler.ts`** — importing from `agent-selection` there is a finding. **W4: build the missing `--fixtures` self-test harness** (au13-style temp-fixture writer + `inspect()` assertions; au6 has only `--check` today) proving positive (import present → finding), negative (import absent → clean), and file-scoping (a *different* file importing `agent-selection` → NOT a finding). Runs in `npm run lint`. Backstop: `npm run check` (removing the import + `delegatedTo` type-checks); `au9`/`au11` guards stay green.
- **Runtime (drain resolves the agent) — service integration test** (`agent-work-intent-worker.routine-selection.integration.test.ts`, R1): a recorded `routine_run` intent, drained, produces a handed-off `AgentSessionRequest` whose target is chosen by `resolveAuthoritativeInput` (owner when not at WIP; delegate when owner at WIP + delegate available). Asserts intent `status="handed_off"` + `defaultAgentId`.

Decision recorded in `architecture.md §3`: drain-time (moved); the "formalized second mode" branch is explicitly **not** taken.

## AC-2 — WIP-limit + owner-role resolution produce the same effective outcome under the new timing, for every built-in routine

- **Built-ins (the 5) — service integration test** (`builtin-routines.integration.test.ts`, R6): `practice-meeting`, `post-bet-retro`, `portfolio-retro`, `knowledge-decay`, `knowledge-promotion` each still run via `runBuiltinRoutine`, write a terminal `routineRuns` row, attribute output to `routine.ownerAgentId` (add owner-attribution assertion if absent). They never invoked fire-time selection → behavior unchanged.
- **(b) WIP effective outcome (generic path) — service integration test:** authoritative WIP is `session-provisioning`'s `ConcurrencyLimitError`. Covered by R1's owner-at-WIP → delegate case, plus a case asserting an owner-at-WIP + no-delegate intent **defers** (request released to pending/retry, `routineRun` stays `running`, no second run) rather than erroring terminally.

## AC-3 — if timing moved fire→drain, rule out (or document/accept) the fire↔drain race

- **(a) Analysis — architecture doc §8:** race *resolved* (WIP evaluated at drain + provision, closest to execution); three anti-double-run guarantees (idempotency key, CAS-lease claim, unified run-row coalescing).
- **(b) Unified coalescing — service integration test (W2), R3:** (i) with an in-flight `routineRun(running)`, a second `checkAndFireRoutine` writes no second run/intent (`reason:"previous run still in progress"`); (ii) with the same running run and **no active session**, the manual-trigger route ALSO coalesces (`reason:"coalesced"`) — proving both fire paths share the run-row signal and the fired-but-unprovisioned double-run window is closed. Idempotency: recording the same `routine_run` intent twice yields one row (reuse `recordAgentWorkIntent` dedupe; assert in R1 setup).
- **(c) Terminal PROVISION failure finalizes the run — service integration test (W3), R4b:** a handed-off routine request that terminally fails at provision (`INTERNAL_ERROR`) → `projectRoutine` finalizes its `routineRun` to `error` → coalescing clears.
- **(d) Terminal INTENT failure finalizes the run — service integration test (W3), R4a:** a `routine_run` intent whose routine is deactivated between fire and drain → intent terminal `failed` → `failOrRelease` finalizes its session-less `routineRun` to `error` (not stuck `running`) → a subsequent `checkAndFireRoutine` for that routine does NOT coalesce (self-healed, no brick). This is the gap the coalescing guard would otherwise amplify.

## AC-4 — AU8's should-graph guard requires no special-cased allowlist entry for this edge

- **Static — lint guard.** After AU15, `routine-scheduler.ts` (Core) imports nothing from `agent-selection.ts`; the residual Core→Agent edge AU11 filed for an AU8 allowlist no longer exists — a future AU8 graph guard needs no carve-out. Proven by the AC-1 `au6` file-scoped rule (finding if the import returns). `server-factory.ts`'s stale `@lore AU11` residual-edge note replaced (comment; `npm run check` compiles).

## Read/write-ownership (founder directive — verified, not asserted)

- **routines / routineRuns — existing zero-allowlist AU13 guard** (`npm run lint`). AU15's new coalesce read (`findRunningRoutineRun`), drain-resolver reads (`getRoutineRunById`/`getRoutineById`), and `failOrRelease` finalize (`updateRoutineRunIfRunning`) route through `routine-service.ts`; `routine-scheduler.ts` + `agent-work-intent-worker.ts` are not allowlisted → any raw regression is caught. **Verification = guard stays green.**
- **agent_work_intents — AU15 adds zero new raw access; two FILE-SCOPED `au6` rules** (AC-1 §static): no `agent-selection` import + no raw `.from/.insert/.update/.delete(agentWorkIntents)` in `routine-scheduler.ts` only (NOT repo-wide — would false-positive on legit agent-owned importers/accessors). AU15's only intent write is `recordAgentWorkIntent`.
- **Full single-owner `agent_work_intents` guard — registered in AU8** (`.pipeline/work-packages/TRACK-AU.md`, "Follow-on registered by AU15"), with the three pre-existing non-owner accessors named (`routes/threads.ts`, `routes/sessions-routes.ts`, `agent-layer-boot.ts`) to migrate first. Not silently deferred in a plan doc that retires at write-docs. **W1 closed.**

## Gate (all green before done)

`npm run check` · `npm run lint` (biome + eslint + au3/au6/au7/au9/au10/au11/au13/au14 guards; au6 now with `--fixtures` self-test) · `npm run knip:production` · `npm run test` · `npm run test:integration:service`. Evals (`delegation.ts` repointed) are ungated/release-lane; repoint them for honesty, do not gate on them.
